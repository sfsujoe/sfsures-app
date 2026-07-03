/**
 * CalendarScreen
 *
 * The primary view of the reservation system. Renders:
 *   - Reservation occurrences as colored event blocks (each recurrence as a
 *     distinct block — N occurrences for a recurring series, not one merged bar)
 *   - Blackout windows as non-bookable background events (visually distinct,
 *     clicks do nothing)
 *
 * Data strategy:
 *   - All queries use select/filter/orderBy/top → delegates to the Dataverse
 *     server (no client-side filter over a capped batch). This is the shape
 *     conflict-detection and reports will also use.
 *   - Range-based loading: fetches occurrences and blackout windows for a
 *     ±90-day window around today on mount. FullCalendar's datesSet callback
 *     triggers a re-fetch when the user navigates outside that window.
 *
 * Accessibility:
 *   - "New reservation" toolbar button gives a keyboard-operable path to create a
 *     reservation, since FullCalendar's drag-to-select has no keyboard equivalent.
 *     It opens BookingModal with a sensible default slot (no calendar selection
 *     needed), which is exactly the situation a keyboard/screen-reader user is in.
 *   - The event-detail popover is a dialog: focus is trapped while open and
 *     restored to the triggering event on close (useFocusTrap), named by its
 *     visible title via aria-labelledby.
 *
 * FullCalendar packages required (install before running):
 *   npm install @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/interaction
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { DateSelectArg, EventClickArg, DatesSetArg, EventInput } from '@fullcalendar/core'

import { Sfsures_reservationoccurrencesService } from '../generated/services/Sfsures_reservationoccurrencesService'
import { Sfsures_blackoutwindowsService } from '../generated/services/Sfsures_blackoutwindowsService'
import { Sfsures_appusersService } from '../generated/services/Sfsures_appusersService'
import { Office365UsersService } from '../generated/services/Office365UsersService'
import { useTheme } from '../theme/ThemeContext'
import { useCurrentUser } from '../auth/UserContext'
import { BookingModal } from '../booking/BookingModal'
import { useFocusTrap } from '../a11y/useFocusTrap'
import sfsuDefaultLogoUrl from '../assets/sfsu-logo.png?inline'
import styles from './CalendarScreen.module.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OccurrenceRow {
  sfsures_reservationoccurrenceid?: string
  sfsures_name?: string
  sfsures_comments?: string
  sfsures_start?: string
  sfsures_end?: string
  _sfsures_bookingowner_value?: string
  '_sfsures_resource_value@OData.Community.Display.V1.FormattedValue'?: string
  sfsures_recordstatus?: number
}

interface BlackoutRow {
  sfsures_blackoutwindowid?: string
  sfsures_name?: string
  sfsures_start?: string
  sfsures_end?: string
  sfsures_reason?: string
  'sfsures_Resource@OData.Community.Display.V1.FormattedValue'?: string
}

interface ReservationOwnerDetails {
  appUserId: string
  displayName: string
  email: string
  photoUrl: string | null
}

type OwnerLoadStatus = 'idle' | 'loading' | 'ready' | 'unavailable'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toIso(val: string | undefined | null): string {
  if (!val) return ''
  return val
}

/**
 * Default slot for the keyboard "New reservation" path: next top of the hour,
 * one hour long. The user adjusts start/end/resource in the modal.
 */
function nextHourSlot(): { start: Date; end: Date } {
  const start = new Date()
  start.setMinutes(0, 0, 0)
  start.setHours(start.getHours() + 1)
  const end = new Date(start)
  end.setHours(end.getHours() + 1)
  return { start, end }
}

function occurrenceToEvent(row: OccurrenceRow, primaryColor: string): EventInput {
  const resourceName =
    row['_sfsures_resource_value@OData.Community.Display.V1.FormattedValue'] ?? 'Resource'

  return {
    id: row.sfsures_reservationoccurrenceid ?? '',
    title: resourceName,
    start: toIso(row.sfsures_start),
    end: toIso(row.sfsures_end),
    backgroundColor: primaryColor,
    borderColor: primaryColor,
    textColor: '#ffffff',
    extendedProps: {
      ownerId: row._sfsures_bookingowner_value ?? '',
      comments: row.sfsures_comments?.trim() ?? '',
      type: 'occurrence' as const,
      reason: null,
    },
  }
}

