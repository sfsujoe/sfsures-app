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
 *   - "New booking" toolbar button gives a keyboard-operable path to create a
 *     booking, since FullCalendar's drag-to-select has no keyboard equivalent.
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
import { useTheme } from '../theme/ThemeContext'
import { BookingModal } from '../booking/BookingModal'
import { useFocusTrap } from '../a11y/useFocusTrap'
import sfsuDefaultLogoUrl from '../assets/sfsu-logo.png'
import styles from './CalendarScreen.module.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OccurrenceRow {
  sfsures_reservationoccurrenceid?: string
  sfsures_name?: string
  sfsures_start?: string
  sfsures_end?: string
  '_sfsures_resource_value@OData.Community.Display.V1.FormattedValue'?: string
  '_sfsures_bookingowner_value@OData.Community.Display.V1.FormattedValue'?: string
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toIso(val: string | undefined | null): string {
  if (!val) return ''
  return val
}

/**
 * Default slot for the keyboard "New booking" path: next top of the hour,
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
  const ownerName =
    row['_sfsures_bookingowner_value@OData.Community.Display.V1.FormattedValue'] ?? ''

  return {
    id: row.sfsures_reservationoccurrenceid ?? '',
    title: resourceName,
    start: toIso(row.sfsures_start),
    end: toIso(row.sfsures_end),
    backgroundColor: primaryColor,
    borderColor: primaryColor,
    textColor: '#ffffff',
    extendedProps: {
      owner: ownerName,
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CalendarScreen() {
  const { theme } = useTheme()
  const calendarRef = useRef<FullCalendar>(null)

  const [events, setEvents] = useState<EventInput[]>([])
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedEvent, setSelectedEvent] = useState<EventInput | null>(null)
  const [activeLogoUrl, setActiveLogoUrl] = useState(theme.logoUrl || sfsuDefaultLogoUrl)
  const [logoLoadFailed, setLogoLoadFailed] = useState(false)

  // Booking modal state — non-null when the modal is open.
  const [bookingSlot, setBookingSlot] = useState<{ start: Date; end: Date } | null>(null)

  // Focus trap for the event-detail popover (active only while it is open).
  const popoverRef = useRef<HTMLDivElement>(null)
  useFocusTrap(popoverRef, !!selectedEvent)

  // Track the loaded date range so we don't re-fetch unnecessarily.
  const loadedRangeRef = useRef<{ start: Date; end: Date } | null>(null)

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
  // Refresh helper (called after a successful booking)
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
    // Open the booking modal with the selected time range.
    setBookingSlot({ start: arg.start, end: arg.end })
    // Clear the FullCalendar highlight.
    calendarRef.current?.getApi().unselect()
  }, [])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className={styles.shell}>
      {/* Header */}
      <header className={styles.header} style={{ backgroundColor: theme.primaryColor }}>
        <div className={styles.headerInner}>
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
          <h1 className={styles.headerTitle}>SFSU Resource Reservations</h1>
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
                text: 'New booking',
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
                {selectedEvent.extendedProps?.owner && (
                  <p className={styles.popoverDetail}>
                    <strong>Booked by:</strong> {selectedEvent.extendedProps.owner}
                  </p>
                )}
                <p className={styles.popoverDetail}>
                  {formatEventRange(
                    selectedEvent.start as string,
                    selectedEvent.end as string
                  )}
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Booking modal */}
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
