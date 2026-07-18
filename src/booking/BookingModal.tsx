/**
 * BookingModal
 *
 * Creates one-time reservations or recurring reservation series. Opened by
 * CalendarScreen's handleDateSelect with pre-filled start/end times.
 *
 * Flow:
 *   1. User picks a resource from the dropdown (reservable resources loaded on mount)
 *   2. User adjusts start/end if needed
 *   3. On "Reserve": conflict detection runs first (delegable overlap query against
 *      active occurrences + blackout windows for the selected resource)
 *   4. If clear -> create one occurrence, or create one Series plus N Occurrences
 *   5. Show an in-dialog confirmation with OK focused by default
 *   6. If conflicts -> show details, don't write
 *
 * The Booking Owner defaults to the authenticated App User. App Admins may select an
 * eligible active/mapped owner when booking on another user's behalf.
 *
 * The picker includes only active resources in active Resource Types for which the
 * signed-in user's groups grant Book access. Individual Resource access rows are
 * intentionally ignored. Dataverse security roles remain the real boundary.
 *
 * Accessibility:
 *   - role="dialog" + aria-modal + aria-labelledby (named by the visible title)
 *   - Focus is trapped inside the dialog while open and restored to the trigger
 *     on close (useFocusTrap)
 *   - Escape closes
 *   - Status (validation / conflict / error) is mirrored into an always-mounted
 *     assertive live region so screen readers hear it without moving focus. The
 *     visual banner below is unchanged and remains navigable for full detail.
 *   - Success stays in this same centered dialog instead of a page banner.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Sfsures_resources } from '../generated/models/Sfsures_resourcesModel'
import type { Sfsures_resourcetypes } from '../generated/models/Sfsures_resourcetypesModel'
import type { Sfsures_attributedefinitions } from '../generated/models/Sfsures_attributedefinitionsModel'
import type { Sfsures_reservationattributevalues } from '../generated/models/Sfsures_reservationattributevaluesModel'
import { Sfsures_resourcesService } from '../generated/services/Sfsures_resourcesService'
import { Sfsures_resourcetypesService } from '../generated/services/Sfsures_resourcetypesService'
import { Sfsures_attributedefinitionsService } from '../generated/services/Sfsures_attributedefinitionsService'
import { Sfsures_reservationattributevaluesService } from '../generated/services/Sfsures_reservationattributevaluesService'
import { Sfsures_reservationoccurrencesService } from '../generated/services/Sfsures_reservationoccurrencesService'
import { Sfsures_reservationseriesesService } from '../generated/services/Sfsures_reservationseriesesService'
import { Sfsures_blackoutwindowsService } from '../generated/services/Sfsures_blackoutwindowsService'
import { useTheme } from '../theme/ThemeContext'
import { useCurrentUser } from '../auth/UserContext'
import { useFocusTrap } from '../a11y/useFocusTrap'
import { loadPermittedResourceTypeIds } from '../auth/resourceTypePermissions'
import { AUDIT_ACTION_TYPES, AUDIT_TARGET_TYPES, writeAuditLog } from '../audit/auditLog'
import {
  loadEligibleReservationOwners,
  loadMappedOwner,
  reservationOwnerSnapshot,
  type ReservationOwnerOption,
} from './reservationOwners'
import greenCheckUrl from '../assets/greencheck.png?inline'
import styles from './BookingModal.module.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BookingModalProps {
  /** Pre-filled from the calendar selection */
  start: Date
  /** Pre-filled from the calendar selection */
  end: Date
  /** Pre-selected from the calendar Resource Type filter */
  initialResourceTypeId?: string
  /** Pre-selected from the calendar resource viewer */
  initialResourceId?: string
  /** Existing occurrence details when editing from Reservation Info */
  initialReservation?: EditableReservation
  /** Existing series details when editing an entire recurring series */
  initialSeries?: EditableReservationSeries
  /** Close the modal without reserving */
  onClose: () => void
  /** Called after a successful create/update — CalendarScreen uses this to refresh */
  onBooked: () => void
}

export interface EditableReservation {
  id: string
  resourceId: string
  bookingOwnerId: string
  comments: string
}

export type EditableSeriesFrequency = 'daily' | 'weekly' | 'monthly'
export type EditableSeriesEndMode = 'count' | 'until'
export type EditableSeriesWeekday = 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat'

export interface EditableReservationSeries {
  id: string
  resourceId: string
  bookingOwnerId: string
  comments: string
  frequency: EditableSeriesFrequency
  interval: number
  weekdays: EditableSeriesWeekday[]
  endMode: EditableSeriesEndMode
  occurrenceCount: number
  untilDate: string
  activeOccurrenceIds: string[]
}

interface ResourceOption {
  id: string
  name: string
  resourceTypeId: string
}

interface ResourceTypeOption {
  id: string
  name: string
}

interface ReservationCustomField {
  id: string
  resourceTypeId: string
  resourceId: string
  name: string
  dataType: number
  required: boolean
  choiceOptions: string[]
  displayOrder: number
}

interface ReservationCustomFieldAnswer {
  id: string
  definitionId: string
  value: string
}

interface ConflictInfo {
  type: 'reservation' | 'blackout'
  start: string
  end: string
  occurrenceIndex?: number
  requestedStart?: string
  requestedEnd?: string
  ownerName?: string
  reason?: string
}

type ModalMode = 'form' | 'success'
type SaveMode = 'create' | 'edit' | 'editSeries'
type SuccessKind = 'created' | 'updated'
type SuccessScope = 'single' | 'series'
type RecurrenceFrequency = 'none' | EditableSeriesFrequency
type SeriesFrequency = Exclude<RecurrenceFrequency, 'none'>
type RecurrenceEndMode = EditableSeriesEndMode
type WeekdayKey = EditableSeriesWeekday

interface RequestedOccurrence {
  start: Date
  end: Date
  index: number
}