function blackoutToEvent(row: BlackoutRow, accentColor: string): EventInput {
  const resourceName =
    row['sfsures_Resource@OData.Community.Display.V1.FormattedValue'] ?? 'Maintenance'

  return {
    id: `blackout-${row.sfsures_blackoutwindowid ?? ''}`,
    title: `🚫 ${resourceName}`,
    start: toIso(row.sfsures_start),
    end: toIso(row.sfsures_end),
    display: 'background',
    backgroundColor: `${accentColor}40`,
    extendedProps: {
      owner: null,
      type: 'blackout' as const,
      reason: row.sfsures_reason ?? '',
    },
  }
}

function initialsFor(displayName: string | undefined, email: string | undefined): string {
  const source = (displayName || email?.split('@')[0] || '').trim()
  if (!source) return 'SF'

  const parts = source.split(/[\s._-]+/).filter(Boolean)
  const first = parts[0]?.[0] ?? ''
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : parts[0]?.[1] ?? ''

  return `${first}${second}`.toUpperCase() || 'SF'
}

function normalizeProfilePhotoSrc(photo: string | undefined | null, contentType?: string): string | null {
  const trimmed = photo?.trim()
  if (!trimmed) return null

  if (/^(data:|blob:|https?:)/i.test(trimmed)) {
    return trimmed
  }

  return `data:${contentType || 'image/jpeg'};base64,${trimmed}`
}

async function loadTenantProfilePhotoSrc(userId: string): Promise<string | null> {
  const metadata = await Office365UsersService.UserPhotoMetadata(userId)

  if (metadata.data?.HasPhoto === false) {
    return null
  }

  const photo = await Office365UsersService.UserPhoto_V2(userId)
  return normalizeProfilePhotoSrc(photo.data, metadata.data?.ContentType)
}

function reservationOwnerIdFor(event: EventInput | null): string {
  const ownerId = event?.extendedProps?.ownerId
  return typeof ownerId === 'string' ? ownerId : ''
}

