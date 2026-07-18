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
 *   - Resource visibility is group-based and Resource Type-only. View and Book
 *     permissions show calendar data; individual Resource access rows are ignored.
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

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
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
import { Sfsures_resourcetypesService } from '../generated/services/Sfsures_resourcetypesService'
import { Sfsures_resourceattributevaluesService } from '../generated/services/Sfsures_resourceattributevaluesService'
import { Sfsures_reservationattributevaluesService } from '../generated/services/Sfsures_reservationattributevaluesService'
import { Sfsures_attributedefinitionsService } from '../generated/services/Sfsures_attributedefinitionsService'
import { Office365UsersService } from '../generated/services/Office365UsersService'
import type { Sfsures_resourcessfsures_calendarcolor } from '../generated/models/Sfsures_resourcesModel'
import type { Sfsures_resourceattributevalues } from '../generated/models/Sfsures_resourceattributevaluesModel'
import type { Sfsures_reservationattributevalues } from '../generated/models/Sfsures_reservationattributevaluesModel'
import type { Sfsures_attributedefinitions } from '../generated/models/Sfsures_attributedefinitionsModel'
import { useTheme } from '../theme/ThemeContext'
import {
  resourceColorByValue,
  resourceColorForBackground,
  type ResourceColorOption,
} from '../theme/resourceColors'
import { useCurrentUser } from '../auth/UserContext'
import { loadPermittedResourceTypeIds } from '../auth/resourceTypePermissions'
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
  _sfsures_resource_value?: string
  '_sfsures_resource_value@OData.Community.Display.V1.FormattedValue'?: string
  'sfsures_Resource@OData.Community.Display.V1.FormattedValue'?: string
}

interface ResourceRow {
  sfsures_resourceid?: string
  sfsures_name?: string
  sfsures_description?: string
  sfsures_location?: string
  sfsures_calendarcolor?: Sfsures_resourcessfsures_calendarcolor
  sfsures_resourcephoto?: string
  _sfsures_resourcetype_value?: string
}

interface ResourceTypeOption {
  id: string
  name: string
}

interface CalendarResourceOption {
  id: string
  name: string
  resourceTypeId: string
  resourceTypeName: string
  location: string
  description: string
  photoThumbnailUrl: string | null
}

interface ReservationOwnerDetails {
  appUserId: string
  displayName: string
  email: string
  photoUrl: string | null
}

interface DetailValue {
  id: string
  label: string
  value: string
}

interface ReservationInfoDetails {
  status: 'idle' | 'loading' | 'ready' | 'error'
  resourceAttributes: DetailValue[]
  customFields: DetailValue[]
}

interface ResourceInfoDetails {
  status: 'idle' | 'loading' | 'ready' | 'error'
  resourceAttributes: DetailValue[]
}

interface OwnerLookupResult {
  appUserId: string
  status: 'ready' | 'unavailable'
  details: ReservationOwnerDetails | null
}

type OwnerLoadStatus = 'idle' | 'loading' | 'ready' | 'unavailable'
type DeleteConfirmMode = 'occurrence' | 'series'

const RECORD_STATUS_ACTIVE = 997330000
const RECORD_STATUS_CANCELLED = 997330001
const ATTRIBUTE_APPLIES_TO_RESOURCE = 997330000
const RESOURCE_PHOTO_COLUMN = 'sfsures_resourcephoto'

const RESERVATION_ATTRIBUTE_VALUE_SELECT = [
  'sfsures_reservationattributevalueid',
  '_sfsures_attributedefinition_value',
  '_sfsures_reservationoccurrence_value',
  '_sfsures_reservationseries_value',
  'sfsures_valuetext',
  'sfsures_valuechoice',
  'sfsures_valuenumber',
  'sfsures_valuedatetime',
  'sfsures_valueboolean',
]

const ATTRIBUTE_DEFINITION_LABEL_SELECT = [
  'sfsures_attributedefinitionid',
  'sfsures_name',
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toIso(val: string | undefined | null): string {
  if (!val) return ''
  return val
}

function formatBlackoutUntil(value: string | undefined | null): string {
  if (!value) return 'end time unavailable'
  const date = new Date(value)
  if (isNaN(date.getTime())) return value

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function blackoutDisplayTitle(title: unknown): string {
  return String(title).replace(/^🚫\s*/, '')
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
  resourceTypesByResourceId: Map<string, string>,
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
      resourceTypeId: resourceTypesByResourceId.get(row._sfsures_resource_value ?? '') ?? '',
      seriesId: row._sfsures_series_value ?? '',
      comments: row.sfsures_comments?.trim() ?? '',
      type: 'occurrence' as const,
      reason: null,
    },
  }
}

function blackoutToEvent(
  row: BlackoutRow,
  accentColor: string,
  resourceNamesById: Map<string, string>,
  resourceTypesByResourceId: Map<string, string>
): EventInput {
  const resourceName =
    row['_sfsures_resource_value@OData.Community.Display.V1.FormattedValue'] ??
    row['sfsures_Resource@OData.Community.Display.V1.FormattedValue'] ??
    resourceNamesById.get(normalizeDataverseId(row._sfsures_resource_value)) ??
    'Resource'

  return {
    id: `blackout-${row.sfsures_blackoutwindowid ?? ''}`,
    title: `🚫Blackout: ${resourceName} Until ${formatBlackoutUntil(row.sfsures_end)}`,
    start: toIso(row.sfsures_start),
    end: toIso(row.sfsures_end),
    display: 'background',
    backgroundColor: `${accentColor}40`,
    extendedProps: {
      owner: null,
      resourceId: row._sfsures_resource_value ?? '',
      resourceTypeId: resourceTypesByResourceId.get(row._sfsures_resource_value ?? '') ?? '',
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

function resourcePhotoThumbnailSrc(value: string | undefined | null): string | null {
  const base64 = value?.trim()
  if (!base64) return null

  if (base64.startsWith('data:')) {
    return base64
  }

  return `data:image/jpeg;base64,${base64}`
}

function readImageAsDataUrl(image: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }

      reject(new Error('The selected image could not be prepared.'))
    }
    reader.onerror = () => reject(new Error('The selected image could not be read.'))
    reader.onabort = () => reject(new Error('Reading the selected image was canceled.'))
    reader.readAsDataURL(image)
  })
}