interface RecurrenceBuildResult {
  occurrences: RequestedOccurrence[]
  summary: string
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000
const RESERVATION_COMMENTS_FIELD = 'sfsures_comments'
const RECORD_STATUS_ACTIVE = 997330000
const RECORD_STATUS_CANCELLED = 997330001
const RESOURCE_TYPE_STATUS_ACTIVE = 997330000
const ATTRIBUTE_APPLIES_TO_RESERVATION = 997330001
const ATTRIBUTE_TYPE_TEXT = 997330000
const ATTRIBUTE_TYPE_CHOICE = 997330004
const SERIES_FREQUENCY = {
  daily: 997330000,
  weekly: 997330001,
  monthly: 997330002,
} as const
const SERIES_END_MODE = {
  until: 997330000,
  count: 997330001,
} as const
const DEFAULT_RECURRENCE_COUNT = 4
const WEEKDAYS: Array<{ key: WeekdayKey; label: string; index: number }> = [
  { key: 'Sun', label: 'Sun', index: 0 },
  { key: 'Mon', label: 'Mon', index: 1 },
  { key: 'Tue', label: 'Tue', index: 2 },
  { key: 'Wed', label: 'Wed', index: 3 },
  { key: 'Thu', label: 'Thu', index: 4 },
  { key: 'Fri', label: 'Fri', index: 5 },
  { key: 'Sat', label: 'Sat', index: 6 },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Date → "YYYY-MM-DDTHH:mm" for <input type="datetime-local"> */
function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}

/** "YYYY-MM-DDTHH:mm" → Date (local timezone) */
function fromDatetimeLocal(s: string): Date {
  return new Date(s)
}

function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function defaultUntilDateFor(startDate: Date): string {
  const defaultUntilDate = new Date(startDate)
  defaultUntilDate.setDate(defaultUntilDate.getDate() + 28)
  return toDateInput(defaultUntilDate)
}

/** Date → Dataverse-safe ISO string (no milliseconds) */
function toDataverseIso(d: Date): string {
  return d.toISOString().split('.')[0] + 'Z'
}

/** Format a date/time range for display in conflict messages */
function formatRange(startIso: string, endIso: string): string {
  const s = new Date(startIso)
  const e = new Date(endIso)
  const date = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const t1 = s.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const t2 = e.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${date}, ${t1} – ${t2}`
}

function formatInputRange(startValue: string, endValue: string): string {
  const start = fromDatetimeLocal(startValue)
  const end = fromDatetimeLocal(endValue)

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return ''
  }

  const date = start.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
  const startTime = start.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
  const endTime = end.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })

  return `${date}, ${startTime} to ${endTime}`
}

function formatWeekLimit(weeks: number): string {
  return weeks === 1 ? '1 week' : `${weeks} weeks`
}

function parseWholeNumber(value: string): number | null {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) {
    return null
  }
  return parsed
}

function reservationAnswerValueText(row: Sfsures_reservationattributevalues): string {
  if (row.sfsures_valuetext != null) return row.sfsures_valuetext
  if (row.sfsures_valuechoice != null) return row.sfsures_valuechoice
  if (row.sfsures_valuenumber != null) return String(row.sfsures_valuenumber)
  if (row.sfsures_valuedatetime != null) return row.sfsures_valuedatetime
  if (row.sfsures_valueboolean != null) return row.sfsures_valueboolean ? 'Yes' : 'No'
  return ''
}

function reservationAnswerValueFields(
  definition: ReservationCustomField,
  value: string
): Pick<
  Sfsures_reservationattributevalues,
  'sfsures_valuechoice' | 'sfsures_valuetext'
> {
  return {
    sfsures_valuetext: definition.dataType === ATTRIBUTE_TYPE_TEXT ? value : undefined,
    sfsures_valuechoice: definition.dataType === ATTRIBUTE_TYPE_CHOICE ? value : undefined,
  }
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function addMonthsClamped(date: Date, months: number): Date {
  const target = new Date(
    date.getFullYear(),
    date.getMonth() + months,
    1,
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds()
  )
  const lastDayOfTargetMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(date.getDate(), lastDayOfTargetMonth))
  return target
}

function startOfWeek(date: Date): Date {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - start.getDay())
  return start
}

function dateForWeekday(weekStart: Date, weekdayIndex: number, timeSource: Date): Date {
  const candidate = new Date(weekStart)
  candidate.setDate(weekStart.getDate() + weekdayIndex)
  candidate.setHours(
    timeSource.getHours(),
    timeSource.getMinutes(),
    timeSource.getSeconds(),
    timeSource.getMilliseconds()
  )
  return candidate
}

function endOfDateInput(value: string): Date | null {
  const parts = value.split('-').map((part) => Number(part))
  const [year, month, day] = parts
  if (!year || !month || !day) {
    return null
  }

  const date = new Date(year, month - 1, day, 23, 59, 59, 999)
  return isNaN(date.getTime()) ? null : date
}

function weekdayKeyForDate(date: Date): WeekdayKey {
  return WEEKDAYS[date.getDay()].key
}

function weekdayIndexForKey(key: WeekdayKey): number {
  return WEEKDAYS.find((weekday) => weekday.key === key)?.index ?? 0
}

function sortedWeekdays(keys: WeekdayKey[]): WeekdayKey[] {
  return [...keys].sort((a, b) => weekdayIndexForKey(a) - weekdayIndexForKey(b))
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function frequencyNoun(frequency: RecurrenceFrequency, interval: number): string {
  if (frequency === 'daily') {
    return interval === 1 ? 'day' : 'days'
  }
  if (frequency === 'weekly') {
    return interval === 1 ? 'week' : 'weeks'
  }
  return interval === 1 ? 'month' : 'months'
}

function formatRecurrenceSummary(
  frequency: RecurrenceFrequency,
  interval: number,
  weekdays: WeekdayKey[],
  occurrences: RequestedOccurrence[]
): string {
  if (frequency === 'none' || occurrences.length <= 1) {
    return 'One-time reservation.'
  }

  const cadence =
    interval === 1
      ? `Repeats every ${frequencyNoun(frequency, interval)}`
      : `Repeats every ${interval} ${frequencyNoun(frequency, interval)}`
  const dayText =
    frequency === 'weekly' && weekdays.length > 0
      ? ` on ${sortedWeekdays(weekdays).join(', ')}`
      : ''
  const last = occurrences[occurrences.length - 1]

  return `${cadence}${dayText}; ${occurrences.length} occurrences through ${formatShortDate(last.end)}.`
}

function buildRequestedOccurrences(args: {
  startDate: Date
  endDate: Date
  frequency: RecurrenceFrequency
  interval: number
  weekdays: WeekdayKey[]
  endMode: RecurrenceEndMode
  occurrenceCount: number
  untilDate: Date | null
  maxOccurrences: number
  maxSpanWeeks: number
}): RecurrenceBuildResult | { error: string } {
  const {
    startDate,
    endDate,
    frequency,
    interval,
    weekdays,
    endMode,
    occurrenceCount,
    untilDate,
    maxOccurrences,
    maxSpanWeeks,
  } = args
  const durationMs = endDate.getTime() - startDate.getTime()

  if (durationMs > maxSpanWeeks * MS_PER_WEEK) {
    return { error: `Reservations may span at most ${formatWeekLimit(maxSpanWeeks)}.` }
  }

  if (frequency === 'none') {
    return {
      occurrences: [{ start: startDate, end: endDate, index: 1 }],
      summary: 'One-time reservation.',
    }
  }

  if (interval < 1) {
    return { error: 'Repeat interval must be at least 1.' }
  }

  if (endMode === 'count') {
    if (occurrenceCount < 2) {
      return { error: 'Recurring reservations must include at least 2 occurrences.' }
    }
    if (occurrenceCount > maxOccurrences) {
      return { error: `Recurring reservations may include at most ${maxOccurrences} occurrences.` }
    }
  }

  if (endMode === 'until') {
    if (!untilDate) {
      return { error: 'Choose an end date for the recurring reservation.' }
    }
    if (untilDate < startDate) {
      return { error: 'The recurrence end date must be on or after the start date.' }
    }
  }

  if (frequency === 'weekly' && weekdays.length === 0) {
    return { error: 'Choose at least one weekday for a weekly reservation.' }
  }

  const occurrences: RequestedOccurrence[] = []
  const addOccurrence = (candidateStart: Date) => {
    if (candidateStart < startDate) {
      return
    }
    if (endMode === 'until' && untilDate && candidateStart > untilDate) {
      return
    }
    occurrences.push({
      start: candidateStart,
      end: new Date(candidateStart.getTime() + durationMs),
      index: occurrences.length + 1,
    })
  }
  const targetReached = () => endMode === 'count' && occurrences.length >= occurrenceCount

  if (frequency === 'daily') {
    for (let step = 0; step < 1000; step += 1) {
      const candidateStart = addDays(startDate, step * interval)
      if (endMode === 'until' && untilDate && candidateStart > untilDate) break
      addOccurrence(candidateStart)
      if (targetReached()) break
    }
  }

  if (frequency === 'weekly') {
    const weekStart = startOfWeek(startDate)
    const orderedWeekdays = sortedWeekdays(weekdays)

    for (let week = 0; week < 1000; week += 1) {
      const candidateWeekStart = addDays(weekStart, week * interval * 7)
      const firstCandidateOfWeek = dateForWeekday(candidateWeekStart, 0, startDate)
      if (endMode === 'until' && untilDate && firstCandidateOfWeek > untilDate) break

      for (const weekday of orderedWeekdays) {
        addOccurrence(dateForWeekday(candidateWeekStart, weekdayIndexForKey(weekday), startDate))
        if (targetReached()) break
      }

      if (targetReached()) break
    }
  }

  if (frequency === 'monthly') {
    for (let month = 0; month < 1000; month += 1) {
      const candidateStart = addMonthsClamped(startDate, month * interval)
      if (endMode === 'until' && untilDate && candidateStart > untilDate) break
      addOccurrence(candidateStart)
      if (targetReached()) break
    }
  }

  if (occurrences.length < 2) {
    return { error: 'Choose a recurrence end point that creates at least 2 occurrences.' }
  }

  if (occurrences.length > maxOccurrences) {
    return { error: `Recurring reservations may include at most ${maxOccurrences} occurrences.` }
  }

  const firstStart = occurrences[0].start
  const lastEnd = occurrences[occurrences.length - 1].end
  if (lastEnd.getTime() - firstStart.getTime() > maxSpanWeeks * MS_PER_WEEK) {
    return { error: `Recurring reservations may span at most ${formatWeekLimit(maxSpanWeeks)}.` }
  }

  return {
    occurrences,
    summary: formatRecurrenceSummary(frequency, interval, weekdays, occurrences),
  }
}

function rangesOverlap(startA: string, endA: string, startB: Date, endB: Date): boolean {
  if (!startA || !endA) {
    return false
  }
  const aStart = new Date(startA)
  const aEnd = new Date(endA)
  return aStart < endB && aEnd > startB
}

function formatConflictPrefix(conflict: ConflictInfo): string {
  if (!conflict.occurrenceIndex) {
    return ''
  }

  if (conflict.requestedStart && conflict.requestedEnd) {
    return `Occurrence ${conflict.occurrenceIndex} (${formatRange(
      conflict.requestedStart,
      conflict.requestedEnd
    )}): `
  }

  return `Occurrence ${conflict.occurrenceIndex}: `
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BookingModal({
  start,
  end,
  initialResourceTypeId = '',
  initialResourceId = '',
  initialReservation,
  initialSeries,
  onClose,
  onBooked,
}: BookingModalProps) {
  const { theme, reservationLimits } = useTheme()
  const currentUser = useCurrentUser()

  // ---- Focus trap: contain Tab inside the dialog, restore focus on close ----
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef, true) // modal only mounts when open → active while mounted
  const okButtonRef = useRef<HTMLButtonElement>(null)

  // ---- Resource list ----
  const [resourceTypes, setResourceTypes] = useState<ResourceTypeOption[]>([])
  const [resources, setResources] = useState<ResourceOption[]>([])
  const [resourcesLoading, setResourcesLoading] = useState(true)
  const [owners, setOwners] = useState<ReservationOwnerOption[]>([])
  const [ownersLoading, setOwnersLoading] = useState(false)
  const [customFields, setCustomFields] = useState<ReservationCustomField[]>([])
  const [customFieldAnswers, setCustomFieldAnswers] = useState<ReservationCustomFieldAnswer[]>([])
  const [customFieldDraft, setCustomFieldDraft] = useState<Record<string, string>>({})
  const [customFieldsLoading, setCustomFieldsLoading] = useState(false)

  // ---- Form state ----
  const [resourceTypeFilterId, setResourceTypeFilterId] = useState(initialResourceTypeId)
  const [selectedResourceId, setSelectedResourceId] = useState(
    initialSeries?.resourceId ?? initialReservation?.resourceId ?? initialResourceId
  )
  const [selectedOwnerId, setSelectedOwnerId] = useState(
    initialSeries?.bookingOwnerId ?? initialReservation?.bookingOwnerId ?? currentUser?.appUserId ?? ''
  )
  const [startStr, setStartStr] = useState(toDatetimeLocal(start))
  const [endStr, setEndStr] = useState(toDatetimeLocal(end))
  const [comments, setComments] = useState(initialSeries?.comments ?? initialReservation?.comments ?? '')
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<RecurrenceFrequency>(
    initialSeries?.frequency ?? 'none'
  )
  const [recurrenceInterval, setRecurrenceInterval] = useState(String(initialSeries?.interval ?? 1))
  const [weeklyDays, setWeeklyDays] = useState<WeekdayKey[]>(
    initialSeries?.weekdays.length ? initialSeries.weekdays : [weekdayKeyForDate(start)]
  )
  const [recurrenceEndMode, setRecurrenceEndMode] = useState<RecurrenceEndMode>(
    initialSeries?.endMode ?? 'count'
  )
  const [occurrenceCount, setOccurrenceCount] = useState(
    String(initialSeries?.occurrenceCount ?? DEFAULT_RECURRENCE_COUNT)
  )
  const [untilDate, setUntilDate] = useState(() => initialSeries?.untilDate || defaultUntilDateFor(start))

  // ---- Modal flow state ----
  const [mode, setMode] = useState<ModalMode>('form')
  const [saveMode, setSaveMode] = useState<SaveMode>(
    initialSeries ? 'editSeries' : initialReservation ? 'edit' : 'create'
  )
  const [successKind, setSuccessKind] = useState<SuccessKind>('created')
  const [successScope, setSuccessScope] = useState<SuccessScope>('single')
  const [successOccurrenceCount, setSuccessOccurrenceCount] = useState(1)
  const [successRecurrenceSummary, setSuccessRecurrenceSummary] = useState('')
  const [bookingId, setBookingId] = useState<string | null>(initialReservation?.id ?? null)

  // ---- Submission state ----
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([])

  const selectedResourceIsReservable = resources.some(
    (resource) => resource.id === selectedResourceId
  )
  const selectedResourceName =
    resources.find((resource) => resource.id === selectedResourceId)?.name ?? 'Selected resource'
  const selectedResourceTypeId =
    resources.find((resource) => resource.id === selectedResourceId)?.resourceTypeId ?? ''
  const filteredResources = useMemo(
    () =>
      resourceTypeFilterId
        ? resources.filter((resource) => resource.resourceTypeId === resourceTypeFilterId)
        : resources,
    [resourceTypeFilterId, resources]
  )
  const customFieldSummary = useMemo(
    () =>
      customFields
        .map((field) => ({
          field,
          value: (customFieldDraft[field.id] ?? '').trim(),
        }))
        .filter((item) => item.value),
    [customFieldDraft, customFields]
  )
  const selectedOwner = owners.find((owner) => owner.appUserId === selectedOwnerId) ?? null
  const successTitle =
    successKind === 'updated'
      ? successScope === 'series'
        ? 'Series Updated'
        : 'Reservation Updated'
      : 'Reservation Confirmed'
  const successMessage =
    successKind === 'updated'
      ? successScope === 'series'
        ? 'Your recurring reservation changes have been saved.'
        : 'Your reservation changes have been saved.'
      : successScope === 'series'
        ? 'Your recurring reservation has been saved.'
        : 'Your reservation has been saved.'
  const titleId = mode === 'success' ? 'booking-success-title' : 'booking-modal-title'
  const descriptionId = mode === 'success' ? 'booking-success-description' : undefined
  const isSeriesEdit = saveMode === 'editSeries'
  const isRecurringCreate = saveMode === 'create' && recurrenceFrequency !== 'none'
  const isSeriesSave = isRecurringCreate || isSeriesEdit
  const resourceSelectionLocked = saveMode !== 'create'
  const handleResourceTypeFilterChange = useCallback(
    (nextResourceTypeId: string) => {
      setResourceTypeFilterId(nextResourceTypeId)
      if (
        selectedResourceId &&
        nextResourceTypeId &&
        selectedResourceTypeId !== nextResourceTypeId
      ) {
        setSelectedResourceId('')
      }
      setConflicts([])
      setError('')
    },
    [selectedResourceId, selectedResourceTypeId]
  )

  const handleSelectedResourceChange = useCallback(
    (nextResourceId: string) => {
      setSelectedResourceId(nextResourceId)
      const nextResourceTypeId =
        resources.find((resource) => resource.id === nextResourceId)?.resourceTypeId ?? ''
      if (nextResourceTypeId) {
        setResourceTypeFilterId(nextResourceTypeId)
      }
      setConflicts([])
      setError('')
    },
    [resources]
  )

  useEffect(() => {
    if (mode !== 'success') return
    const timer = window.setTimeout(() => okButtonRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [mode, successKind])

  // ---- Load reservable resources on mount ----
  useEffect(() => {
    const load = async () => {
      try {
        if (!currentUser) throw new Error('User identity is not available.')
        const [resourceTypeResult, resourceResult, permittedResourceTypeIds] = await Promise.all([
          Sfsures_resourcetypesService.getAll({
            select: ['sfsures_resourcetypeid', 'sfsures_name', 'sfsures_status'],
            filter: `sfsures_status eq ${RESOURCE_TYPE_STATUS_ACTIVE}`,
            orderBy: ['sfsures_name asc'],
            top: 500,
          }),
          Sfsures_resourcesService.getAll({
            select: [
              'sfsures_resourceid',
              'sfsures_name',
              'sfsures_recordstatus',
              '_sfsures_resourcetype_value',
            ],
            filter: `sfsures_recordstatus eq ${RECORD_STATUS_ACTIVE}`,
            orderBy: ['sfsures_name asc'],
            top: 500,
          }),
          loadPermittedResourceTypeIds(
            currentUser.groups,
            'book'
          ),
        ])

        const activeResourceTypeIds = new Set(
          ((resourceTypeResult.data ?? []) as Sfsures_resourcetypes[])
            .map((resourceType) => resourceType.sfsures_resourcetypeid)
            .filter(
              (id): id is string =>
                typeof id === 'string' &&
                id.length > 0 &&
                (currentUser.isAppAdmin || permittedResourceTypeIds.has(id))
            )
        )
        const loadedResourceTypes = ((resourceTypeResult.data ?? []) as Sfsures_resourcetypes[])
          .map((resourceType) => ({
            id: resourceType.sfsures_resourcetypeid,
            name: resourceType.sfsures_name,
          }))
          .filter(
            (resourceType): resourceType is ResourceTypeOption =>
              typeof resourceType.id === 'string' &&
              resourceType.id.length > 0 &&
              typeof resourceType.name === 'string' &&
              resourceType.name.length > 0 &&
              activeResourceTypeIds.has(resourceType.id)
          )
          .sort((a, b) => a.name.localeCompare(b.name))

        const opts: ResourceOption[] = ((resourceResult.data ?? []) as Sfsures_resources[])
          .filter((resource) => activeResourceTypeIds.has(resource._sfsures_resourcetype_value ?? ''))
          .map((resource) => ({
            id: resource.sfsures_resourceid,
            name: resource.sfsures_name ?? 'Unnamed',
            resourceTypeId: resource._sfsures_resourcetype_value ?? '',
          }))

        setResourceTypes(loadedResourceTypes)
        setResources(opts)
        setResourceTypeFilterId((current) => {
          const existingResource = opts.find(
            (resource) =>
              resource.id ===
              (initialSeries?.resourceId ?? initialReservation?.resourceId ?? initialResourceId)
          )
          if (existingResource) return existingResource.resourceTypeId
          if (current && loadedResourceTypes.some((resourceType) => resourceType.id === current)) {
            return current
          }
          return ''
        })

        // Auto-select the first resource if only one exists (common in early demo data).
        if (!initialResourceId && !initialReservation?.resourceId && !initialSeries?.resourceId) {
          const initialFilteredResources = initialResourceTypeId
            ? opts.filter((resource) => resource.resourceTypeId === initialResourceTypeId)
            : opts
          if (initialFilteredResources.length === 1) {
            setSelectedResourceId(initialFilteredResources[0].id)
          }
        }
      } catch (err) {
        console.error('Failed to load resources:', err)
        setError('Could not load the resource list. Try closing and reopening.')
      } finally {
        setResourcesLoading(false)
      }
    }

    load()
  }, [
    currentUser,
    initialReservation?.resourceId,
    initialResourceId,
    initialResourceTypeId,
    initialSeries?.resourceId,
  ])

  useEffect(() => {
    let cancelled = false

    const loadOwners = async () => {
      if (!currentUser || !selectedResourceId || !selectedResourceTypeId) {
        setOwners([])
        return
      }

      setOwnersLoading(true)
      try {
        let loadedOwners: ReservationOwnerOption[]
        if (currentUser.isAppAdmin) {
          const [eligibleOwners, adminOwner] = await Promise.all([
            loadEligibleReservationOwners(selectedResourceTypeId),
            loadMappedOwner(currentUser.appUserId),
          ])
          loadedOwners = adminOwner
            ? [
                adminOwner,
                ...eligibleOwners.filter((owner) => owner.appUserId !== adminOwner.appUserId),
              ]
            : eligibleOwners
        } else {
          loadedOwners = [await loadMappedOwner(currentUser.appUserId)].filter(
            (owner): owner is ReservationOwnerOption => owner !== null
          )
        }

        if (cancelled) return
        setOwners(loadedOwners)
        setSelectedOwnerId((current) => {
          if (loadedOwners.some((owner) => owner.appUserId === current)) return current
          if (!initialReservation && !initialSeries) {
            const actor = loadedOwners.find((owner) => owner.appUserId === currentUser.appUserId)
            return actor?.appUserId ?? loadedOwners[0]?.appUserId ?? ''
          }
          return current
        })
      } catch (err) {
        console.error('Failed to load eligible reservation owners:', err)
        if (!cancelled) {
          setOwners([])
          setError('Could not load eligible reservation owners for this resource.')
        }
      } finally {
        if (!cancelled) setOwnersLoading(false)
      }
    }

    void loadOwners()
    return () => {
      cancelled = true
    }
  }, [
    currentUser,
    initialReservation,
    initialSeries,
    selectedResourceId,
    selectedResourceTypeId,
  ])

  useEffect(() => {
    let cancelled = false

    const loadCustomFields = async () => {
      if (!selectedResourceId || !selectedResourceTypeId) {
        setCustomFields([])
        setCustomFieldAnswers([])
        setCustomFieldDraft({})
        return
      }

      setCustomFieldsLoading(true)
      try {
        const answerFilter = initialSeries
          ? `_sfsures_reservationseries_value eq ${initialSeries.id}`
          : initialReservation
            ? `_sfsures_reservationoccurrence_value eq ${initialReservation.id}`
            : ''
        const [definitionResult, answerResult] = await Promise.all([
          Sfsures_attributedefinitionsService.getAll({
            select: [
              'sfsures_attributedefinitionid',
              '_sfsures_resourcetype_value',
              '_sfsures_resource_value',
              'sfsures_name',
              'sfsures_datatype',
              'sfsures_appliesto',
              'sfsures_required',
              'sfsures_choiceoptions',
              'sfsures_displayorder',
            ],
            filter: `statecode eq 0 and sfsures_appliesto eq ${ATTRIBUTE_APPLIES_TO_RESERVATION}`,
            orderBy: ['sfsures_displayorder asc', 'sfsures_name asc'],
            top: 1000,
          }),
          answerFilter
            ? Sfsures_reservationattributevaluesService.getAll({
                select: [
                  'sfsures_reservationattributevalueid',
                  '_sfsures_attributedefinition_value',
                  'sfsures_valuetext',
                  'sfsures_valuechoice',
                  'sfsures_valuenumber',
                  'sfsures_valuedatetime',
                  'sfsures_valueboolean',
                ],
                filter: `statecode eq 0 and ${answerFilter}`,
                top: 1000,
              })
            : Promise.resolve({ data: [] as Sfsures_reservationattributevalues[] }),
        ])

        if (cancelled) return

        const effectiveFields = ((definitionResult.data ?? []) as Sfsures_attributedefinitions[])
          .filter((definition) => {
            const definitionResourceTypeId = definition._sfsures_resourcetype_value ?? ''
            const definitionResourceId = definition._sfsures_resource_value ?? ''
            return (
              definition.sfsures_appliesto === ATTRIBUTE_APPLIES_TO_RESERVATION &&
              (definitionResourceTypeId === selectedResourceTypeId ||
                definitionResourceId === selectedResourceId)
            )
          })
          .map((definition) => ({
            id: definition.sfsures_attributedefinitionid,
            resourceTypeId: definition._sfsures_resourcetype_value ?? '',
            resourceId: definition._sfsures_resource_value ?? '',
            name: definition.sfsures_name,
            dataType: definition.sfsures_datatype,
            required: definition.sfsures_required === true,
            choiceOptions: (definition.sfsures_choiceoptions ?? '')
              .split(/\r?\n/)
              .map((option) => option.trim())
              .filter(Boolean),
            displayOrder: definition.sfsures_displayorder ?? 0,
          }))
          .filter(
            (definition) =>
              definition.dataType === ATTRIBUTE_TYPE_TEXT ||
              definition.dataType === ATTRIBUTE_TYPE_CHOICE
          )
          .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name))

        const loadedAnswers = ((answerResult.data ?? []) as Sfsures_reservationattributevalues[]).map(
          (answer) => ({
            id: answer.sfsures_reservationattributevalueid,
            definitionId: answer._sfsures_attributedefinition_value ?? '',
            value: reservationAnswerValueText(answer),
          })
        )

        setCustomFields(effectiveFields)
        setCustomFieldAnswers(loadedAnswers)
        setCustomFieldDraft(
          Object.fromEntries(
            effectiveFields.map((field) => [
              field.id,
              loadedAnswers.find((answer) => answer.definitionId === field.id)?.value ?? '',
            ])
          )
        )
      } catch (err) {
        console.error('Failed to load reservation custom fields:', err)
        if (!cancelled) {
          setCustomFields([])
          setCustomFieldAnswers([])
          setCustomFieldDraft({})
          setError('Could not load reservation custom fields for this resource.')
        }
      } finally {
        if (!cancelled) setCustomFieldsLoading(false)
      }
    }

    void loadCustomFields()
    return () => {
      cancelled = true
    }
  }, [initialReservation, initialSeries, selectedResourceId, selectedResourceTypeId])

  const handleRecurrenceFrequencyChange = useCallback((frequency: RecurrenceFrequency) => {
    setRecurrenceFrequency(frequency)
    setConflicts([])
    setError('')

    if (frequency === 'weekly' && recurrenceFrequency !== 'weekly') {
      const parsedStart = fromDatetimeLocal(startStr)
      if (!isNaN(parsedStart.getTime())) {
        setWeeklyDays([weekdayKeyForDate(parsedStart)])
      }
    }
  }, [recurrenceFrequency, startStr])

  const toggleWeekday = useCallback((weekday: WeekdayKey) => {
    setWeeklyDays((current) => {
      if (current.includes(weekday)) {
        return current.filter((day) => day !== weekday)
      }
      return sortedWeekdays([...current, weekday])
    })
    setConflicts([])
    setError('')
  }, [])

  const resetRecurrenceFields = useCallback(() => {
    const parsedStart = fromDatetimeLocal(startStr)
    const recurrenceBaseDate = isNaN(parsedStart.getTime()) ? start : parsedStart

    setRecurrenceFrequency('none')
    setRecurrenceInterval('1')
    setWeeklyDays([weekdayKeyForDate(recurrenceBaseDate)])
    setRecurrenceEndMode('count')
    setOccurrenceCount(String(DEFAULT_RECURRENCE_COUNT))
    setUntilDate(defaultUntilDateFor(recurrenceBaseDate))
  }, [start, startStr])

  const handleEditBooking = useCallback(() => {
    if (!bookingId) return
    setError('')
    setConflicts([])
    setSaveMode('edit')
    setMode('form')
  }, [bookingId])

  const saveCustomFieldAnswers = useCallback(
    async (
      parent:
        | { occurrenceId: string; seriesId?: never }
        | { seriesId: string; occurrenceId?: never },
      existingAnswers: ReservationCustomFieldAnswer[] = [],
      allowDelete = true
    ) => {
      const parentId = 'occurrenceId' in parent ? parent.occurrenceId : parent.seriesId
      const effectiveDefinitionIds = new Set(customFields.map((field) => field.id))

      for (const definition of customFields) {
        const desired = (customFieldDraft[definition.id] ?? '').trim()
        const existing = existingAnswers.find((answer) => answer.definitionId === definition.id)

        if (!desired && existing && allowDelete) {
          await Sfsures_reservationattributevaluesService.delete(existing.id)
          continue
        }

        if (desired && existing) {
          await Sfsures_reservationattributevaluesService.update(existing.id, {
            sfsures_valuetext: definition.dataType === ATTRIBUTE_TYPE_TEXT ? desired : null,
            sfsures_valuechoice: definition.dataType === ATTRIBUTE_TYPE_CHOICE ? desired : null,
          } as unknown as Parameters<typeof Sfsures_reservationattributevaluesService.update>[1])
          continue
        }

        if (desired) {
          await Sfsures_reservationattributevaluesService.create({
            sfsures_name: `${parentId} - ${definition.name}`,
            'sfsures_AttributeDefinition@odata.bind': `/sfsures_attributedefinitions(${definition.id})`,
            ...('occurrenceId' in parent
              ? {
                  'sfsures_ReservationOccurrence@odata.bind': `/sfsures_reservationoccurrences(${parent.occurrenceId})`,
                }
              : {
                  'sfsures_ReservationSeries@odata.bind': `/sfsures_reservationserieses(${parent.seriesId})`,
                }),
            ...reservationAnswerValueFields(definition, desired),
            statecode: 0,
            statuscode: 1,
          } as unknown as Parameters<typeof Sfsures_reservationattributevaluesService.create>[0])
        }
      }

      if (allowDelete) {
        for (const existing of existingAnswers) {
          if (!effectiveDefinitionIds.has(existing.definitionId)) {
            await Sfsures_reservationattributevaluesService.delete(existing.id)
          }
        }
      }
    },
    [customFieldDraft, customFields]
  )

  // ---- Submit handler ----
  const handleSubmit = useCallback(async () => {
    setError('')
    setConflicts([])

    // --- Validate inputs ---
    if (!selectedResourceId) {
      setError('Select a resource.')
      return
    }

    if (!selectedResourceIsReservable) {
      setError('Choose an active resource whose Resource Type is active.')
      return
    }

    const startDate = fromDatetimeLocal(startStr)
    const endDate = fromDatetimeLocal(endStr)

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      setError('Start and end times are required.')
      return
    }

    if (endDate <= startDate) {
      setError('End time must be after the start time.')
      return
    }

    if (!currentUser) {
      setError('User identity not available. Try reloading the app.')
      return
    }

    if (!selectedOwner) {
      setError(
        currentUser.isAppAdmin
          ? 'Select an active, mapped App User with Book access to this resource.'
          : 'Your App User is not mapped to an active Dataverse User. Contact an administrator.'
      )
      return
    }

    const missingRequiredField = customFields.find(
      (field) => field.required && !(customFieldDraft[field.id] ?? '').trim()
    )
    if (missingRequiredField) {
      setError(`${missingRequiredField.name} is required.`)
      return
    }

    const invalidChoiceField = customFields.find(
      (field) =>
        field.dataType === ATTRIBUTE_TYPE_CHOICE &&
        (customFieldDraft[field.id] ?? '').trim() &&
        !field.choiceOptions.includes((customFieldDraft[field.id] ?? '').trim())
    )
    if (invalidChoiceField) {
      setError(`Choose a valid option for ${invalidChoiceField.name}.`)
      return
    }

    const isOccurrenceEdit = saveMode === 'edit'
    const isSeriesEditMode = saveMode === 'editSeries'
    const interval = parseWholeNumber(recurrenceInterval)
    const count = parseWholeNumber(occurrenceCount)
    const recurrenceBuild = buildRequestedOccurrences({
      startDate,
      endDate,
      frequency: isOccurrenceEdit ? 'none' : recurrenceFrequency,
      interval: interval ?? 0,
      weekdays: weeklyDays,
      endMode: recurrenceEndMode,
      occurrenceCount: count ?? 0,
      untilDate: endOfDateInput(untilDate),
      maxOccurrences: reservationLimits.maxOccurrences,
      maxSpanWeeks: reservationLimits.maxSpanWeeks,
    })

    if ('error' in recurrenceBuild) {
      setError(recurrenceBuild.error)
      return
    }

    const requestedOccurrences = recurrenceBuild.occurrences
    const firstOccurrence = requestedOccurrences[0]
    const lastOccurrence = requestedOccurrences[requestedOccurrences.length - 1]
    const isSeriesRequest = !isOccurrenceEdit && requestedOccurrences.length > 1

    setSaving(true)

    try {
      if (isOccurrenceEdit && !bookingId) {
        setError('Could not reopen this reservation for editing. Close the dialog and try again.')
        setSaving(false)
        return
      }

      if (isSeriesEditMode && !initialSeries) {
        setError('Could not reopen this series for editing. Close the dialog and try again.')
        setSaving(false)
        return
      }

      // --- Conflict detection ---
      // Overlap condition: existing.start < new.end AND existing.end > new.start
      const startIso = toDataverseIso(firstOccurrence.start)
      const endIso = toDataverseIso(lastOccurrence.end)
      const excludeCurrentBooking =
        !isSeriesRequest && isOccurrenceEdit && bookingId
          ? ` and sfsures_reservationoccurrenceid ne ${bookingId}`
          : ''
      const excludeCurrentSeries =
        isSeriesEditMode && initialSeries
          ? ` and _sfsures_series_value ne ${initialSeries.id}`
          : ''

      const [occResult, blackoutResult] = await Promise.all([
        // Active occurrences for this resource that overlap the requested window.
        Sfsures_reservationoccurrencesService.getAll({
          select: [
            'sfsures_reservationoccurrenceid',
            'sfsures_start',
            'sfsures_end',
          ],
          filter:
            `_sfsures_resource_value eq ${selectedResourceId}` +
            ` and sfsures_recordstatus eq 997330000` +
            ` and sfsures_start lt ${endIso}` +
            ` and sfsures_end gt ${startIso}` +
            excludeCurrentBooking +
            excludeCurrentSeries,
          orderBy: ['sfsures_start asc'],
          top: 500,
        }),
        // Blackout windows for this resource that overlap the requested window.
        Sfsures_blackoutwindowsService.getAll({
          select: [
            'sfsures_blackoutwindowid',
            'sfsures_start',
            'sfsures_end',
            'sfsures_reason',
          ],
          filter:
            `statecode eq 0` +
            ` and _sfsures_resource_value eq ${selectedResourceId}` +
            ` and sfsures_start lt ${endIso}` +
            ` and sfsures_end gt ${startIso}`,
          orderBy: ['sfsures_start asc'],
          top: 500,
        }),
      ])

      const found: ConflictInfo[] = []

      for (const requested of requestedOccurrences) {
        const requestedStartIso = toDataverseIso(requested.start)
        const requestedEndIso = toDataverseIso(requested.end)

        for (const occ of occResult.data ?? []) {
          if (!rangesOverlap(occ.sfsures_start ?? '', occ.sfsures_end ?? '', requested.start, requested.end)) {
            continue
          }

          found.push({
            type: 'reservation',
            start: occ.sfsures_start ?? '',
            end: occ.sfsures_end ?? '',
            occurrenceIndex: requested.index,
            requestedStart: requestedStartIso,
            requestedEnd: requestedEndIso,
            ownerName: undefined,
          })
        }

        for (const bw of blackoutResult.data ?? []) {
          if (!rangesOverlap(bw.sfsures_start ?? '', bw.sfsures_end ?? '', requested.start, requested.end)) {
            continue
          }

          found.push({
            type: 'blackout',
            start: bw.sfsures_start ?? '',
            end: bw.sfsures_end ?? '',
            occurrenceIndex: requested.index,
            requestedStart: requestedStartIso,
            requestedEnd: requestedEndIso,
            reason: bw.sfsures_reason ?? undefined,
          })
        }
      }

      if (found.length > 0) {
        setConflicts(found)
        setError(
          isSeriesRequest
            ? found.length === 1
              ? 'One occurrence conflicts with an existing reservation or blackout window.'
              : `${found.length} occurrences conflict with existing reservations or blackout windows.`
            : found.length === 1
              ? 'This time slot conflicts with an existing reservation or blackout window.'
              : `This time slot conflicts with ${found.length} existing reservations or blackout windows.`
        )
        setSaving(false)
        return
      }

      // --- No conflicts — create or update the occurrence ---
      // Lookup writes use @odata.bind navigation properties. The generated type is
      // over-strict for system-defaulted fields, so cast at the service boundary.
      const trimmedComments = comments.trim()
      const makeOccurrenceFields = (
        occurrence: RequestedOccurrence,
        seriesId?: string,
        includeBookingOwner = true,
        bookingOwnerId = selectedOwner.appUserId,
        systemUserId = selectedOwner.systemUserId
      ) => ({
        sfsures_name: `${selectedResourceName} ${formatShortDate(occurrence.start)}`,
        sfsures_start: toDataverseIso(occurrence.start),
        sfsures_end: toDataverseIso(occurrence.end),
        sfsures_recordstatus: RECORD_STATUS_ACTIVE,
        [RESERVATION_COMMENTS_FIELD]: trimmedComments || null,
        'sfsures_Resource@odata.bind': `/sfsures_resources(${selectedResourceId})`,
        ...(includeBookingOwner
          ? { 'sfsures_BookingOwner@odata.bind': `/sfsures_appusers(${bookingOwnerId})` }
          : {}),
        ...(includeBookingOwner
          ? { 'ownerid@odata.bind': `/systemusers(${systemUserId})` }
          : {}),
        ...(seriesId
          ? { 'sfsures_Series@odata.bind': `/sfsures_reservationserieses(${seriesId})` }
          : {}),
      })

      const makeSeriesFields = (includeBookingOwner = true) => ({
        sfsures_name: `${selectedResourceName} recurring reservation`,
        sfsures_comments: trimmedComments || null,
        sfsures_frequency: SERIES_FREQUENCY[recurrenceFrequency as SeriesFrequency],
        sfsures_interval: interval ?? 1,
        sfsures_daysofweek:
          recurrenceFrequency === 'weekly' ? sortedWeekdays(weeklyDays).join(',') : null,
        sfsures_endmode: SERIES_END_MODE[recurrenceEndMode],
        sfsures_occurrencecount:
          recurrenceEndMode === 'count' ? requestedOccurrences.length : null,
        sfsures_rangestart: toDataverseIso(firstOccurrence.start),
        sfsures_untildate:
          recurrenceEndMode === 'until' && endOfDateInput(untilDate)
            ? toDataverseIso(endOfDateInput(untilDate) as Date)
            : null,
        sfsures_recordstatus: RECORD_STATUS_ACTIVE,
        'sfsures_Resource@odata.bind': `/sfsures_resources(${selectedResourceId})`,
        ...(includeBookingOwner
          ? { 'sfsures_BookingOwner@odata.bind': `/sfsures_appusers(${selectedOwner.appUserId})` }
          : {}),
        ...(includeBookingOwner
          ? { 'ownerid@odata.bind': `/systemusers(${selectedOwner.systemUserId})` }
          : {}),
      })

      let auditTargetId: string | undefined
      let affectedRowIds: string[] = []

      if (isOccurrenceEdit && bookingId) {
        await Sfsures_reservationoccurrencesService.update(
          bookingId,
          makeOccurrenceFields(
            firstOccurrence,
            undefined,
            currentUser.isAppAdmin,
            selectedOwner.appUserId,
            selectedOwner.systemUserId
          ) as unknown as Parameters<typeof Sfsures_reservationoccurrencesService.update>[1]
        )
        await saveCustomFieldAnswers({ occurrenceId: bookingId }, customFieldAnswers)
        auditTargetId = bookingId
        affectedRowIds = [bookingId]
        setSuccessScope('single')
        setSuccessOccurrenceCount(1)
        setSuccessRecurrenceSummary('')
        setSuccessKind('updated')
      } else if (isSeriesEditMode && initialSeries) {
        const createdOccurrenceIds: string[] = []

        try {
          for (const occurrence of requestedOccurrences) {
            const occurrenceResult = await Sfsures_reservationoccurrencesService.create(
              makeOccurrenceFields(
                occurrence,
                initialSeries.id,
                true,
                selectedOwner.appUserId,
                selectedOwner.systemUserId
              ) as unknown as Parameters<typeof Sfsures_reservationoccurrencesService.create>[0]
            )
            const occurrenceId = occurrenceResult.data?.sfsures_reservationoccurrenceid
            if (occurrenceId) {
              createdOccurrenceIds.push(occurrenceId)
            }
          }

          await Sfsures_reservationseriesesService.update(
            initialSeries.id,
            makeSeriesFields(true) as unknown as Parameters<typeof Sfsures_reservationseriesesService.update>[1]
          )
          await saveCustomFieldAnswers({ seriesId: initialSeries.id }, customFieldAnswers)
          for (const occurrenceId of createdOccurrenceIds) {
            await saveCustomFieldAnswers({ occurrenceId }, [], false)
          }

          await Promise.all(
            initialSeries.activeOccurrenceIds.map((occurrenceId) =>
              Sfsures_reservationoccurrencesService.update(
                occurrenceId,
                {
                  sfsures_recordstatus: RECORD_STATUS_CANCELLED,
                } as unknown as Parameters<typeof Sfsures_reservationoccurrencesService.update>[1]
              )
            )
          )
        } catch (writeErr) {
          if (createdOccurrenceIds.length > 0) {
            const cleanupResults = await Promise.allSettled(
              createdOccurrenceIds.map((id) => Sfsures_reservationoccurrencesService.delete(id))
            )
            const cleanupFailed = cleanupResults.some((result) => result.status === 'rejected')
            if (cleanupFailed) {
              console.warn('Series edit cleanup failed after a partial update.', cleanupResults)
            }
          }

          throw writeErr
        }

        setBookingId(null)
        auditTargetId = initialSeries.id
        affectedRowIds = [
          initialSeries.id,
          ...createdOccurrenceIds,
          ...initialSeries.activeOccurrenceIds,
        ]
        setSuccessScope('series')
        setSuccessOccurrenceCount(requestedOccurrences.length)
        setSuccessRecurrenceSummary(recurrenceBuild.summary)
        setSuccessKind('updated')
      } else if (isSeriesRequest) {
        let seriesId: string | null = null
        const createdOccurrenceIds: string[] = []

        try {
          const seriesResult = await Sfsures_reservationseriesesService.create(
            makeSeriesFields() as unknown as Parameters<typeof Sfsures_reservationseriesesService.create>[0]
          )

          seriesId = seriesResult.data?.sfsures_reservationseriesid ?? null
          if (!seriesId) {
            throw new Error('The series was created but Dataverse did not return its ID.')
          }

          for (const occurrence of requestedOccurrences) {
            const occurrenceResult = await Sfsures_reservationoccurrencesService.create(
              makeOccurrenceFields(occurrence, seriesId) as unknown as Parameters<
                typeof Sfsures_reservationoccurrencesService.create
              >[0]
            )
            const occurrenceId = occurrenceResult.data?.sfsures_reservationoccurrenceid
            if (occurrenceId) {
              createdOccurrenceIds.push(occurrenceId)
            }
          }
          await saveCustomFieldAnswers({ seriesId }, [], false)
          for (const occurrenceId of createdOccurrenceIds) {
            await saveCustomFieldAnswers({ occurrenceId }, [], false)
          }
        } catch (writeErr) {
          const cleanupTasks = [
            ...createdOccurrenceIds.map((id) => Sfsures_reservationoccurrencesService.delete(id)),
            ...(seriesId ? [Sfsures_reservationseriesesService.delete(seriesId)] : []),
          ]

          if (cleanupTasks.length > 0) {
            const cleanupResults = await Promise.allSettled(cleanupTasks)
            const cleanupFailed = cleanupResults.some((result) => result.status === 'rejected')
            if (cleanupFailed) {
              console.warn('Recurring reservation cleanup failed after a partial create.', cleanupResults)
            }
          }

          throw writeErr
        }

        setBookingId(null)
        auditTargetId = seriesId ?? undefined
        affectedRowIds = [seriesId, ...createdOccurrenceIds].filter(
          (id): id is string => typeof id === 'string'
        )
        setSuccessScope('series')
        setSuccessOccurrenceCount(requestedOccurrences.length)
        setSuccessRecurrenceSummary(recurrenceBuild.summary)
        setSuccessKind('created')
        resetRecurrenceFields()
      } else {
        const result = await Sfsures_reservationoccurrencesService.create(
          makeOccurrenceFields(firstOccurrence) as unknown as Parameters<typeof Sfsures_reservationoccurrencesService.create>[0]
        )
        const createdBookingId = result.data?.sfsures_reservationoccurrenceid ?? null
        if (createdBookingId) {
          await saveCustomFieldAnswers({ occurrenceId: createdBookingId }, [], false)
        }
        setBookingId(createdBookingId)
        auditTargetId = createdBookingId ?? undefined
        affectedRowIds = createdBookingId ? [createdBookingId] : []
        setSaveMode('edit')
        setSuccessScope('single')
        setSuccessOccurrenceCount(1)
        setSuccessRecurrenceSummary('')
        setSuccessKind('created')
        resetRecurrenceFields()
      }

      const affectedScope = isSeriesRequest || isSeriesEditMode ? 'series' : 'occurrence'
      const previousOwnerId = initialSeries?.bookingOwnerId ?? initialReservation?.bookingOwnerId
      const ownershipChanged = !!previousOwnerId && previousOwnerId !== selectedOwner.appUserId
      const shouldAudit = saveMode === 'create' || ownershipChanged
      if (shouldAudit) {
        try {
          const previousOwner = previousOwnerId
            ? await loadMappedOwner(previousOwnerId, false)
            : null
          const auditWritten = await writeAuditLog({
            actor: currentUser,
            actionType:
              saveMode === 'create'
                ? AUDIT_ACTION_TYPES.reservationCreated
                : AUDIT_ACTION_TYPES.reservationModified,
            targetType: AUDIT_TARGET_TYPES.reservation,
            targetId: auditTargetId,
            targetLabel: selectedResourceName,
            beforeState: previousOwner
              ? reservationOwnerSnapshot(previousOwner)
              : previousOwnerId
                ? { appUserId: previousOwnerId }
                : undefined,
            afterState: reservationOwnerSnapshot(selectedOwner),
            details: {
              affectedScope,
              affectedRowIds,
              ownershipChanged,
            },
          })
          if (!auditWritten) {
            console.warn('Reservation saved, but its audit log row could not be written.')
          }
        } catch (auditErr) {
          console.error('Reservation saved, but ownership auditing failed:', auditErr)
        }
      }

      setMode('success')
      onBooked()
    } catch (err) {
      console.error('Reservation failed:', err)
      const detail = err instanceof Error ? err.message : 'An unexpected error occurred.'
      setError(
        saveMode === 'editSeries'
          ? `Series update failed: ${detail} Only the reservation owner or an admin can edit this series.`
          : saveMode === 'edit'
          ? `Reservation update failed: ${detail} Only the reservation owner or an admin can edit this reservation.`
          : `Reservation failed: ${detail}`
      )
    } finally {
      setSaving(false)
    }
  }, [
    selectedResourceId,
    selectedResourceIsReservable,
    startStr,
    endStr,
    comments,
    recurrenceFrequency,
    recurrenceInterval,
    weeklyDays,
    recurrenceEndMode,
    occurrenceCount,
    untilDate,
    reservationLimits.maxOccurrences,
    reservationLimits.maxSpanWeeks,
    currentUser,
    selectedOwner,
    customFields,
    customFieldDraft,
    customFieldAnswers,
    saveCustomFieldAnswers,
    saveMode,
    bookingId,
    initialReservation,
    initialSeries,
    selectedResourceName,
    resetRecurrenceFields,
    onBooked,
  ])

  // ---- Keyboard: Escape closes ----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // ---- Render ----
  const canSubmit =
    selectedResourceIsReservable &&
    !!selectedOwner &&
    !!startStr &&
    !!endStr &&
    !saving &&
    !resourcesLoading &&
    !ownersLoading &&
    !customFieldsLoading
  const submitLabel = isSeriesEdit
    ? 'Save Series'
    : saveMode === 'edit'
      ? 'Save Changes'
      : isRecurringCreate
        ? 'Reserve Series'
        : 'Reserve'
  const savingLabel = isSeriesEdit
    ? 'Saving series...'
    : isRecurringCreate
      ? 'Reserving series...'
      : 'Reserving...'
  const parsedStartForDateInput = fromDatetimeLocal(startStr)
  const minUntilDate = isNaN(parsedStartForDateInput.getTime())
    ? toDateInput(start)
    : toDateInput(parsedStartForDateInput)
  const recurrenceIntervalNumber = parseWholeNumber(recurrenceInterval) ?? 1
  const recurrenceFrequencyOptions: Array<[RecurrenceFrequency, string]> = isSeriesEdit
    ? [
        ['daily', 'Daily'],
        ['weekly', 'Weekly'],
        ['monthly', 'Monthly'],
      ]
    : [
        ['none', 'None'],
        ['daily', 'Daily'],
        ['weekly', 'Weekly'],
        ['monthly', 'Monthly'],
      ]

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        ref={dialogRef}
        className={styles.modal}
        style={{ borderTopColor: theme.primaryColor }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        {/*
          Always-mounted assertive live region. Screen readers announce changes to
          its text without focus moving. Kept visually hidden; the visual banner
          below carries the same information (plus the conflict list) for sighted
          users and stays navigable for screen-reader users who want detail.
        */}
        <div className={styles.srOnly} role="alert" aria-live="assertive" aria-atomic="true">
          {error}
        </div>

        {/* Header */}
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            <span>
              {mode === 'success'
                ? successTitle
                : isSeriesEdit
                  ? 'Edit Series'
                : saveMode === 'edit'
                  ? 'Edit Reservation'
                  : 'New Reservation'}
            </span>
            {mode === 'success' && (
              <img
                src={greenCheckUrl}
                alt=""
                aria-hidden="true"
                className={styles.confirmationIcon}
              />
            )}
          </h2>
          {mode === 'form' && (
            <button
              className={styles.closeBtn}
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          )}
        </div>

        {mode === 'success' ? (
          <div className={styles.body}>
            <div
              id="booking-success-description"
              className={styles.successPanel}
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <p className={styles.successMessage}>{successMessage}</p>
              <div className={styles.successSummary}>
                <p className={styles.summaryResource}>{selectedResourceName}</p>
                <p className={styles.summaryTime}>
                  {successScope === 'series' ? 'First occurrence: ' : ''}
                  {formatInputRange(startStr, endStr)}
                </p>
                {successScope === 'series' && (
                  <div className={styles.summarySeriesBlock}>
                    <p className={styles.summaryLabel}>
                      {successOccurrenceCount} reservations{' '}
                      {successKind === 'updated' ? 'saved' : 'created'}
                    </p>
                    <p className={styles.summarySeries}>{successRecurrenceSummary}</p>
                  </div>
                )}
                {comments.trim() && (
                  <div className={styles.summaryCommentsBlock}>
                    <p className={styles.summaryLabel}>Comments</p>
                    <p className={styles.summaryComments}>{comments.trim()}</p>
                  </div>
                )}
                {customFieldSummary.length > 0 && (
                  <div className={styles.summaryCommentsBlock}>
                    <p className={styles.summaryLabel}>Custom Fields</p>
                    {customFieldSummary.map(({ field, value }) => (
                      <p key={field.id} className={styles.summaryComments}>
                        <strong>{field.name}:</strong> {value}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.body}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="booking-resource-type">
                Resource Type
              </label>
              {resourcesLoading ? (
                <p className={styles.resourcesLoading}>
                  <span className={styles.spinner} style={{ borderTopColor: theme.primaryColor }} />
                  Loading resource types…
                </p>
              ) : resourceTypes.length === 0 ? (
                <p className={styles.resourcesLoading}>
                  No reservable Resource Types found. Contact your administrator.
                </p>
              ) : (
                <select
                  id="booking-resource-type"
                  className={styles.select}
                  value={resourceTypeFilterId}
                  disabled={resourceSelectionLocked}
                  onChange={(event) => handleResourceTypeFilterChange(event.target.value)}
                >
                  <option value="">All Resource Types</option>
                  {resourceTypes.map((resourceType) => (
                    <option key={resourceType.id} value={resourceType.id}>
                      {resourceType.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Resource picker */}
            <div className={styles.field}>
              <label className={styles.label} htmlFor="booking-resource">
                Resource
              </label>
              {resourcesLoading ? (
                <p className={styles.resourcesLoading}>
                  <span className={styles.spinner} style={{ borderTopColor: theme.primaryColor }} />
                  Loading resources…
                </p>
              ) : resources.length === 0 ? (
                <p className={styles.resourcesLoading}>
                  No reservable resources found. Contact your administrator.
                </p>
              ) : filteredResources.length === 0 ? (
                <p className={styles.resourcesLoading}>
                  No reservable resources found for this Resource Type.
                </p>
              ) : (
                <select
                  id="booking-resource"
                  className={styles.select}
                  value={selectedResourceId}
                  disabled={resourceSelectionLocked}
                  onChange={(e) => handleSelectedResourceChange(e.target.value)}
                >
                  {selectedResourceId && !selectedResourceIsReservable && (
                    <option value={selectedResourceId} disabled>
                      Current resource is not reservable
                    </option>
                  )}
                  <option value="">Select a resource…</option>
                  {filteredResources.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              )}
              {selectedResourceId && !selectedResourceIsReservable && !resourcesLoading && (
                <p className={styles.limitHint}>
                  This resource is not currently reservable because it is disabled or its
                  Resource Type is inactive.
                </p>
              )}
            </div>

            {currentUser?.isAppAdmin && (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="booking-owner">
                  Reservation owner
                </label>
                {ownersLoading ? (
                  <p className={styles.resourcesLoading}>
                    <span className={styles.spinner} style={{ borderTopColor: theme.primaryColor }} />
                    Loading eligible owners…
                  </p>
                ) : (
                  <select
                    id="booking-owner"
                    className={styles.select}
                    value={selectedOwnerId}
                    onChange={(event) => {
                      setSelectedOwnerId(event.target.value)
                      setError('')
                    }}
                    disabled={!selectedResourceId}
                  >
                    <option value="">Select an eligible owner…</option>
                    {owners.map((owner) => (
                      <option key={owner.appUserId} value={owner.appUserId}>
                        {owner.displayName} ({owner.sfStateId})
                      </option>
                    ))}
                  </select>
                )}
                {!ownersLoading && selectedResourceId && owners.length === 0 && (
                  <p className={styles.limitHint}>
                    No active mapped App Users have Book access to this resource.
                  </p>
                )}
                {selectedOwner && (
                  <p className={styles.limitHint}>
                    {isSeriesEdit
                      ? 'Saving transfers the entire recurring series and all replacement occurrences.'
                      : saveMode === 'edit'
                        ? 'Saving transfers this occurrence only.'
                        : 'The reservation will be created for this person.'}
                  </p>
                )}
              </div>
            )}

            {/* Start / End */}
            <div className={styles.timeRow}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="booking-start">
                  Start
                </label>
                <input
                  id="booking-start"
                  type="datetime-local"
                  className={styles.input}
                  value={startStr}
                  onChange={(e) => {
                    setStartStr(e.target.value)
                    setConflicts([])
                    setError('')
                  }}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="booking-end">
                  End
                </label>
                <input
                  id="booking-end"
                  type="datetime-local"
                  className={styles.input}
                  value={endStr}
                  onChange={(e) => {
                    setEndStr(e.target.value)
                    setConflicts([])
                    setError('')
                  }}
                />
              </div>
            </div>
            <p className={styles.limitHint}>
              Reservations can span up to {formatWeekLimit(reservationLimits.maxSpanWeeks)}.
            </p>

            {/* Recurrence */}
            {(saveMode === 'create' || isSeriesEdit) && (
              <section className={styles.recurrenceSection} aria-labelledby="booking-repeat-label">
                <div className={styles.field}>
                  <p id="booking-repeat-label" className={styles.label}>
                    Repeat
                  </p>
                  <div className={styles.segmentedControl} role="group" aria-label="Repeat pattern">
                    {recurrenceFrequencyOptions.map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={
                          recurrenceFrequency === value
                            ? `${styles.segmentButton} ${styles.segmentButtonActive}`
                            : styles.segmentButton
                        }
                        aria-pressed={recurrenceFrequency === value}
                        onClick={() => handleRecurrenceFrequencyChange(value as RecurrenceFrequency)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {isSeriesSave && (
                  <div className={styles.recurrenceDetails}>
                    <div className={styles.inlineField}>
                      <label className={styles.label} htmlFor="booking-repeat-interval">
                        Every
                      </label>
                      <div className={styles.intervalControl}>
                        <input
                          id="booking-repeat-interval"
                          type="number"
                          min="1"
                          max="99"
                          inputMode="numeric"
                          className={styles.compactInput}
                          value={recurrenceInterval}
                          onChange={(e) => {
                            setRecurrenceInterval(e.target.value)
                            setConflicts([])
                            setError('')
                          }}
                        />
                        <span className={styles.intervalUnit}>
                          {frequencyNoun(recurrenceFrequency, recurrenceIntervalNumber)}
                        </span>
                      </div>
                    </div>

                    {recurrenceFrequency === 'weekly' && (
                      <div className={styles.field}>
                        <p className={styles.label}>On</p>
                        <div className={styles.weekdayGroup} role="group" aria-label="Repeat on">
                          {WEEKDAYS.map((weekday) => (
                            <button
                              key={weekday.key}
                              type="button"
                              className={
                                weeklyDays.includes(weekday.key)
                                  ? `${styles.weekdayButton} ${styles.weekdayButtonActive}`
                                  : styles.weekdayButton
                              }
                              aria-pressed={weeklyDays.includes(weekday.key)}
                              onClick={() => toggleWeekday(weekday.key)}
                            >
                              {weekday.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className={styles.field}>
                      <p className={styles.label}>Ends</p>
                      <div className={styles.segmentedControl} role="group" aria-label="Recurrence end">
                        {[
                          ['count', 'After count'],
                          ['until', 'On date'],
                        ].map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            className={
                              recurrenceEndMode === value
                                ? `${styles.segmentButton} ${styles.segmentButtonActive}`
                                : styles.segmentButton
                            }
                            aria-pressed={recurrenceEndMode === value}
                            onClick={() => {
                              setRecurrenceEndMode(value as RecurrenceEndMode)
                              setConflicts([])
                              setError('')
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {recurrenceEndMode === 'count' ? (
                      <div className={styles.inlineField}>
                        <label className={styles.label} htmlFor="booking-occurrence-count">
                          Occurrences
                        </label>
                        <input
                          id="booking-occurrence-count"
                          type="number"
                          min="2"
                          max={reservationLimits.maxOccurrences}
                          inputMode="numeric"
                          className={styles.compactInput}
                          value={occurrenceCount}
                          onChange={(e) => {
                            setOccurrenceCount(e.target.value)
                            setConflicts([])
                            setError('')
                          }}
                        />
                      </div>
                    ) : (
                      <div className={styles.inlineField}>
                        <label className={styles.label} htmlFor="booking-until-date">
                          End date
                        </label>
                        <input
                          id="booking-until-date"
                          type="date"
                          min={minUntilDate}
                          className={styles.input}
                          value={untilDate}
                          onChange={(e) => {
                            setUntilDate(e.target.value)
                            setConflicts([])
                            setError('')
                          }}
                        />
                      </div>
                    )}

                    <p className={styles.limitHint}>
                      Recurring reservations can create up to {reservationLimits.maxOccurrences}{' '}
                      occurrences across {formatWeekLimit(reservationLimits.maxSpanWeeks)}.
                    </p>
                  </div>
                )}
              </section>
            )}

            {customFieldsLoading ? (
              <p className={styles.resourcesLoading}>
                <span className={styles.spinner} style={{ borderTopColor: theme.primaryColor }} />
                Loading custom fields...
              </p>
            ) : customFields.length > 0 ? (
              <section className={styles.recurrenceSection} aria-labelledby="booking-custom-fields">
                <p id="booking-custom-fields" className={styles.label}>
                  Custom Fields
                </p>
                {customFields.map((field) => (
                  <div key={field.id} className={styles.field}>
                    <label className={styles.label} htmlFor={`booking-custom-field-${field.id}`}>
                      {field.name}
                      {field.required ? ' (Required)' : ''}
                    </label>
                    {field.dataType === ATTRIBUTE_TYPE_CHOICE ? (
                      <select
                        id={`booking-custom-field-${field.id}`}
                        className={styles.select}
                        value={customFieldDraft[field.id] ?? ''}
                        required={field.required}
                        aria-required={field.required}
                        onChange={(event) => {
                          setCustomFieldDraft((current) => ({
                            ...current,
                            [field.id]: event.target.value,
                          }))
                          setError('')
                        }}
                      >
                        <option value="">Select an option...</option>
                        {field.choiceOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={`booking-custom-field-${field.id}`}
                        className={styles.input}
                        value={customFieldDraft[field.id] ?? ''}
                        required={field.required}
                        aria-required={field.required}
                        onChange={(event) => {
                          setCustomFieldDraft((current) => ({
                            ...current,
                            [field.id]: event.target.value,
                          }))
                          setError('')
                        }}
                      />
                    )}
                  </div>
                ))}
              </section>
            ) : null}

            {/* Comments */}
            <div className={styles.field}>
              <label className={styles.label} htmlFor="booking-comments">
                Comments
              </label>
              <textarea
                id="booking-comments"
                className={styles.textarea}
                value={comments}
                onChange={(e) => {
                  setComments(e.target.value)
                  setError('')
                }}
                rows={4}
              />
            </div>

            {/* Error / conflict banner (visual). aria-hidden is intentionally NOT set —
                screen-reader users can navigate here for the full conflict list; the
                live region above handles the automatic announcement. */}
            {error && (
              <div className={styles.errorBanner}>
                <strong>{error}</strong>
                {conflicts.length > 0 && (
                  <ul className={styles.conflictList}>
                    {conflicts.slice(0, 3).map((c, i) => (
                      <li key={i}>
                        {c.type === 'blackout'
                          ? `${formatConflictPrefix(c)}Blackout: ${formatRange(c.start, c.end)}${c.reason ? ` - ${c.reason}` : ''}`
                          : `${formatConflictPrefix(c)}Reservation: ${formatRange(c.start, c.end)}${c.ownerName ? ` (${c.ownerName})` : ''}`}
                      </li>
                    ))}
                    {conflicts.length > 3 && (
                      <li>…and {conflicts.length - 3} more</li>
                    )}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className={styles.footer}>
          {mode === 'success' ? (
            <>
              {successScope === 'single' && (
                <button
                  className={styles.btnSecondary}
                  onClick={handleEditBooking}
                  disabled={!bookingId}
                >
                  Edit Reservation
                </button>
              )}
              <button
                ref={okButtonRef}
                className={styles.btnPrimary}
                style={{ backgroundColor: theme.primaryColor }}
                onClick={onClose}
              >
                OK
              </button>
            </>
          ) : (
            <>
              <button className={styles.btnSecondary} onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button
                className={styles.btnPrimary}
                style={{ backgroundColor: theme.primaryColor }}
                onClick={handleSubmit}
                disabled={!canSubmit}
              >
                {saving ? savingLabel : submitLabel}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