function reservationCommentsFor(event: EventInput | null): string {
  const comments = event?.extendedProps?.comments
  return typeof comments === 'string' ? comments.trim() : ''
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CalendarScreen() {
  const { theme } = useTheme()
  const currentUser = useCurrentUser()
  const calendarRef = useRef<FullCalendar>(null)

  const [events, setEvents] = useState<EventInput[]>([])
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedEvent, setSelectedEvent] = useState<EventInput | null>(null)
  const [activeLogoUrl, setActiveLogoUrl] = useState(theme.logoUrl || sfsuDefaultLogoUrl)
  const [logoLoadFailed, setLogoLoadFailed] = useState(false)
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null)
  const [profilePhotoUnavailable, setProfilePhotoUnavailable] = useState(false)
  const [selectedOwnerDetails, setSelectedOwnerDetails] = useState<ReservationOwnerDetails | null>(null)
  const [selectedOwnerStatus, setSelectedOwnerStatus] = useState<OwnerLoadStatus>('idle')

  // Reservation modal state — non-null when the modal is open.
  const [bookingSlot, setBookingSlot] = useState<{ start: Date; end: Date } | null>(null)

  // Focus trap for the event-detail popover (active only while it is open).
  const popoverRef = useRef<HTMLDivElement>(null)
  useFocusTrap(popoverRef, !!selectedEvent)

  // Track the loaded date range so we don't re-fetch unnecessarily.
  const loadedRangeRef = useRef<{ start: Date; end: Date } | null>(null)
  const ownerDetailsCacheRef = useRef<Map<string, ReservationOwnerDetails>>(new Map())

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  useEffect(() => {
    setActiveLogoUrl(theme.logoUrl || sfsuDefaultLogoUrl)
    setLogoLoadFailed(false)
  }, [theme.logoUrl])

  const handleLogoError = useCallback(() => {
    if (activeLogoUrl !== sfsuDefaultLogoUrl) {
      console.warn('Configured logo failed to load; using bundled default logo:', activeLogoUrl)
      setActiveLogoUrl(sfsuDefaultLogoUrl)
      return
    }

    console.warn('Bundled default logo failed to load.')
    setLogoLoadFailed(true)
  }, [activeLogoUrl])

  useEffect(() => {
    const photoLookupId = currentUser?.userPrincipalName || currentUser?.email

    if (!photoLookupId) {
      return
    }

    const userPhotoId = photoLookupId
    let cancelled = false

    async function loadProfilePhoto() {
      setProfilePhotoUrl(null)
      setProfilePhotoUnavailable(false)

      try {
        const src = await loadTenantProfilePhotoSrc(userPhotoId)

        if (!cancelled) {
          setProfilePhotoUrl(src)
          setProfilePhotoUnavailable(!src)
        }
      } catch (err) {
        console.warn('Tenant profile photo could not be loaded:', err)
        if (!cancelled) {
          setProfilePhotoUrl(null)
          setProfilePhotoUnavailable(true)
        }
      }
    }

    loadProfilePhoto()

    return () => {
      cancelled = true
    }
  }, [currentUser?.email, currentUser?.userPrincipalName])

  useEffect(() => {
    if (selectedEvent?.extendedProps?.type !== 'occurrence') {
      setSelectedOwnerDetails(null)
      setSelectedOwnerStatus('idle')
      return
    }

    const appUserId = reservationOwnerIdFor(selectedEvent)

    if (!appUserId) {
      setSelectedOwnerDetails(null)
      setSelectedOwnerStatus('unavailable')
      return
    }

    const cachedOwner = ownerDetailsCacheRef.current.get(appUserId)

    if (cachedOwner) {
      setSelectedOwnerDetails(cachedOwner)
      setSelectedOwnerStatus('ready')
      return
    }

    let cancelled = false

    async function loadSelectedOwnerDetails() {
      setSelectedOwnerDetails(null)
      setSelectedOwnerStatus('loading')

      try {
        const appUserResult = await Sfsures_appusersService.get(appUserId, {
          select: ['sfsures_appuserid', 'sfsures_displayname', 'sfsures_email'],
        })
        const appUser = appUserResult.data

        if (!appUser) {
          if (!cancelled) {
            setSelectedOwnerStatus('unavailable')
          }
          return
        }

        let displayName = appUser.sfsures_displayname?.trim() ?? ''
        let email = appUser.sfsures_email?.trim() ?? ''
        let tenantLookupId = email

        if (tenantLookupId) {
          try {
            const tenantProfile = await Office365UsersService.UserProfile_V2(
              tenantLookupId,
              'displayName,mail,userPrincipalName'
            )

            displayName = tenantProfile.data?.displayName?.trim() || displayName
            email =
              tenantProfile.data?.mail?.trim() ||
              tenantProfile.data?.userPrincipalName?.trim() ||
              email
            tenantLookupId = tenantProfile.data?.userPrincipalName?.trim() || email || tenantLookupId
          } catch (err) {
            console.warn('Reservation owner tenant profile could not be loaded:', err)
          }
        }

        let photoUrl: string | null = null

        if (tenantLookupId) {
          try {
            photoUrl = await loadTenantProfilePhotoSrc(tenantLookupId)
          } catch (err) {
            console.warn('Reservation owner tenant profile photo could not be loaded:', err)
          }
        }

        const ownerDetails: ReservationOwnerDetails = {
          appUserId,
          displayName: displayName || 'Reservation owner',
          email,
          photoUrl,
        }

        ownerDetailsCacheRef.current.set(appUserId, ownerDetails)

        if (!cancelled) {
          setSelectedOwnerDetails(ownerDetails)
          setSelectedOwnerStatus('ready')
        }
      } catch (err) {
        console.warn('Reservation owner App User row could not be loaded:', err)
        if (!cancelled) {
          setSelectedOwnerDetails(null)
          setSelectedOwnerStatus('unavailable')
        }
      }
    }

    loadSelectedOwnerDetails()

    return () => {
      cancelled = true
    }
  }, [selectedEvent])

  const loadRange = useCallback(
    async (rangeStart: Date, rangeEnd: Date) => {
      setLoadStatus('loading')
      setErrorMessage('')

      const startIso = rangeStart.toISOString().split('.')[0] + 'Z'
      const endIso = rangeEnd.toISOString().split('.')[0] + 'Z'

      try {
        const [occResult, blackoutResult] = await Promise.all([
          Sfsures_reservationoccurrencesService.getAll({
            select: [
              'sfsures_reservationoccurrenceid',
              'sfsures_name',
              'sfsures_comments',
              'sfsures_start',
              'sfsures_end',
              'sfsures_recordstatus',
              '_sfsures_resource_value',
              '_sfsures_bookingowner_value',
            ],
            filter:
              `sfsures_recordstatus eq 997330000` +
              ` and sfsures_start lt ${endIso}` +
              ` and sfsures_end gt ${startIso}`,
            orderBy: ['sfsures_start asc'],
            top: 500,
          }),
          Sfsures_blackoutwindowsService.getAll({
            select: [
              'sfsures_blackoutwindowid',
              'sfsures_name',
              'sfsures_start',
              'sfsures_end',
              'sfsures_reason',
            ],
            filter:
              `sfsures_start lt ${endIso}` +
              ` and sfsures_end gt ${startIso}`,
            orderBy: ['sfsures_start asc'],
            top: 200,
          }),
        ])

        const occEvents = (occResult.data ?? []).map((row) =>
          occurrenceToEvent(row as OccurrenceRow, theme.primaryColor)
        )

        const blackoutEvents = (blackoutResult.data ?? []).map((row) =>
          blackoutToEvent(row as BlackoutRow, theme.accentColor)
        )

        setEvents([...occEvents, ...blackoutEvents])
        loadedRangeRef.current = { start: rangeStart, end: rangeEnd }
        setLoadStatus('ready')
      } catch (err) {
        console.error('Calendar load failed:', err)
        setErrorMessage(err instanceof Error ? err.message : String(err))
        setLoadStatus('error')
      }
    },
    [theme.primaryColor, theme.accentColor]
  )

  // Initial load: ±90 days around today.
  useEffect(() => {
    const now = new Date()
    const start = new Date(now)
    start.setDate(start.getDate() - 90)
    const end = new Date(now)
    end.setDate(end.getDate() + 90)
    loadRange(start, end)
  }, [loadRange])

  // Re-fetch when the user navigates outside the loaded range.
  const handleDatesSet = useCallback(
    (arg: DatesSetArg) => {
      const loaded = loadedRangeRef.current
      if (!loaded) return
      if (arg.start < loaded.start || arg.end > loaded.end) {
        const newStart = new Date(arg.start)
        newStart.setDate(newStart.getDate() - 30)
        const newEnd = new Date(arg.end)
        newEnd.setDate(newEnd.getDate() + 30)
        loadRange(newStart, newEnd)
      }
    },
    [loadRange]
  )

  // ---------------------------------------------------------------------------
  // Refresh helper (called after a successful reservation)
  // ---------------------------------------------------------------------------

  const refreshCalendar = useCallback(() => {
    const loaded = loadedRangeRef.current
    if (loaded) {
      loadRange(loaded.start, loaded.end)
    }
  }, [loadRange])

  // ---------------------------------------------------------------------------
  // Interaction handlers
  // ---------------------------------------------------------------------------

  const handleEventClick = useCallback((arg: EventClickArg) => {
    if (arg.event.extendedProps.type === 'blackout') {
      setSelectedEvent({
        id: arg.event.id,
        title: arg.event.title,
        start: arg.event.startStr,
        end: arg.event.endStr,
        extendedProps: arg.event.extendedProps,
      })
      return
    }
    setSelectedEvent({
      id: arg.event.id,
      title: arg.event.title,
      start: arg.event.startStr,
      end: arg.event.endStr,
      extendedProps: arg.event.extendedProps,
    })
  }, [])

  const handleDateSelect = useCallback((arg: DateSelectArg) => {
    // Open the reservation modal with the selected time range.
    setBookingSlot({ start: arg.start, end: arg.end })
    // Clear the FullCalendar highlight.
    calendarRef.current?.getApi().unselect()
  }, [])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const selectedEventComments = reservationCommentsFor(selectedEvent)

  return (
    <div className={styles.shell}>
      {/* Header */}
      <header className={styles.header} style={{ backgroundColor: theme.primaryColor }}>
        <div className={styles.headerInner}>
          <a
            href="https://www.sfsu.edu/"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.logoLink}
            aria-label="Open SFSU home page in a new tab"
          >
            {activeLogoUrl && !logoLoadFailed ? (
              <img
                src={activeLogoUrl}
                alt=""
                aria-hidden="true"
                className={styles.logo}
                title={
                  activeLogoUrl === sfsuDefaultLogoUrl && theme.logoUrl !== sfsuDefaultLogoUrl
                    ? 'Using default logo because the configured logo did not load.'
                    : undefined
                }
                onError={handleLogoError}
              />
            ) : (
              <span className={styles.logoFallback}>Logo unavailable</span>
            )}
          </a>
          <h1 className={styles.headerTitle}>SFSU Resource Reservations</h1>
          <div className={styles.profileSlot}>
            {profilePhotoUrl && !profilePhotoUnavailable ? (
              <img
                src={profilePhotoUrl}
                alt={`${currentUser?.displayName || 'Signed-in user'} profile photo`}
                className={styles.profilePhoto}
                onError={() => {
                  console.warn('Tenant profile photo response could not be rendered.')
                  setProfilePhotoUrl(null)
                  setProfilePhotoUnavailable(true)
                }}
              />
            ) : (
              <div
                className={styles.profileFallback}
                role="img"
                aria-label={`${currentUser?.displayName || 'Signed-in user'} profile photo unavailable`}
                title={currentUser?.displayName || currentUser?.email || 'Signed-in user'}
              >
                {initialsFor(currentUser?.displayName, currentUser?.email)}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Calendar area */}
      <main className={styles.main}>
        {loadStatus === 'error' && (
          <div className={styles.banner} style={{ borderColor: theme.primaryColor }}>
            <strong>Could not load reservations.</strong>{' '}
            {errorMessage || 'Check your connection and reload.'}
          </div>
        )}

        {loadStatus === 'loading' && events.length === 0 && (
          <div className={styles.loadingOverlay}>
            <div
              className={styles.spinner}
              style={{ borderTopColor: theme.primaryColor }}
            />
          </div>
        )}

        <div className={styles.calendarWrap}>
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            customButtons={{
              newBooking: {
                text: 'New reservation',
                // Keyboard-operable path: opens the modal with a default slot,
                // no calendar selection required.
                click: () => setBookingSlot(nextHourSlot()),
              },
            }}
            headerToolbar={{
              left: 'newBooking prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay',
            }}
            buttonIcons={false}
            buttonText={{
              prev: '◀',
              next: '▶',
              today: 'Today',
              month: 'Month',
              week: 'Week',
              day: 'Day',
            }}
            events={events}
            selectable={true}
            selectMirror={true}
            dayMaxEvents={true}
            nowIndicator={true}
            height="100%"
            slotMinTime="06:00:00"
            slotMaxTime="22:00:00"
            select={handleDateSelect}
            eventClick={handleEventClick}
            datesSet={handleDatesSet}
          />
        </div>
      </main>

      {/* Event detail popover */}
      {selectedEvent && (
        <div
          className={styles.popoverBackdrop}
          onClick={() => setSelectedEvent(null)}
        >
          <div
            ref={popoverRef}
            className={styles.popover}
            style={{ borderTopColor: theme.primaryColor }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="event-popover-title"
            tabIndex={-1}
          >
            <button
              className={styles.popoverClose}
              onClick={() => setSelectedEvent(null)}
              aria-label="Close"
            >
              ×
            </button>

            {selectedEvent.extendedProps?.type === 'blackout' ? (
              <>
                <p className={styles.popoverLabel}>Maintenance / Blackout window</p>
                <h2 id="event-popover-title" className={styles.popoverTitle}>
                  {String(selectedEvent.title).replace('🚫 ', '')}
                </h2>
                <p className={styles.popoverDetail}>
                  <strong>Reason:</strong>{' '}
                  {selectedEvent.extendedProps.reason || 'Not specified'}
                </p>
                <p className={styles.popoverDetail}>
                  {formatEventRange(
                    selectedEvent.start as string,
                    selectedEvent.end as string
                  )}
                </p>
              </>
            ) : (
              <>
                <p
                  className={styles.popoverLabel}
                  style={{ color: theme.primaryColor }}
                >
                  Reservation
                </p>
                <h2 id="event-popover-title" className={styles.popoverTitle}>
                  {selectedEvent.title as string}
                </h2>
                <p className={styles.popoverDetail}>
                  {formatEventRange(
                    selectedEvent.start as string,
                    selectedEvent.end as string
                  )}
                </p>
                {selectedEventComments && (
                  <section className={styles.commentsSection} aria-label="Reservation comments">
                    <p className={styles.commentsLabel}>Comments</p>
                    <p className={styles.commentsText}>{selectedEventComments}</p>
                  </section>
                )}
                <section className={styles.ownerSection} aria-label="Reservation owner">
                  <div className={styles.ownerAvatarWrap} aria-hidden="true">
                    {selectedOwnerStatus === 'ready' && selectedOwnerDetails?.photoUrl ? (
                      <img
                        src={selectedOwnerDetails.photoUrl}
                        alt=""
                        className={styles.ownerPhoto}
                        onError={() => {
                          setSelectedOwnerDetails((current) => {
                            if (!current) return current
                            const next = { ...current, photoUrl: null }
                            ownerDetailsCacheRef.current.set(current.appUserId, next)
                            return next
                          })
                        }}
                      />
                    ) : (
                      <div
                        className={
                          selectedOwnerStatus === 'loading'
                            ? `${styles.ownerAvatarFallback} ${styles.ownerAvatarLoading}`
                            : styles.ownerAvatarFallback
                        }
                      >
                        {selectedOwnerStatus === 'ready' && selectedOwnerDetails
                          ? initialsFor(selectedOwnerDetails.displayName, selectedOwnerDetails.email)
                          : ''}
                      </div>
                    )}
                  </div>
                  <div className={styles.ownerText}>
                    <p className={styles.ownerLabel}>Reserved by</p>
                    {selectedOwnerStatus === 'loading' ? (
                      <p className={styles.ownerMuted}>Loading owner details</p>
                    ) : selectedOwnerStatus === 'ready' && selectedOwnerDetails ? (
                      <>
                        <p className={styles.ownerName}>{selectedOwnerDetails.displayName}</p>
                        {selectedOwnerDetails.email ? (
                          <a
                            className={styles.ownerEmail}
                            href={`mailto:${selectedOwnerDetails.email}`}
                          >
                            {selectedOwnerDetails.email}
                          </a>
                        ) : (
                          <p className={styles.ownerMuted}>Email unavailable</p>
                        )}
                      </>
                    ) : (
                      <p className={styles.ownerMuted}>Owner details unavailable</p>
                    )}
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      )}

      {/* Reservation modal */}
      {bookingSlot && (
        <BookingModal
          start={bookingSlot.start}
          end={bookingSlot.end}
          onClose={() => setBookingSlot(null)}
          onBooked={() => {
            refreshCalendar()
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function formatEventRange(start: string, end: string): string {
  if (!start) return ''
  const s = new Date(start)
  const e = end ? new Date(end) : null

  const dateStr = s.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
  const startTime = s.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
  const endTime = e
    ? e.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : ''

  return endTime
    ? `${dateStr} · ${startTime} – ${endTime}`
    : `${dateStr} · ${startTime}`
}