function resourcePhotoMimeType(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png'
  }
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif'
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'image/bmp'
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }

  return 'image/jpeg'
}

function resourcePhotoBytesAsDataUrl(bytes: Uint8Array): Promise<string> {
  const copiedBytes = Uint8Array.from(bytes)
  return readImageAsDataUrl(
    new Blob([copiedBytes.buffer], { type: resourcePhotoMimeType(copiedBytes) })
  )
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

function normalizeDataverseId(value: string | undefined | null): string {
  return (value ?? '').replace(/[{}]/g, '').toLowerCase()
}

function rowsFromSettled<T>(
  result: PromiseSettledResult<{ data?: T[] }>,
  label: string
): T[] {
  if (result.status === 'rejected') {
    console.warn(`${label} could not be loaded:`, result.reason)
    return []
  }

  return result.value.data ?? []
}

function definitionLabel(
  labelsByDefinitionId: Map<string, string>,
  definitionId: string | undefined | null,
  fallback: string
): string {
  return labelsByDefinitionId.get(normalizeDataverseId(definitionId)) ?? fallback
}

function typedValueText(
  row: Pick<
    Sfsures_resourceattributevalues | Sfsures_reservationattributevalues,
    | 'sfsures_valueboolean'
    | 'sfsures_valuechoice'
    | 'sfsures_valuedatetime'
    | 'sfsures_valuenumber'
    | 'sfsures_valuetext'
  >
): string {
  if (row.sfsures_valuetext != null) return row.sfsures_valuetext
  if (row.sfsures_valuechoice != null) return row.sfsures_valuechoice
  if (row.sfsures_valuenumber != null) return String(row.sfsures_valuenumber)
  if (row.sfsures_valuedatetime != null) {
    const dateValue = new Date(row.sfsures_valuedatetime)
    return isNaN(dateValue.getTime()) ? row.sfsures_valuedatetime : dateValue.toLocaleString()
  }
  if (row.sfsures_valueboolean != null) return row.sfsures_valueboolean ? 'Yes' : 'No'
  return ''
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
  const [resourceTypeOptions, setResourceTypeOptions] = useState<ResourceTypeOption[]>([])
  const [viewResources, setViewResources] = useState<CalendarResourceOption[]>([])
  const [selectedResourceTypeId, setSelectedResourceTypeId] = useState('')
  const [viewResourceId, setViewResourceId] = useState('')
  const [selectedViewResource, setSelectedViewResource] = useState<CalendarResourceOption | null>(null)
  const [bookingResourceContext, setBookingResourceContext] =
    useState<CalendarResourceOption | null>(null)
  const [resourcePhotoPreviewResource, setResourcePhotoPreviewResource] =
    useState<CalendarResourceOption | null>(null)
  const [resourcePhotoPreviewFullSrc, setResourcePhotoPreviewFullSrc] = useState<string | null>(null)
  const [resourcePhotoPreviewStatus, setResourcePhotoPreviewStatus] = useState<
    'loading' | 'full' | 'thumbnail'
  >('loading')
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
  const [failedLogoUrls, setFailedLogoUrls] = useState<string[]>([])
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null)
  const [profilePhotoUnavailable, setProfilePhotoUnavailable] = useState(false)
  const [ownerLookupResult, setOwnerLookupResult] = useState<OwnerLookupResult | null>(null)
  const [helpMenuOpen, setHelpMenuOpen] = useState(false)
  const [reservationInfoDetails, setReservationInfoDetails] = useState<ReservationInfoDetails>({
    status: 'idle',
    resourceAttributes: [],
    customFields: [],
  })
  const [resourceInfoDetails, setResourceInfoDetails] = useState<ResourceInfoDetails>({
    status: 'idle',
    resourceAttributes: [],
  })

  // Reservation modal state — non-null when the modal is open.
  const [bookingSlot, setBookingSlot] = useState<{ start: Date; end: Date } | null>(null)

  // Focus trap for the event-detail popover (active only while it is open).
  const popoverRef = useRef<HTMLDivElement>(null)
  useFocusTrap(popoverRef, !!selectedEvent)
  const resourcePopoverRef = useRef<HTMLDivElement>(null)
  useFocusTrap(resourcePopoverRef, !!selectedViewResource && !resourcePhotoPreviewResource)
  const resourcePhotoPreviewRef = useRef<HTMLDivElement>(null)
  const resourcePhotoPreviewRequestIdRef = useRef(0)
  useFocusTrap(resourcePhotoPreviewRef, !!resourcePhotoPreviewResource)
  const helpMenuRef = useRef<HTMLDivElement>(null)

  // Track the loaded date range so we don't re-fetch unnecessarily.
  const loadedRangeRef = useRef<{ start: Date; end: Date } | null>(null)
  const [ownerDetailsCache, setOwnerDetailsCache] = useState(
    () => new Map<string, ReservationOwnerDetails>()
  )
  const configuredLogoUrl = theme.logoUrl || sfsuDefaultLogoUrl
  const activeLogoUrl = !failedLogoUrls.includes(configuredLogoUrl)
    ? configuredLogoUrl
    : !failedLogoUrls.includes(sfsuDefaultLogoUrl)
      ? sfsuDefaultLogoUrl
      : ''
  const logoLoadFailed = !activeLogoUrl
  const selectedEventIsOccurrence = selectedEvent?.extendedProps?.type === 'occurrence'
  const selectedOwnerId = selectedEventIsOccurrence ? reservationOwnerIdFor(selectedEvent) : null
  const cachedSelectedOwner = selectedOwnerId
    ? ownerDetailsCache.get(selectedOwnerId) ?? null
    : null
  const ownerResultMatches = ownerLookupResult?.appUserId === selectedOwnerId
  const selectedOwnerDetails =
    cachedSelectedOwner ?? (ownerResultMatches ? ownerLookupResult.details : null)
  const selectedOwnerStatus: OwnerLoadStatus = !selectedEventIsOccurrence
    ? 'idle'
    : !selectedOwnerId
      ? 'unavailable'
      : cachedSelectedOwner
        ? 'ready'
        : ownerResultMatches
          ? ownerLookupResult.status
          : 'loading'
  const visibleEvents = useMemo(
    () =>
      selectedResourceTypeId
        ? events.filter((event) => event.extendedProps?.resourceTypeId === selectedResourceTypeId)
        : events,
    [events, selectedResourceTypeId]
  )
  const filteredViewResources = useMemo(
    () =>
      selectedResourceTypeId
        ? viewResources.filter((resource) => resource.resourceTypeId === selectedResourceTypeId)
        : viewResources,
    [selectedResourceTypeId, viewResources]
  )

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const handleLogoError = useCallback(() => {
    if (activeLogoUrl !== sfsuDefaultLogoUrl) {
      console.warn('Configured logo failed to load; using bundled default logo:', activeLogoUrl)
    } else {
      console.warn('Bundled default logo failed to load.')
    }

    setFailedLogoUrls((current) =>
      current.includes(activeLogoUrl) ? current : [...current, activeLogoUrl]
    )
  }, [activeLogoUrl])

  const openHelpPage = useCallback(() => {
    const helpUrl = new URL(window.location.href)
    helpUrl.hash = '/help'
    window.open(helpUrl.toString(), '_blank', 'noopener,noreferrer')
    setHelpMenuOpen(false)
  }, [])

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
    if (!selectedOwnerId || cachedSelectedOwner) return

    const appUserId = selectedOwnerId
    let cancelled = false

    async function loadSelectedOwnerDetails() {
      try {
        const appUserResult = await Sfsures_appusersService.get(appUserId, {
          select: ['sfsures_appuserid', 'sfsures_displayname', 'sfsures_email'],
        })
        const appUser = appUserResult.data

        if (!appUser) {
          if (!cancelled) {
            setOwnerLookupResult({
              appUserId,
              status: 'unavailable',
              details: null,
            })
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

        setOwnerDetailsCache((current) => {
          const next = new Map(current)
          next.set(appUserId, ownerDetails)
          return next
        })

        if (!cancelled) {
          setOwnerLookupResult({
            appUserId,
            status: 'ready',
            details: ownerDetails,
          })
        }
      } catch (err) {
        console.warn('Reservation owner App User row could not be loaded:', err)
        if (!cancelled) {
          setOwnerLookupResult({
            appUserId,
            status: 'unavailable',
            details: null,
          })
        }
      }
    }

    loadSelectedOwnerDetails()

    return () => {
      cancelled = true
    }
  }, [cachedSelectedOwner, selectedOwnerId])

  useEffect(() => {
    if (!helpMenuOpen) return

    function handlePointerDown(event: PointerEvent) {
      if (!helpMenuRef.current?.contains(event.target as Node)) {
        setHelpMenuOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setHelpMenuOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [helpMenuOpen])

  useEffect(() => {
    if (!selectedEvent || selectedEvent.extendedProps?.type !== 'occurrence') {
      return
    }

    const occurrenceId = selectedEvent.id
    const resourceId = reservationResourceIdFor(selectedEvent)
    const seriesId = reservationSeriesIdFor(selectedEvent)
    let cancelled = false

    async function loadReservationInfoDetails() {
      if (!occurrenceId || !resourceId) {
        setReservationInfoDetails({
          status: 'ready',
          resourceAttributes: [],
          customFields: [],
        })
        return
      }

      setReservationInfoDetails({
        status: 'loading',
        resourceAttributes: [],
        customFields: [],
      })

      try {
        const [
          definitionResult,
          resourceAttributeResult,
          occurrenceAnswerResult,
          seriesAnswerResult,
        ] =
          await Promise.allSettled([
            Sfsures_attributedefinitionsService.getAll({
              select: ATTRIBUTE_DEFINITION_LABEL_SELECT,
              filter: 'statecode eq 0',
              top: 1000,
            }),
            Sfsures_resourceattributevaluesService.getAll({
              select: [
                'sfsures_resourceattributevalueid',
                '_sfsures_attributedefinition_value',
                'sfsures_valuetext',
                'sfsures_valuechoice',
                'sfsures_valuenumber',
                'sfsures_valuedatetime',
                'sfsures_valueboolean',
              ],
              filter: `statecode eq 0 and _sfsures_resource_value eq ${resourceId}`,
              top: 1000,
            }),
            Sfsures_reservationattributevaluesService.getAll({
              select: RESERVATION_ATTRIBUTE_VALUE_SELECT,
              filter: `statecode eq 0 and _sfsures_reservationoccurrence_value eq ${occurrenceId}`,
              top: 1000,
            }),
            seriesId
              ? Sfsures_reservationattributevaluesService.getAll({
                  select: RESERVATION_ATTRIBUTE_VALUE_SELECT,
                  filter: `statecode eq 0 and _sfsures_reservationseries_value eq ${seriesId}`,
                  top: 1000,
                })
              : Promise.resolve({ data: [] as Sfsures_reservationattributevalues[] }),
          ])

        if (cancelled) return

        const definitionLabelsById = new Map(
          rowsFromSettled<Sfsures_attributedefinitions>(
            definitionResult,
            'Attribute definition labels'
          )
            .map((definition) => [
              normalizeDataverseId(definition.sfsures_attributedefinitionid),
              definition.sfsures_name?.trim() ?? '',
            ] as const)
            .filter(([id, name]) => id && name)
        )

        const resourceAttributes = rowsFromSettled<Sfsures_resourceattributevalues>(
          resourceAttributeResult,
          'Resource attribute values'
        )
          .map((row) => ({
            id: row.sfsures_resourceattributevalueid,
            label: definitionLabel(
              definitionLabelsById,
              row._sfsures_attributedefinition_value,
              'Resource Attribute'
            ),
            value: typedValueText(row).trim(),
          }))
          .filter((item) => item.value)
          .sort((a, b) => a.label.localeCompare(b.label))

        let occurrenceAnswerRows = rowsFromSettled<Sfsures_reservationattributevalues>(
          occurrenceAnswerResult,
          'Occurrence custom field answers'
        )
        let seriesAnswerRows = rowsFromSettled<Sfsures_reservationattributevalues>(
          seriesAnswerResult,
          'Series custom field answers'
        )

        if (occurrenceAnswerRows.length === 0 && seriesAnswerRows.length === 0) {
          try {
            const fallbackAnswerResult = await Sfsures_reservationattributevaluesService.getAll({
              select: RESERVATION_ATTRIBUTE_VALUE_SELECT,
              filter: 'statecode eq 0',
              top: 5000,
            })
            const fallbackAnswerRows = (
              (fallbackAnswerResult.data ?? []) as Sfsures_reservationattributevalues[]
            )
            const normalizedOccurrenceId = normalizeDataverseId(occurrenceId)
            const normalizedSeriesId = normalizeDataverseId(seriesId)
            occurrenceAnswerRows = fallbackAnswerRows.filter(
              (row) =>
                normalizeDataverseId(row._sfsures_reservationoccurrence_value) ===
                normalizedOccurrenceId
            )
            seriesAnswerRows = seriesId
              ? fallbackAnswerRows.filter(
                  (row) =>
                    normalizeDataverseId(row._sfsures_reservationseries_value) ===
                    normalizedSeriesId
                )
              : []
          } catch (err) {
            console.warn('Reservation custom field answer fallback could not be loaded:', err)
          }
        }

        const occurrenceAnswers = occurrenceAnswerRows
          .map((row) => ({
            id: row.sfsures_reservationattributevalueid,
            definitionId: row._sfsures_attributedefinition_value ?? '',
            label: definitionLabel(
              definitionLabelsById,
              row._sfsures_attributedefinition_value,
              'Custom Field'
            ),
            value: typedValueText(row).trim(),
          }))
          .filter((item) => item.value)

        const usedDefinitionIds = new Set(
          occurrenceAnswers
            .map((answer) => normalizeDataverseId(answer.definitionId))
            .filter(Boolean)
        )
        const seriesAnswers = seriesAnswerRows
          .map((row) => ({
            id: row.sfsures_reservationattributevalueid,
            definitionId: row._sfsures_attributedefinition_value ?? '',
            label: definitionLabel(
              definitionLabelsById,
              row._sfsures_attributedefinition_value,
              'Custom Field'
            ),
            value: typedValueText(row).trim(),
          }))
          .filter(
            (item) => item.value && !usedDefinitionIds.has(normalizeDataverseId(item.definitionId))
          )

        const customFields = [...occurrenceAnswers, ...seriesAnswers]
          .map(({ id, label, value }) => ({ id, label, value }))
          .sort((a, b) => a.label.localeCompare(b.label))

        setReservationInfoDetails({
          status: 'ready',
          resourceAttributes,
          customFields,
        })
      } catch (err) {
        console.warn('Reservation detail values could not be loaded:', err)
        if (!cancelled) {
          setReservationInfoDetails({
            status: 'error',
            resourceAttributes: [],
            customFields: [],
          })
        }
      }
    }

    void loadReservationInfoDetails()

    return () => {
      cancelled = true
    }
  }, [selectedEvent])

  const loadRange = useCallback(
    async (rangeStart: Date, rangeEnd: Date) => {
      const startIso = rangeStart.toISOString().split('.')[0] + 'Z'
      const endIso = rangeEnd.toISOString().split('.')[0] + 'Z'

      try {
        if (!currentUser) throw new Error('User identity is not available.')
        const [permittedResourceTypeIds, resourceTypeResult, resourceResult] = await Promise.all([
          loadPermittedResourceTypeIds(
            currentUser.groups,
            'view'
          ),
          Sfsures_resourcetypesService.getAll({
            select: ['sfsures_resourcetypeid', 'sfsures_name', 'sfsures_status'],
            filter: 'sfsures_status eq 997330000',
            orderBy: ['sfsures_name asc'],
            top: 500,
          }),
          Sfsures_resourcesService.getAll({
            select: [
              'sfsures_resourceid',
              'sfsures_name',
              'sfsures_description',
              'sfsures_location',
              'sfsures_calendarcolor',
              'sfsures_resourcephoto',
              '_sfsures_resourcetype_value',
            ],
            filter: `sfsures_recordstatus eq ${RECORD_STATUS_ACTIVE}`,
            orderBy: ['sfsures_name asc'],
            top: 500,
          }),
        ])
        const activePermittedTypeIds = new Set(
          (resourceTypeResult.data ?? [])
            .map((resourceType) => resourceType.sfsures_resourcetypeid)
            .filter((id) => currentUser.isAppAdmin || permittedResourceTypeIds.has(id))
        )
        const resourceTypesById = new Map(
          (resourceTypeResult.data ?? [])
            .map((resourceType) => [
              resourceType.sfsures_resourcetypeid,
              resourceType.sfsures_name,
            ])
            .filter(
              (entry): entry is [string, string] =>
                typeof entry[0] === 'string' &&
                entry[0].length > 0 &&
                typeof entry[1] === 'string' &&
                entry[1].length > 0
            )
        )
        const nextResourceTypeOptions = (resourceTypeResult.data ?? [])
          .map((resourceType) => ({
            id: resourceType.sfsures_resourcetypeid,
            name: resourceType.sfsures_name,
          }))
          .filter(
            (option): option is ResourceTypeOption =>
              !!option.id &&
              !!option.name &&
              activePermittedTypeIds.has(option.id)
          )
          .sort((a, b) => a.name.localeCompare(b.name))
        setResourceTypeOptions(nextResourceTypeOptions)
        setSelectedResourceTypeId((current) =>
          current && nextResourceTypeOptions.some((option) => option.id === current) ? current : ''
        )
        const permittedResources = ((resourceResult.data ?? []) as ResourceRow[]).filter(
          (resource) =>
            !!resource.sfsures_resourceid &&
            !!resource._sfsures_resourcetype_value &&
            activePermittedTypeIds.has(resource._sfsures_resourcetype_value)
        )
        setViewResources(
          permittedResources
            .map((resource) => ({
              id: resource.sfsures_resourceid ?? '',
              name: resource.sfsures_name ?? 'Unnamed resource',
              resourceTypeId: resource._sfsures_resourcetype_value ?? '',
              resourceTypeName:
                resourceTypesById.get(resource._sfsures_resourcetype_value ?? '') ??
                'Resource Type unavailable',
              location: resource.sfsures_location ?? '',
              description: resource.sfsures_description ?? '',
              photoThumbnailUrl: resourcePhotoThumbnailSrc(resource.sfsures_resourcephoto),
            }))
            .filter((resource) => resource.id && resource.resourceTypeId)
            .sort((a, b) =>
              `${a.resourceTypeName}-${a.name}`.localeCompare(`${b.resourceTypeName}-${b.name}`)
            )
        )
        setViewResourceId('')
        const permittedResourceIds = permittedResources
          .map((resource) => resource.sfsures_resourceid)
          .filter((id): id is string => !!id)

        if (permittedResourceIds.length === 0) {
          setEvents([])
          loadedRangeRef.current = { start: rangeStart, end: rangeEnd }
          setLoadStatus('ready')
          return
        }

        const resourceFilter = `(${permittedResourceIds
          .map((resourceId) => `_sfsures_resource_value eq ${resourceId}`)
          .join(' or ')})`
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
              '_sfsures_series_value',
            ],
            filter:
              `sfsures_recordstatus eq 997330000` +
              ` and sfsures_start lt ${endIso}` +
              ` and sfsures_end gt ${startIso}` +
              ` and ${resourceFilter}`,
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
              '_sfsures_resource_value',
            ],
            filter:
              `statecode eq 0` +
              ` and sfsures_start lt ${endIso}` +
              ` and sfsures_end gt ${startIso}` +
              ` and ${resourceFilter}`,
            orderBy: ['sfsures_start asc'],
            top: 200,
          }),
        ])

        const fallbackResourceColor = resourceColorForBackground(theme.primaryColor)
        const resourceColorsById = new Map<string, ResourceColorOption>()
        const resourceNamesById = new Map<string, string>()
        const resourceTypesByResourceId = new Map<string, string>()

        for (const row of permittedResources) {
          const resourceId = row.sfsures_resourceid
          const resourceColor = resourceColorByValue(row.sfsures_calendarcolor)

          if (resourceId && resourceColor) {
            resourceColorsById.set(resourceId, resourceColor)
          }
          if (resourceId && row.sfsures_name) {
            resourceNamesById.set(normalizeDataverseId(resourceId), row.sfsures_name)
          }
          if (resourceId && row._sfsures_resourcetype_value) {
            resourceTypesByResourceId.set(resourceId, row._sfsures_resourcetype_value)
          }
        }

        const occEvents = (occResult.data ?? []).map((row) =>
          occurrenceToEvent(
            row as OccurrenceRow,
            resourceColorsById,
            resourceTypesByResourceId,
            fallbackResourceColor
          )
        )

        const blackoutEvents = (blackoutResult.data ?? []).map((row) =>
          blackoutToEvent(
            row as BlackoutRow,
            theme.accentColor,
            resourceNamesById,
            resourceTypesByResourceId
          )
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
    [currentUser, theme.primaryColor, theme.accentColor]
  )

  // Initial load: ±90 days around today.
  useEffect(() => {
    const now = new Date()
    const start = new Date(now)
    start.setDate(start.getDate() - 90)
    const end = new Date(now)
    end.setDate(end.getDate() + 90)
    queueMicrotask(() => loadRange(start, end))
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
        setLoadStatus('loading')
        setErrorMessage('')
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
      setLoadStatus('loading')
      setErrorMessage('')
      loadRange(loaded.start, loaded.end)
    }
  }, [loadRange])

  const closeReservationInfo = useCallback(() => {
    setSelectedEvent(null)
    setReservationInfoDetails({
      status: 'idle',
      resourceAttributes: [],
      customFields: [],
    })
    setDeleteConfirmMode(null)
    setDeletingReservation(false)
    setLoadingSeriesEdit(false)
    setReservationActionError('')
  }, [])

  const closeResourceInfo = useCallback(() => {
    setSelectedViewResource(null)
    setResourceInfoDetails({
      status: 'idle',
      resourceAttributes: [],
    })
  }, [])

  const loadResourceInfoDetails = useCallback(async (resource: CalendarResourceOption) => {
    setResourceInfoDetails({
      status: 'loading',
      resourceAttributes: [],
    })

    try {
      const [definitionResult, valueResult] = await Promise.all([
        Sfsures_attributedefinitionsService.getAll({
          select: [
            'sfsures_attributedefinitionid',
            '_sfsures_resourcetype_value',
            '_sfsures_resource_value',
            'sfsures_name',
            'sfsures_appliesto',
            'sfsures_displayorder',
          ],
          filter: `statecode eq 0 and sfsures_appliesto eq ${ATTRIBUTE_APPLIES_TO_RESOURCE}`,
          orderBy: ['sfsures_displayorder asc', 'sfsures_name asc'],
          top: 1000,
        }),
        Sfsures_resourceattributevaluesService.getAll({
          select: [
            'sfsures_resourceattributevalueid',
            '_sfsures_resource_value',
            '_sfsures_attributedefinition_value',
            'sfsures_valuetext',
            'sfsures_valuechoice',
            'sfsures_valuenumber',
            'sfsures_valuedatetime',
            'sfsures_valueboolean',
          ],
          filter: `statecode eq 0 and _sfsures_resource_value eq ${resource.id}`,
          top: 1000,
        }),
      ])

      const valuesByDefinitionId = new Map(
        ((valueResult.data ?? []) as Sfsures_resourceattributevalues[]).map((row) => [
          normalizeDataverseId(row._sfsures_attributedefinition_value),
          typedValueText(row).trim(),
        ])
      )

      const resourceAttributes = ((definitionResult.data ?? []) as Sfsures_attributedefinitions[])
        .filter((definition) => {
          const definitionResourceTypeId = normalizeDataverseId(
            definition._sfsures_resourcetype_value
          )
          const definitionResourceId = normalizeDataverseId(definition._sfsures_resource_value)

          return (
            definition.sfsures_appliesto === ATTRIBUTE_APPLIES_TO_RESOURCE &&
            (definitionResourceTypeId === normalizeDataverseId(resource.resourceTypeId) ||
              definitionResourceId === normalizeDataverseId(resource.id))
          )
        })
        .map((definition) => ({
          id: definition.sfsures_attributedefinitionid,
          label: definition.sfsures_name,
          value:
            valuesByDefinitionId.get(normalizeDataverseId(definition.sfsures_attributedefinitionid)) ||
            'Not provided',
        }))

      setResourceInfoDetails({
        status: 'ready',
        resourceAttributes,
      })
    } catch (err) {
      console.warn('Resource details could not be loaded:', err)
      setResourceInfoDetails({
        status: 'error',
        resourceAttributes: [],
      })
    }
  }, [])

  const openResourceInfo = useCallback(
    (resourceId: string) => {
      setViewResourceId(resourceId)
      const resource = viewResources.find((item) => item.id === resourceId) ?? null

      if (!resource) {
        closeResourceInfo()
        return
      }

      setSelectedViewResource(resource)
      void loadResourceInfoDetails(resource)
    },
    [closeResourceInfo, loadResourceInfoDetails, viewResources]
  )

  const reserveSelectedViewResource = useCallback(() => {
    if (!selectedViewResource) return

    setBookingResourceContext(selectedViewResource)
    setBookingSlot(nextHourSlot())
    closeResourceInfo()
  }, [closeResourceInfo, selectedViewResource])

  const openResourcePhotoPreview = useCallback(async (resource: CalendarResourceOption) => {
    if (!resource.photoThumbnailUrl) return

    const requestId = resourcePhotoPreviewRequestIdRef.current + 1
    resourcePhotoPreviewRequestIdRef.current = requestId
    setResourcePhotoPreviewResource(resource)
    setResourcePhotoPreviewFullSrc(null)
    setResourcePhotoPreviewStatus('loading')

    try {
      const result = await Sfsures_resourcesService.downloadImage(
        resource.id,
        RESOURCE_PHOTO_COLUMN,
        true
      )
      const bytes = result.data

      if (!bytes || bytes.byteLength === 0) {
        throw new Error('Dataverse returned an empty full-size image.')
      }

      const fullSizeSrc = await resourcePhotoBytesAsDataUrl(bytes)
      if (resourcePhotoPreviewRequestIdRef.current !== requestId) return

      setResourcePhotoPreviewFullSrc(fullSizeSrc)
      setResourcePhotoPreviewStatus('full')
    } catch (err) {
      if (resourcePhotoPreviewRequestIdRef.current !== requestId) return

      console.warn('The full-size Resource photo could not be loaded:', err)
      setResourcePhotoPreviewStatus('thumbnail')
    }
  }, [])

  const closeResourcePhotoPreview = useCallback(() => {
    resourcePhotoPreviewRequestIdRef.current += 1
    setResourcePhotoPreviewResource(null)
    setResourcePhotoPreviewFullSrc(null)
    setResourcePhotoPreviewStatus('loading')
  }, [])

  const handleResourcePhotoPreviewKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Escape') return

      event.preventDefault()
      closeResourcePhotoPreview()
    },
    [closeResourcePhotoPreview]
  )

  const handleResourceTypeFilterChange = useCallback(
    (nextResourceTypeId: string) => {
      setSelectedResourceTypeId(nextResourceTypeId)
      setViewResourceId('')

      if (
        nextResourceTypeId &&
        selectedEvent &&
        selectedEvent.extendedProps?.resourceTypeId !== nextResourceTypeId
      ) {
        closeReservationInfo()
      }
      if (
        nextResourceTypeId &&
        selectedViewResource &&
        selectedViewResource.resourceTypeId !== nextResourceTypeId
      ) {
        closeResourceInfo()
      }
    },
    [closeReservationInfo, closeResourceInfo, selectedEvent, selectedViewResource]
  )

  // ---------------------------------------------------------------------------
  // Interaction handlers
  // ---------------------------------------------------------------------------

  const handleEventClick = useCallback((arg: EventClickArg) => {
    setDeleteConfirmMode(null)
    setDeletingReservation(false)
    setLoadingSeriesEdit(false)
    setReservationActionError('')

    if (arg.event.extendedProps.type === 'blackout') {
      setReservationInfoDetails({
        status: 'idle',
        resourceAttributes: [],
        customFields: [],
      })
      setSelectedEvent({
        id: arg.event.id,
        title: arg.event.title,
        start: arg.event.startStr,
        end: arg.event.endStr,
        extendedProps: arg.event.extendedProps,
      })
      return
    }
    setReservationInfoDetails({
      status: 'loading',
      resourceAttributes: [],
      customFields: [],
    })
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
        bookingOwnerId: ownerId,
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
            <div className={styles.helpMenuWrap} ref={helpMenuRef}>
              <button
                type="button"
                className={styles.helpButton}
                aria-label="Open help menu"
                aria-haspopup="menu"
                aria-expanded={helpMenuOpen}
                onClick={() => setHelpMenuOpen((open) => !open)}
              >
                <span className={styles.helpIcon} aria-hidden="true">?</span>
              </button>
              {helpMenuOpen && (
                <div className={styles.helpMenu} role="menu" aria-label="Help menu">
                  <button
                    type="button"
                    className={styles.helpMenuItem}
                    role="menuitem"
                    onClick={openHelpPage}
                  >
                    Help (New tab)
                  </button>
                  <button
                    type="button"
                    className={styles.helpMenuItem}
                    role="menuitem"
                    onClick={() => setHelpMenuOpen(false)}
                  >
                    About
                  </button>
                </div>
              )}
            </div>
            {onOpenAdmin && (
              <button
                type="button"
                className={styles.adminButton}
                onClick={onOpenAdmin}
              >
                Admin
              </button>
            )}
            <a
              href="https://gateway.sfsu.edu/"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.profileLink}
              aria-label="Open SFSU Gateway in a new tab"
              title="Open SFSU Gateway"
            >
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
                >
                  {initialsFor(currentUser?.displayName, currentUser?.email)}
                </div>
              )}
            </a>
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

        <div className={styles.calendarFilterBar}>
          <label className={styles.resourceTypeFilter}>
            <span>Resource Type</span>
            <select
              value={selectedResourceTypeId}
              onChange={(event) => handleResourceTypeFilterChange(event.target.value)}
            >
              <option value="">All Resource Types</option>
              {resourceTypeOptions.map((resourceType) => (
                <option key={resourceType.id} value={resourceType.id}>
                  {resourceType.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.resourceTypeFilter}>
            <span>View Resource</span>
            <select
              value={viewResourceId}
              onChange={(event) => openResourceInfo(event.target.value)}
              disabled={filteredViewResources.length === 0}
            >
              <option value="">Choose a Resource</option>
              {filteredViewResources.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.name}
                </option>
              ))}
            </select>
          </label>
        </div>

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
            events={visibleEvents}
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
                <p className={styles.popoverLabel}>Blackout window</p>
                <h2 id="event-popover-title" className={styles.popoverTitle}>
                  {blackoutDisplayTitle(selectedEvent.title)}
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
                {reservationInfoDetails.status === 'loading' && (
                  <section className={styles.detailValueSection} aria-label="Reservation details">
                    <p className={styles.detailValueMuted}>Loading reservation details...</p>
                  </section>
                )}
                {reservationInfoDetails.status === 'error' && (
                  <section className={styles.detailValueSection} aria-label="Reservation details">
                    <p className={styles.detailValueMuted}>Additional details unavailable.</p>
                  </section>
                )}
                {reservationInfoDetails.resourceAttributes.length > 0 && (
                  <section className={styles.detailValueSection} aria-label="Resource attributes">
                    <p className={styles.detailValueHeading}>Resource Attributes</p>
                    <dl className={styles.detailValueList}>
                      {reservationInfoDetails.resourceAttributes.map((item) => (
                        <div key={item.id}>
                          <dt>{item.label}</dt>
                          <dd>{item.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                )}
                {reservationInfoDetails.customFields.length > 0 && (
                  <section className={styles.detailValueSection} aria-label="Custom field answers">
                    <p className={styles.detailValueHeading}>Custom Fields</p>
                    <dl className={styles.detailValueList}>
                      {reservationInfoDetails.customFields.map((item) => (
                        <div key={item.id}>
                          <dt>{item.label}</dt>
                          <dd>{item.value}</dd>
                        </div>
                      ))}
                    </dl>
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
                          const next = { ...selectedOwnerDetails, photoUrl: null }
                          setOwnerDetailsCache((current) => {
                            const updated = new Map(current)
                            updated.set(selectedOwnerDetails.appUserId, next)
                            return updated
                          })
                          setOwnerLookupResult({
                            appUserId: selectedOwnerDetails.appUserId,
                            status: 'ready',
                            details: next,
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

      {selectedViewResource && (
        <div
          className={styles.popoverBackdrop}
          onClick={closeResourceInfo}
        >
          <div
            ref={resourcePopoverRef}
            className={`${styles.popover} ${styles.resourceInfoModal}`}
            style={{ borderTopColor: theme.primaryColor }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="resource-info-title"
            tabIndex={-1}
          >
            <p
              className={styles.popoverLabel}
              style={{ color: theme.primaryColor }}
            >
              Resource
            </p>
            <h2 id="resource-info-title" className={styles.popoverTitle}>
              {selectedViewResource.name}
            </h2>

            <div className={styles.resourceInfoBody}>
              {selectedViewResource.photoThumbnailUrl ? (
                <button
                  type="button"
                  className={styles.resourceInfoPhotoButton}
                  onClick={() => void openResourcePhotoPreview(selectedViewResource)}
                >
                  <img
                    src={selectedViewResource.photoThumbnailUrl}
                    alt={`${selectedViewResource.name} resource photo`}
                    className={styles.resourceInfoPhoto}
                  />
                </button>
              ) : (
                <div className={styles.resourceInfoPhotoPlaceholder}>No photo uploaded</div>
              )}

              <dl className={styles.resourceInfoList}>
                <div>
                  <dt>Resource Type</dt>
                  <dd>{selectedViewResource.resourceTypeName}</dd>
                </div>
                {selectedViewResource.location && (
                  <div>
                    <dt>Location</dt>
                    <dd>{selectedViewResource.location}</dd>
                  </div>
                )}
              </dl>

              {selectedViewResource.description && (
                <section className={styles.commentsSection} aria-label="Resource description">
                  <p className={styles.commentsLabel}>Description</p>
                  <p className={styles.commentsText}>{selectedViewResource.description}</p>
                </section>
              )}

              {resourceInfoDetails.status === 'loading' && (
                <section className={styles.detailValueSection} aria-label="Resource attributes">
                  <p className={styles.detailValueMuted}>Loading Resource Attributes...</p>
                </section>
              )}
              {resourceInfoDetails.status === 'error' && (
                <section className={styles.detailValueSection} aria-label="Resource attributes">
                  <p className={styles.detailValueMuted}>Resource Attributes unavailable.</p>
                </section>
              )}
              {resourceInfoDetails.status === 'ready' && (
                <section className={styles.detailValueSection} aria-label="Resource attributes">
                  <p className={styles.detailValueHeading}>Resource Attributes</p>
                  {resourceInfoDetails.resourceAttributes.length === 0 ? (
                    <p className={styles.detailValueMuted}>No Resource Attributes configured.</p>
                  ) : (
                    <dl className={styles.detailValueList}>
                      {resourceInfoDetails.resourceAttributes.map((item) => (
                        <div key={item.id}>
                          <dt>{item.label}</dt>
                          <dd>{item.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </section>
              )}
            </div>

            <section className={styles.actionSection} aria-label="Resource actions">
              <div className={styles.actionRow}>
                <button
                  className={styles.primaryAction}
                  onClick={reserveSelectedViewResource}
                >
                  Reserve This Resource
                </button>
                <button
                  className={styles.secondaryAction}
                  onClick={closeResourceInfo}
                >
                  Close
                </button>
              </div>
            </section>
          </div>
        </div>
      )}

      {resourcePhotoPreviewResource && resourcePhotoPreviewResource.photoThumbnailUrl && (
        <div
          className={styles.popoverBackdrop}
          onClick={closeResourcePhotoPreview}
        >
          <div
            ref={resourcePhotoPreviewRef}
            className={`${styles.popover} ${styles.resourcePhotoPreviewModal}`}
            style={{ borderTopColor: theme.primaryColor }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="resource-photo-preview-title"
            tabIndex={-1}
            onKeyDown={handleResourcePhotoPreviewKeyDown}
          >
            <p className={styles.popoverLabel}>Resource Photo</p>
            <h2 id="resource-photo-preview-title" className={styles.popoverTitle}>
              {resourcePhotoPreviewResource.name}
            </h2>
            <div className={styles.resourcePhotoPreviewBody}>
              <img
                src={
                  resourcePhotoPreviewFullSrc ??
                  resourcePhotoPreviewResource.photoThumbnailUrl
                }
                alt={`${resourcePhotoPreviewResource.name} resource photo`}
                onError={() => {
                  if (resourcePhotoPreviewStatus === 'full') {
                    setResourcePhotoPreviewFullSrc(null)
                    setResourcePhotoPreviewStatus('thumbnail')
                  }
                }}
              />
            </div>
            <section className={styles.actionSection} aria-label="Resource photo actions">
              <div className={styles.modalStatusRow}>
                <span role="status">
                  {resourcePhotoPreviewStatus === 'loading'
                    ? 'Loading full-size photo...'
                    : resourcePhotoPreviewStatus === 'full'
                      ? 'Showing full-size photo'
                      : 'Full-size photo unavailable; showing thumbnail'}
                </span>
              </div>
              <div className={styles.actionRow}>
                <button
                  className={styles.primaryAction}
                  onClick={closeResourcePhotoPreview}
                >
                  Done
                </button>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* Reservation modal */}
      {bookingSlot && (
        <BookingModal
          start={bookingSlot.start}
          end={bookingSlot.end}
          initialResourceTypeId={bookingResourceContext?.resourceTypeId ?? selectedResourceTypeId}
          initialResourceId={bookingResourceContext?.id ?? ''}
          onClose={() => {
            setBookingSlot(null)
            setBookingResourceContext(null)
          }}
          onBooked={() => {
            refreshCalendar()
            setBookingResourceContext(null)
          }}
        />
      )}

      {editingReservation && (
        <BookingModal
          start={editingReservation.start}
          end={editingReservation.end}
          initialResourceTypeId={selectedResourceTypeId}
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
          initialResourceTypeId={selectedResourceTypeId}
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
