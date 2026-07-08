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
import { Sfsures_reservationseriesesService } from '../generated/services/Sfsures_reservationseriesesService'
import { Sfsures_blackoutwindowsService } from '../generated/services/Sfsures_blackoutwindowsService'
import { Sfsures_appusersService } from '../generated/services/Sfsures_appusersService'
import { Sfsures_resourcesService } from '../generated/services/Sfsures_resourcesService'
import { Office365UsersService } from '../generated/services/Office365UsersService'
import type { Sfsures_resourcessfsures_calendarcolor } from '../generated/models/Sfsures_resourcesModel'
import { useTheme } from '../theme/ThemeContext'
import {
  resourceColorByValue,
  resourceColorForBackground,
  type ResourceColorOption,
} from '../theme/resourceColors'
import { useCurrentUser } from '../auth/UserContext'
import { BookingModal, type EditableReservation, type EditableReservationSeries } from '../booking/BookingModal'
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
  _sfsures_resource_value?: string
  _sfsures_bookingowner_value?: string
  _sfsures_series_value?: string
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

interface ResourceRow {
  sfsures_resourceid?: string
  sfsures_calendarcolor?: Sfsures_resourcessfsures_calendarcolor
}

interface ReservationOwnerDetails {
  appUserId: string
  displayName: string
  email: string
  photoUrl: string | null
}

type OwnerLoadStatus = 'idle' | 'loading' | 'ready' | 'unavailable'
type DeleteConfirmMode = 'occurrence' | 'series'

const RECORD_STATUS_ACTIVE = 997330000
const RECORD_STATUS_CANCELLED = 997330001

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

function occurrenceToEvent(
  row: OccurrenceRow,
  resourceColorsById: Map<string, ResourceColorOption>,
  fallbackColor: ResourceColorOption
): EventInput {
  const resourceName =
    row['_sfsures_resource_value@OData.Community.Display.V1.FormattedValue'] ?? 'Resource'
  const resourceColor =
    resourceColorsById.get(row._sfsures_resource_value ?? '') ?? fallbackColor

  return {
    id: row.sfsures_reservationoccurrenceid ?? '',
    title: resourceName,
    start: toIso(row.sfsures_start),
    end: toIso(row.sfsures_end),
    backgroundColor: resourceColor.backgroundColor,
    borderColor: resourceColor.backgroundColor,
    textColor: resourceColor.textColor,
    extendedProps: {
      ownerId: row._sfsures_bookingowner_value ?? '',
      resourceId: row._sfsures_resource_value ?? '',
      seriesId: row._sfsures_series_value ?? '',
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

function reservationResourceIdFor(event: EventInput | null): string {
  const resourceId = event?.extendedProps?.resourceId
  return typeof resourceId === 'string' ? resourceId : ''
}

function reservationCommentsFor(event: EventInput | null): string {
  const comments = event?.extendedProps?.comments
  return typeof comments === 'string' ? comments.trim() : ''
}

function reservationSeriesIdFor(event: EventInput | null): string {
  const seriesId = event?.extendedProps?.seriesId
  return typeof seriesId === 'string' ? seriesId : ''
}

function seriesFrequencyFromDataverse(value: unknown): EditableReservationSeries['frequency'] | null {
  const numericValue = Number(value)
  if (numericValue === 997330000) return 'daily'
  if (numericValue === 997330001) return 'weekly'
  if (numericValue === 997330002) return 'monthly'
  return null
}

function seriesEndModeFromDataverse(value: unknown): EditableReservationSeries['endMode'] {
  return Number(value) === 997330000 ? 'until' : 'count'
}

function seriesWeekdaysFromText(value: string | undefined | null): EditableReservationSeries['weekdays'] {
  const valid = new Set<EditableReservationSeries['weekdays'][number]>([
    'Sun',
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat',
  ])

  return (value ?? '')
    .split(',')
    .map((day) => day.trim())
    .filter((day): day is EditableReservationSeries['weekdays'][number] =>
      valid.has(day as EditableReservationSeries['weekdays'][number])
    )
}

function dateInputFromIso(value: string | undefined | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CalendarScreenProps {
  onOpenAdmin?: () => void
}

export function CalendarScreen({ onOpenAdmin }: CalendarScreenProps) {
  const { theme } = useTheme()
  const currentUser = useCurrentUser()
  const calendarRef = useRef<FullCalendar>(null)

  const [events, setEvents] = useState<EventInput[]>([])
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedEvent, setSelectedEvent] = useState<EventInput | null>(null)
  const [editingReservation, setEditingReservation] = useState<
    { start: Date; end: Date; reservation: EditableReservation } | null
  >(null)
  const [editingSeries, setEditingSeries] = useState<
    { start: Date; end: Date; series: EditableReservationSeries } | null
  >(null)
  const [deleteConfirmMode, setDeleteConfirmMode] = useState<DeleteConfirmMode | null>(null)
  const [deletingReservation, setDeletingReservation] = useState(false)
  const [loadingSeriesEdit, setLoadingSeriesEdit] = useState(false)
  const [reservationActionError, setReservationActionError] = useState('')
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
        const [occResult, blackoutResult, resourceResult] = await Promise.all([
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
              '_sfsures_series_value',
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
          Sfsures_resourcesService.getAll({
            select: ['sfsures_resourceid', 'sfsures_calendarcolor'],
            filter: `sfsures_recordstatus eq ${RECORD_STATUS_ACTIVE}`,
            orderBy: ['sfsures_name asc'],
            top: 500,
          }),
        ])

        const fallbackResourceColor = resourceColorForBackground(theme.primaryColor)
        const resourceColorsById = new Map<string, ResourceColorOption>()

        for (const row of (resourceResult.data ?? []) as ResourceRow[]) {
          const resourceId = row.sfsures_resourceid
          const resourceColor = resourceColorByValue(row.sfsures_calendarcolor)

          if (resourceId && resourceColor) {
            resourceColorsById.set(resourceId, resourceColor)
          }
        }

        const occEvents = (occResult.data ?? []).map((row) =>
          occurrenceToEvent(row as OccurrenceRow, resourceColorsById, fallbackResourceColor)
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

  const closeReservationInfo = useCallback(() => {
    setSelectedEvent(null)
    setDeleteConfirmMode(null)
    setDeletingReservation(false)
    setLoadingSeriesEdit(false)
    setReservationActionError('')
  }, [])

  // ---------------------------------------------------------------------------
  // Interaction handlers
  // ---------------------------------------------------------------------------

  const handleEventClick = useCallback((arg: EventClickArg) => {
    setDeleteConfirmMode(null)
    setDeletingReservation(false)
    setLoadingSeriesEdit(false)
    setReservationActionError('')

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

  const handleEditSelectedReservation = useCallback(() => {
    if (!selectedEvent || selectedEvent.extendedProps?.type !== 'occurrence') {
      return
    }

    const ownerId = reservationOwnerIdFor(selectedEvent)
    if (!currentUser?.isAppAdmin && ownerId !== currentUser?.appUserId) {
      setReservationActionError('Only the reservation owner or an app admin can edit this reservation.')
      return
    }

    const resourceId = reservationResourceIdFor(selectedEvent)
    const startDate = new Date(selectedEvent.start as string)
    const endDate = new Date(selectedEvent.end as string)

    if (!selectedEvent.id || !resourceId || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      setReservationActionError('This reservation could not be opened for editing.')
      return
    }

    setEditingReservation({
      start: startDate,
      end: endDate,
      reservation: {
        id: selectedEvent.id,
        resourceId,
        comments: reservationCommentsFor(selectedEvent),
      },
    })
    closeReservationInfo()
  }, [closeReservationInfo, currentUser?.appUserId, currentUser?.isAppAdmin, selectedEvent])

  const handleEditSelectedSeries = useCallback(async () => {
    if (!selectedEvent || selectedEvent.extendedProps?.type !== 'occurrence') {
      return
    }

    const seriesId = reservationSeriesIdFor(selectedEvent)
    if (!seriesId) {
      setReservationActionError('This reservation is not part of a recurring series.')
      return
    }

    const ownerId = reservationOwnerIdFor(selectedEvent)
    if (!currentUser?.isAppAdmin && ownerId !== currentUser?.appUserId) {
      setReservationActionError('Only the reservation owner or an app admin can edit this series.')
      return
    }

    setLoadingSeriesEdit(true)
    setReservationActionError('')

    try {
      const [seriesResult, occurrenceResult] = await Promise.all([
        Sfsures_reservationseriesesService.get(seriesId, {
          select: [
            'sfsures_reservationseriesid',
            'sfsures_comments',
            'sfsures_frequency',
            'sfsures_interval',
            'sfsures_daysofweek',
            'sfsures_endmode',
            'sfsures_occurrencecount',
            'sfsures_untildate',
            '_sfsures_resource_value',
            '_sfsures_bookingowner_value',
          ],
        }),
        Sfsures_reservationoccurrencesService.getAll({
          select: ['sfsures_reservationoccurrenceid', 'sfsures_start', 'sfsures_end'],
          filter:
            `_sfsures_series_value eq ${seriesId}` +
            ` and sfsures_recordstatus eq ${RECORD_STATUS_ACTIVE}`,
          orderBy: ['sfsures_start asc'],
          top: 500,
        }),
      ])

      const series = seriesResult.data
      if (!series) {
        setReservationActionError('This recurring series could not be loaded for editing.')
        return
      }

      const frequency = seriesFrequencyFromDataverse(series.sfsures_frequency)
      if (!frequency) {
        setReservationActionError('This recurring series has an unsupported repeat pattern.')
        return
      }

      const activeOccurrences = (occurrenceResult.data ?? []).filter(
        (occurrence) =>
          occurrence.sfsures_reservationoccurrenceid &&
          occurrence.sfsures_start &&
          occurrence.sfsures_end
      )

      if (activeOccurrences.length === 0) {
        setReservationActionError('This recurring series has no active occurrences to edit.')
        return
      }

      const firstOccurrence = activeOccurrences[0]
      const modalStart = new Date(firstOccurrence.sfsures_start as string)
      const modalEnd = new Date(firstOccurrence.sfsures_end as string)

      if (isNaN(modalStart.getTime()) || isNaN(modalEnd.getTime())) {
        setReservationActionError('This recurring series has an invalid first occurrence.')
        return
      }

      const resourceId = series._sfsures_resource_value ?? reservationResourceIdFor(selectedEvent)
      const bookingOwnerId = series._sfsures_bookingowner_value ?? ownerId

      if (!resourceId || !bookingOwnerId) {
        setReservationActionError('This recurring series is missing resource or owner details.')
        return
      }

      const activeOccurrenceIds = activeOccurrences
        .map((occurrence) => occurrence.sfsures_reservationoccurrenceid)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)

      setEditingSeries({
        start: modalStart,
        end: modalEnd,
        series: {
          id: seriesId,
          resourceId,
          bookingOwnerId,
          comments: series.sfsures_comments?.trim() ?? reservationCommentsFor(selectedEvent),
          frequency,
          interval: Math.max(1, series.sfsures_interval ?? 1),
          weekdays: seriesWeekdaysFromText(series.sfsures_daysofweek),
          endMode: seriesEndModeFromDataverse(series.sfsures_endmode),
          occurrenceCount: Math.max(2, series.sfsures_occurrencecount ?? activeOccurrenceIds.length),
          untilDate: dateInputFromIso(series.sfsures_untildate),
          activeOccurrenceIds,
        },
      })
      closeReservationInfo()
    } catch (err) {
      console.error('Reservation series edit load failed:', err)
      const detail = err instanceof Error ? err.message : 'Dataverse rejected the request.'
      setReservationActionError(
        `Edit series failed: ${detail} Only the reservation owner or an admin can edit this series.`
      )
    } finally {
      setLoadingSeriesEdit(false)
    }
  }, [
    closeReservationInfo,
    currentUser?.appUserId,
    currentUser?.isAppAdmin,
    selectedEvent,
  ])

  const handleDeleteSelectedReservation = useCallback(async () => {
    if (!selectedEvent || selectedEvent.extendedProps?.type !== 'occurrence') {
      return
    }

    const ownerId = reservationOwnerIdFor(selectedEvent)
    if (!currentUser?.isAppAdmin && ownerId !== currentUser?.appUserId) {
      setReservationActionError('Only the reservation owner or an app admin can delete this reservation.')
      return
    }

    if (!selectedEvent.id) {
      setReservationActionError('This reservation could not be deleted.')
      return
    }

    setDeletingReservation(true)
    setReservationActionError('')

    try {
      await Sfsures_reservationoccurrencesService.update(
        selectedEvent.id,
        {
          sfsures_recordstatus: RECORD_STATUS_CANCELLED,
        } as unknown as Parameters<typeof Sfsures_reservationoccurrencesService.update>[1]
      )

      closeReservationInfo()
      refreshCalendar()
    } catch (err) {
      console.error('Reservation delete failed:', err)
      const detail = err instanceof Error ? err.message : 'Dataverse rejected the update.'
      setReservationActionError(
        `Delete failed: ${detail} Only the reservation owner or an admin can delete this reservation.`
      )
    } finally {
      setDeletingReservation(false)
    }
  }, [
    closeReservationInfo,
    currentUser?.appUserId,
    currentUser?.isAppAdmin,
    refreshCalendar,
    selectedEvent,
  ])

  const handleDeleteSelectedSeries = useCallback(async () => {
    if (!selectedEvent || selectedEvent.extendedProps?.type !== 'occurrence') {
      return
    }

    const seriesId = reservationSeriesIdFor(selectedEvent)
    if (!seriesId) {
      setReservationActionError('This reservation is not part of a recurring series.')
      return
    }

    const ownerId = reservationOwnerIdFor(selectedEvent)
    if (!currentUser?.isAppAdmin && ownerId !== currentUser?.appUserId) {
      setReservationActionError('Only the reservation owner or an app admin can delete this series.')
      return
    }

    setDeletingReservation(true)
    setReservationActionError('')

    try {
      const occurrenceResult = await Sfsures_reservationoccurrencesService.getAll({
        select: ['sfsures_reservationoccurrenceid'],
        filter:
          `_sfsures_series_value eq ${seriesId}` +
          ` and sfsures_recordstatus eq ${RECORD_STATUS_ACTIVE}`,
        top: 500,
      })

      const activeOccurrenceIds = (occurrenceResult.data ?? [])
        .map((row) => row.sfsures_reservationoccurrenceid)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)

      await Promise.all(
        activeOccurrenceIds.map((occurrenceId) =>
          Sfsures_reservationoccurrencesService.update(
            occurrenceId,
            {
              sfsures_recordstatus: RECORD_STATUS_CANCELLED,
            } as unknown as Parameters<typeof Sfsures_reservationoccurrencesService.update>[1]
          )
        )
      )

      await Sfsures_reservationseriesesService.update(
        seriesId,
        {
          sfsures_recordstatus: RECORD_STATUS_CANCELLED,
        } as unknown as Parameters<typeof Sfsures_reservationseriesesService.update>[1]
      )

      closeReservationInfo()
      refreshCalendar()
    } catch (err) {
      console.error('Reservation series delete failed:', err)
      const detail = err instanceof Error ? err.message : 'Dataverse rejected the update.'
      setReservationActionError(
        `Delete series failed: ${detail} Only the reservation owner or an admin can delete this series.`
      )
    } finally {
      setDeletingReservation(false)
    }
  }, [
    closeReservationInfo,
    currentUser?.appUserId,
    currentUser?.isAppAdmin,
    refreshCalendar,
    selectedEvent,
  ])

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
  const selectedEventSeriesId = reservationSeriesIdFor(selectedEvent)
  const selectedEventOwnerId = reservationOwnerIdFor(selectedEvent)
  const selectedEventIsOwnedByCurrentUser =
    !!selectedEventOwnerId && selectedEventOwnerId === currentUser?.appUserId
  const selectedEventCanManage =
    selectedEvent?.extendedProps?.type === 'occurrence' &&
    (selectedEventIsOwnedByCurrentUser || currentUser?.isAppAdmin === true)
  const selectedEventDeleteLabel = selectedEventSeriesId ? 'Delete occurrence' : 'Delete reservation'
  const deleteConfirmTitle =
    deleteConfirmMode === 'series'
      ? 'Delete entire series?'
      : selectedEventSeriesId
        ? 'Delete this occurrence?'
        : 'Delete this reservation?'
  const deleteConfirmText =
    deleteConfirmMode === 'series'
      ? 'All active occurrences in this series will be removed from the active calendar.'
      : 'It will be removed from the active calendar.'
  const deleteConfirmActionLabel =
    deleteConfirmMode === 'series' ? 'Delete series' : selectedEventDeleteLabel

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
            {onOpenAdmin && (
              <button
                type="button"
                className={styles.adminButton}
                onClick={onOpenAdmin}
              >
                Admin
              </button>
            )}
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
            slotMinTime="00:00:00"
            slotMaxTime="24:00:00"
            scrollTime="08:00:00"
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
          onClick={closeReservationInfo}
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
              onClick={closeReservationInfo}
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
                {selectedEventSeriesId && (
                  <p className={styles.seriesBadge}>Recurring series</p>
                )}
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
                {selectedEventCanManage && (
                  <section className={styles.actionSection} aria-label="Reservation actions">
                    {reservationActionError && (
                      <p className={styles.actionError} role="alert">
                        {reservationActionError}
                      </p>
                    )}
                    {deleteConfirmMode ? (
                      <div className={styles.deleteConfirm}>
                        <p className={styles.deleteTitle}>{deleteConfirmTitle}</p>
                        <p className={styles.deleteText}>{deleteConfirmText}</p>
                        {!selectedEventIsOwnedByCurrentUser && currentUser?.isAppAdmin && (
                          <p className={styles.deleteText}>
                            You are deleting this as an app admin.
                          </p>
                        )}
                        <div className={styles.actionRow}>
                          <button
                            className={styles.secondaryAction}
                            onClick={() => {
                              setDeleteConfirmMode(null)
                              setReservationActionError('')
                            }}
                            disabled={deletingReservation}
                          >
                            Keep
                          </button>
                          <button
                            className={styles.dangerAction}
                            onClick={
                              deleteConfirmMode === 'series'
                                ? handleDeleteSelectedSeries
                                : handleDeleteSelectedReservation
                            }
                            disabled={deletingReservation}
                          >
                            {deletingReservation ? 'Deleting...' : deleteConfirmActionLabel}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.actionRow}>
                        <button
                          className={styles.secondaryAction}
                          onClick={handleEditSelectedReservation}
                          disabled={loadingSeriesEdit}
                        >
                          Edit reservation
                        </button>
                        {selectedEventSeriesId && (
                          <button
                            className={styles.secondaryAction}
                            onClick={handleEditSelectedSeries}
                            disabled={loadingSeriesEdit}
                          >
                            {loadingSeriesEdit ? 'Opening series...' : 'Edit series'}
                          </button>
                        )}
                        <button
                          className={styles.dangerGhostAction}
                          onClick={() => {
                            setDeleteConfirmMode('occurrence')
                            setReservationActionError('')
                          }}
                        >
                          {selectedEventDeleteLabel}
                        </button>
                        {selectedEventSeriesId && (
                          <button
                            className={styles.dangerGhostAction}
                            onClick={() => {
                              setDeleteConfirmMode('series')
                              setReservationActionError('')
                            }}
                          >
                            Delete series
                          </button>
                        )}
                      </div>
                    )}
                  </section>
                )}
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

      {editingReservation && (
        <BookingModal
          start={editingReservation.start}
          end={editingReservation.end}
          initialReservation={editingReservation.reservation}
          onClose={() => setEditingReservation(null)}
          onBooked={() => {
            refreshCalendar()
          }}
        />
      )}

      {editingSeries && (
        <BookingModal
          start={editingSeries.start}
          end={editingSeries.end}
          initialSeries={editingSeries.series}
          onClose={() => setEditingSeries(null)}
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
