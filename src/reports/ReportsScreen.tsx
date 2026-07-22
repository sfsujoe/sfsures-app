import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useCurrentUser } from '../auth/UserContext'
import { Sfsures_appusersService } from '../generated/services/Sfsures_appusersService'
import { Sfsures_groupsService } from '../generated/services/Sfsures_groupsService'
import { Sfsures_reservationoccurrencesService } from '../generated/services/Sfsures_reservationoccurrencesService'
import { Sfsures_resourcesService } from '../generated/services/Sfsures_resourcesService'
import { Sfsures_resourcetypesService } from '../generated/services/Sfsures_resourcetypesService'
import { Sfsures_usergroupassignmentsService } from '../generated/services/Sfsures_usergroupassignmentsService'
import type { Sfsures_reservationoccurrences } from '../generated/models/Sfsures_reservationoccurrencesModel'
import { useTheme } from '../theme/ThemeContext'
import styles from './ReportsScreen.module.css'

interface ReportsScreenProps {
  onBack: () => void
}

type ReportScope = 'resource' | 'resourceType' | 'user' | 'group'
type RangeMode = 'today' | 'currentWeek' | 'currentMonth' | 'yearToDate' | 'allTime' | 'custom'
type StatusMode = 'activeAndCancelled' | 'active' | 'cancelled'
type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'
type SortKey =
  | 'start'
  | 'end'
  | 'hours'
  | 'status'
  | 'resourceType'
  | 'resource'
  | 'owner'
  | 'groups'
  | 'title'
type SortDirection = 'asc' | 'desc'

interface ReportFilters {
  scope: ReportScope
  targetId: string
  rangeMode: RangeMode
  customStart: string
  customEnd: string
  statusMode: StatusMode
}

interface ReferenceOption {
  id: string
  name: string
}

interface ResourceOption extends ReferenceOption {
  resourceTypeId: string
}

interface UserOption extends ReferenceOption {
  email: string
  sfStateId: string
}

interface AssignmentOption {
  groupId: string
  userId: string
}

interface ReportRow {
  id: string
  title: string
  resource: string
  resourceType: string
  owner: string
  ownerEmail: string
  groups: string
  startIso: string
  endIso: string
  start: string
  end: string
  hours: number
  hoursLabel: string
  status: 'Active' | 'Cancelled'
  comments: string
}

interface DateRange {
  startIso?: string
  endIso?: string
  label: string
}

const RECORD_STATUS_ACTIVE = 997330000
const RECORD_STATUS_CANCELLED = 997330001

const DEFAULT_FILTERS: ReportFilters = {
  scope: 'resource',
  targetId: '',
  rangeMode: 'currentMonth',
  customStart: dateInputValue(new Date()),
  customEnd: dateInputValue(new Date()),
  statusMode: 'activeAndCancelled',
}

const SCOPE_LABELS: Record<ReportScope, string> = {
  resource: 'Resource',
  resourceType: 'Resource Type',
  user: 'User',
  group: 'Group',
}

const RANGE_LABELS: Record<RangeMode, string> = {
  today: 'Today',
  currentWeek: 'Current Week',
  currentMonth: 'Current Month',
  yearToDate: 'Year to Date',
  allTime: 'All Time',
  custom: 'Custom Range',
}

const STATUS_LABELS: Record<StatusMode, string> = {
  activeAndCancelled: 'Active and Cancelled',
  active: 'Active only',
  cancelled: 'Cancelled only',
}

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function dateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function dateFromInput(value: string): Date | null {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  const date = new Date(year, month - 1, day)
  return isNaN(date.getTime()) ? null : date
}

function normalizeDataverseId(id: string | undefined | null): string {
  return id?.replace(/[{}]/g, '').toLowerCase() ?? ''
}

function formatDateTime(value: string | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  return isNaN(date.getTime()) ? '' : dateTimeFormatter.format(date)
}

function formatHours(hours: number): string {
  return hours.toLocaleString(undefined, {
    minimumFractionDigits: hours % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 2,
  })
}

function csvEscape(value: string | number): string {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function downloadCsv(filename: string, rows: ReportRow[]) {
  const headers = [
    'Start',
    'End',
    'Hours',
    'Status',
    'Resource Type',
    'Resource',
    'Booking Owner',
    'Owner Email',
    'Owner Groups',
    'Title',
    'Comments',
  ]
  const body = rows.map((row) => [
    row.start,
    row.end,
    row.hoursLabel,
    row.status,
    row.resourceType,
    row.resource,
    row.owner,
    row.ownerEmail,
    row.groups,
    row.title,
    row.comments,
  ])
  const csv = [headers, ...body]
    .map((line) => line.map(csvEscape).join(','))
    .join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
}

export default function ReportsScreen({ onBack }: ReportsScreenProps) {
  const currentUser = useCurrentUser()
  const { theme } = useTheme()
  const [filters, setFilters] = useState<ReportFilters>(DEFAULT_FILTERS)
  const [resources, setResources] = useState<ResourceOption[]>([])
  const [resourceTypes, setResourceTypes] = useState<ReferenceOption[]>([])
  const [users, setUsers] = useState<UserOption[]>([])
  const [groups, setGroups] = useState<ReferenceOption[]>([])
  const [assignments, setAssignments] = useState<AssignmentOption[]>([])
  const [referenceStatus, setReferenceStatus] = useState<LoadStatus>('idle')
  const [reportStatus, setReportStatus] = useState<LoadStatus>('idle')
  const [reportRows, setReportRows] = useState<ReportRow[]>([])
  const [error, setError] = useState('')
  const [hasViewedReport, setHasViewedReport] = useState(false)
  const [activeAction, setActiveAction] = useState<'view' | 'download' | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('start')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const reportsVars = {
    '--reports-primary': theme.primaryColor,
    '--reports-accent': theme.accentColor,
    '--reports-date-header': theme.dateHeaderColor,
  } as CSSProperties

  useEffect(() => {
    let cancelled = false

    async function loadReferences() {
      setReferenceStatus('loading')
      setError('')

      try {
        const [resourceTypeResult, resourceResult, userResult, groupResult, assignmentResult] =
          await Promise.all([
            Sfsures_resourcetypesService.getAll({
              select: ['sfsures_resourcetypeid', 'sfsures_name', 'sfsures_status', 'statecode'],
              filter: 'statecode eq 0',
              orderBy: ['sfsures_name asc'],
              top: 5000,
            }),
            Sfsures_resourcesService.getAll({
              select: [
                'sfsures_resourceid',
                'sfsures_name',
                '_sfsures_resourcetype_value',
                'sfsures_recordstatus',
                'statecode',
              ],
              filter: 'statecode eq 0',
              orderBy: ['sfsures_name asc'],
              top: 5000,
            }),
            Sfsures_appusersService.getAll({
              select: [
                'sfsures_appuserid',
                'sfsures_displayname',
                'sfsures_email',
                'sfsures_sfstateid',
                'sfsures_recordstatus',
                'statecode',
              ],
              filter: 'statecode eq 0',
              orderBy: ['sfsures_displayname asc', 'sfsures_sfstateid asc'],
              top: 5000,
            }),
            Sfsures_groupsService.getAll({
              select: ['sfsures_groupid', 'sfsures_name', 'sfsures_recordstatus', 'statecode'],
              filter: 'statecode eq 0 and sfsures_recordstatus eq 997330000',
              orderBy: ['sfsures_name asc'],
              top: 5000,
            }),
            Sfsures_usergroupassignmentsService.getAll({
              select: [
                'sfsures_usergroupassignmentid',
                '_sfsures_group_value',
                '_sfsures_user_value',
                'statecode',
              ],
              filter: 'statecode eq 0',
              top: 5000,
            }),
          ])

        if (cancelled) return

        setResourceTypes(
          (resourceTypeResult.data ?? [])
            .filter((row) => row.sfsures_resourcetypeid && row.sfsures_name)
            .map((row) => ({
              id: normalizeDataverseId(row.sfsures_resourcetypeid),
              name: row.sfsures_name as string,
            }))
        )
        setResources(
          (resourceResult.data ?? [])
            .filter((row) => row.sfsures_resourceid && row.sfsures_name)
            .map((row) => ({
              id: normalizeDataverseId(row.sfsures_resourceid),
              name: row.sfsures_name as string,
              resourceTypeId: normalizeDataverseId(row._sfsures_resourcetype_value),
            }))
        )
        setUsers(
          (userResult.data ?? [])
            .filter((row) => row.sfsures_appuserid)
            .map((row) => ({
              id: normalizeDataverseId(row.sfsures_appuserid),
              name:
                row.sfsures_displayname?.trim() ||
                row.sfsures_email?.trim() ||
                row.sfsures_sfstateid ||
                'Unnamed user',
              email: row.sfsures_email?.trim() ?? '',
              sfStateId: row.sfsures_sfstateid ?? '',
            }))
        )
        setGroups(
          (groupResult.data ?? [])
            .filter((row) => row.sfsures_groupid && row.sfsures_name)
            .map((row) => ({
              id: normalizeDataverseId(row.sfsures_groupid),
              name: row.sfsures_name as string,
            }))
        )
        setAssignments(
          (assignmentResult.data ?? [])
            .filter((row) => row._sfsures_group_value && row._sfsures_user_value)
            .map((row) => ({
              groupId: normalizeDataverseId(row._sfsures_group_value),
              userId: normalizeDataverseId(row._sfsures_user_value),
            }))
        )
        setReferenceStatus('ready')
      } catch (err) {
        if (cancelled) return
        console.error('Reports reference data load failed:', err)
        setReferenceStatus('error')
        setError(err instanceof Error ? err.message : 'Report filters could not be loaded.')
      }
    }

    loadReferences()

    return () => {
      cancelled = true
    }
  }, [])

  const resourceTypeById = useMemo(
    () => new Map(resourceTypes.map((resourceType) => [resourceType.id, resourceType])),
    [resourceTypes]
  )
  const resourceById = useMemo(
    () => new Map(resources.map((resource) => [resource.id, resource])),
    [resources]
  )
  const userById = useMemo(
    () => new Map(users.map((user) => [user.id, user])),
    [users]
  )
  const groupById = useMemo(
    () => new Map(groups.map((group) => [group.id, group])),
    [groups]
  )
  const ownerGroupNamesByUser = useMemo(() => {
    const namesByUser = new Map<string, string[]>()
    for (const assignment of assignments) {
      const groupName = groupById.get(assignment.groupId)?.name
      if (!groupName) continue
      const names = namesByUser.get(assignment.userId) ?? []
      names.push(groupName)
      namesByUser.set(assignment.userId, names)
    }

    for (const [userId, names] of namesByUser) {
      namesByUser.set(userId, Array.from(new Set(names)).sort(compareText))
    }

    return namesByUser
  }, [assignments, groupById])

  const targetOptions = useMemo<ReferenceOption[]>(() => {
    if (filters.scope === 'resource') return resources
    if (filters.scope === 'resourceType') return resourceTypes
    if (filters.scope === 'user') return users
    return groups
  }, [filters.scope, groups, resourceTypes, resources, users])

  const dateRange = useMemo<DateRange>(() => {
    const today = startOfLocalDay(new Date())

    if (filters.rangeMode === 'allTime') {
      return { label: RANGE_LABELS.allTime }
    }

    if (filters.rangeMode === 'today') {
      return {
        startIso: today.toISOString(),
        endIso: addDays(today, 1).toISOString(),
        label: RANGE_LABELS.today,
      }
    }

    if (filters.rangeMode === 'currentWeek') {
      const start = addDays(today, -today.getDay())
      return {
        startIso: start.toISOString(),
        endIso: addDays(start, 7).toISOString(),
        label: RANGE_LABELS.currentWeek,
      }
    }

    if (filters.rangeMode === 'currentMonth') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1)
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 1)
      return {
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        label: RANGE_LABELS.currentMonth,
      }
    }

    if (filters.rangeMode === 'yearToDate') {
      const start = new Date(today.getFullYear(), 0, 1)
      return {
        startIso: start.toISOString(),
        endIso: addDays(today, 1).toISOString(),
        label: RANGE_LABELS.yearToDate,
      }
    }

    const customStart = dateFromInput(filters.customStart)
    const customEnd = dateFromInput(filters.customEnd)
    if (!customStart || !customEnd || customStart > customEnd) {
      return { label: RANGE_LABELS.custom }
    }

    return {
      startIso: customStart.toISOString(),
      endIso: addDays(customEnd, 1).toISOString(),
      label: `${filters.customStart} to ${filters.customEnd}`,
    }
  }, [filters.customEnd, filters.customStart, filters.rangeMode])

  const sortedRows = useMemo(() => {
    const rows = [...reportRows]
    rows.sort((a, b) => {
      let result = 0
      if (sortKey === 'hours') {
        result = a.hours - b.hours
      } else if (sortKey === 'start') {
        result = compareText(a.startIso, b.startIso)
      } else if (sortKey === 'end') {
        result = compareText(a.endIso, b.endIso)
      } else {
        result = compareText(String(a[sortKey]), String(b[sortKey]))
      }

      return sortDirection === 'asc' ? result : -result
    })
    return rows
  }, [reportRows, sortDirection, sortKey])

  const summary = useMemo(() => {
    const uniqueOwners = new Set(reportRows.map((row) => row.owner).filter(Boolean))
    const uniqueResources = new Set(reportRows.map((row) => row.resource).filter(Boolean))
    const cancelled = reportRows.filter((row) => row.status === 'Cancelled').length
    const hours = reportRows.reduce((total, row) => total + row.hours, 0)

    return {
      count: reportRows.length,
      hours,
      cancelled,
      uniqueOwners: uniqueOwners.size,
      uniqueResources: uniqueResources.size,
    }
  }, [reportRows])

  function targetLabel(): string {
    if (!filters.targetId) return `All ${SCOPE_LABELS[filters.scope]}s`
    return targetOptions.find((option) => option.id === filters.targetId)?.name ?? 'Selected item'
  }

  function clearReportResults() {
    setReportRows([])
    setHasViewedReport(false)
    setReportStatus('idle')
    setError('')
  }

  function setFilter<K extends keyof ReportFilters>(key: K, value: ReportFilters[K]) {
    clearReportResults()
    setFilters((current) => ({ ...current, [key]: value }))
  }

  function changeScope(scope: ReportScope) {
    clearReportResults()
    setFilters((current) => ({ ...current, scope, targetId: '' }))
  }

  function dateRangeFilterParts(): string[] {
    if (filters.rangeMode === 'custom') {
      const customStart = dateFromInput(filters.customStart)
      const customEnd = dateFromInput(filters.customEnd)
      if (!customStart || !customEnd) {
        throw new Error('Choose both custom report dates.')
      }
      if (customStart > customEnd) {
        throw new Error('The custom start date must be on or before the end date.')
      }
    }

    if (!dateRange.startIso || !dateRange.endIso) return []
    return [`sfsures_start lt ${dateRange.endIso}`, `sfsures_end gt ${dateRange.startIso}`]
  }

  function targetFilterPart(): string | null {
    if (!filters.targetId) return null

    if (filters.scope === 'resource') {
      return `_sfsures_resource_value eq ${filters.targetId}`
    }

    if (filters.scope === 'resourceType') {
      const resourceIds = resources
        .filter((resource) => resource.resourceTypeId === filters.targetId)
        .map((resource) => resource.id)
      if (resourceIds.length === 0) return '__empty__'
      return `(${resourceIds.map((id) => `_sfsures_resource_value eq ${id}`).join(' or ')})`
    }

    if (filters.scope === 'user') {
      return `_sfsures_bookingowner_value eq ${filters.targetId}`
    }

    const userIds = assignments
      .filter((assignment) => assignment.groupId === filters.targetId)
      .map((assignment) => assignment.userId)
    const uniqueUserIds = Array.from(new Set(userIds))
    if (uniqueUserIds.length === 0) return '__empty__'
    return `(${uniqueUserIds.map((id) => `_sfsures_bookingowner_value eq ${id}`).join(' or ')})`
  }

  function buildOccurrenceFilter(): string | null {
    const parts = ['statecode eq 0', ...dateRangeFilterParts()]

    if (filters.statusMode === 'active') {
      parts.push(`sfsures_recordstatus eq ${RECORD_STATUS_ACTIVE}`)
    } else if (filters.statusMode === 'cancelled') {
      parts.push(`sfsures_recordstatus eq ${RECORD_STATUS_CANCELLED}`)
    } else {
      parts.push(
        `(sfsures_recordstatus eq ${RECORD_STATUS_ACTIVE} or sfsures_recordstatus eq ${RECORD_STATUS_CANCELLED})`
      )
    }

    const targetPart = targetFilterPart()
    if (targetPart === '__empty__') return null
    if (targetPart) parts.push(targetPart)

    return parts.join(' and ')
  }

  function rowFromOccurrence(occurrence: Sfsures_reservationoccurrences): ReportRow | null {
    const occurrenceId = normalizeDataverseId(occurrence.sfsures_reservationoccurrenceid)
    const resourceId = normalizeDataverseId(occurrence._sfsures_resource_value)
    const ownerId = normalizeDataverseId(occurrence._sfsures_bookingowner_value)
    const startIso = occurrence.sfsures_start ?? ''
    const endIso = occurrence.sfsures_end ?? ''
    const start = new Date(startIso)
    const end = new Date(endIso)

    if (!occurrenceId || !startIso || !endIso || isNaN(start.getTime()) || isNaN(end.getTime())) {
      return null
    }

    const resource = resourceById.get(resourceId)
    const resourceType = resource ? resourceTypeById.get(resource.resourceTypeId) : undefined
    const owner = userById.get(ownerId)
    const hours = Math.max(0, (end.getTime() - start.getTime()) / 36e5)

    return {
      id: occurrenceId,
      title: occurrence.sfsures_name?.trim() || 'Untitled reservation',
      resource: resource?.name ?? 'Unknown resource',
      resourceType: resourceType?.name ?? 'Unknown Resource Type',
      owner: owner?.name ?? 'Unknown owner',
      ownerEmail: owner?.email ?? '',
      groups: ownerGroupNamesByUser.get(ownerId)?.join('; ') ?? '',
      startIso,
      endIso,
      start: formatDateTime(startIso),
      end: formatDateTime(endIso),
      hours,
      hoursLabel: formatHours(hours),
      status:
        occurrence.sfsures_recordstatus === RECORD_STATUS_CANCELLED ? 'Cancelled' : 'Active',
      comments: occurrence.sfsures_comments?.trim() ?? '',
    }
  }

  async function loadReportRows(): Promise<ReportRow[]> {
    if (referenceStatus !== 'ready') {
      throw new Error('Report reference data is still loading.')
    }

    const filter = buildOccurrenceFilter()
    if (filter === null) return []

    const result = await Sfsures_reservationoccurrencesService.getAll({
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
      filter,
      orderBy: ['sfsures_start asc'],
      top: 5000,
    })

    return (result.data ?? [])
      .map(rowFromOccurrence)
      .filter((row): row is ReportRow => row !== null)
  }

  async function runReport(action: 'view' | 'download') {
    setActiveAction(action)
    setReportStatus('loading')
    setError('')

    try {
      const rows = await loadReportRows()
      setReportRows(rows)
      setReportStatus('ready')
      if (action === 'view') {
        setHasViewedReport(true)
      } else {
        const today = dateInputValue(new Date())
        const scope = filters.scope.toLowerCase()
        downloadCsv(`sfsures-${scope}-report-${today}.csv`, rows)
      }
    } catch (err) {
      console.error('Report run failed:', err)
      setReportStatus('error')
      setError(err instanceof Error ? err.message : 'The report could not be generated.')
    } finally {
      setActiveAction(null)
    }
  }

  function handleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(nextKey)
      setSortDirection(nextKey === 'start' ? 'asc' : 'desc')
    }
  }

  function renderSortHeader(key: SortKey, label: string) {
    const active = sortKey === key
    return (
      <th scope="col" aria-sort={active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className={styles.sortButton} onClick={() => handleSort(key)}>
          <span>{label}</span>
          <span aria-hidden="true" className={styles.sortGlyph}>
            {active ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
          </span>
        </button>
      </th>
    )
  }

  const controlsDisabled = referenceStatus !== 'ready' || reportStatus === 'loading'

  if (currentUser?.canViewReports !== true) {
    return (
      <div className={styles.denied} style={reportsVars}>
        <div className={styles.deniedPanel}>
          <p className={styles.eyebrow}>Reports</p>
          <h1>Access unavailable</h1>
          <button type="button" className={styles.primaryButton} onClick={onBack}>
            Calendar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.reportsShell} style={reportsVars}>
      <aside className={styles.rail}>
        <button type="button" className={styles.backButton} onClick={onBack}>
          Calendar
        </button>
      </aside>

      <main className={styles.workspace}>
        <header className={styles.workspaceHeader}>
          <div>
            <p className={styles.eyebrow}>Reports</p>
            <h1>Reservation Reports</h1>
          </div>
          <p className={styles.signedIn}>{currentUser.displayName}</p>
        </header>

        <section className={styles.reportPanel} aria-labelledby="report-builder-heading">
          <div className={styles.panelHeader}>
            <div>
              <h2 id="report-builder-heading">Build Report</h2>
              <p className={styles.panelMeta}>{targetLabel()} · {dateRange.label} · {STATUS_LABELS[filters.statusMode]}</p>
            </div>
            <div className={styles.actionButtons}>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={controlsDisabled}
                onClick={() => runReport('download')}
              >
                {activeAction === 'download' ? 'Preparing CSV...' : 'Download CSV'}
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={controlsDisabled}
                onClick={() => runReport('view')}
              >
                {activeAction === 'view' ? 'Loading...' : 'View in Browser'}
              </button>
            </div>
          </div>

          {referenceStatus === 'loading' && (
            <div className={styles.inlineStatus} role="status">
              Loading report filters...
            </div>
          )}

          <div className={styles.filterGrid}>
            <fieldset className={styles.scopeFieldset} disabled={controlsDisabled}>
              <legend>Pull Report By</legend>
              <div className={styles.scopeChoices}>
                {(Object.keys(SCOPE_LABELS) as ReportScope[]).map((scope) => (
                  <label
                    key={scope}
                    className={
                      filters.scope === scope
                        ? `${styles.scopeChoice} ${styles.scopeChoiceActive}`
                        : styles.scopeChoice
                    }
                  >
                    <input
                      type="radio"
                      name="report-scope"
                      checked={filters.scope === scope}
                      onChange={() => changeScope(scope)}
                    />
                    <span>{SCOPE_LABELS[scope]}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className={styles.field}>
              <span>{SCOPE_LABELS[filters.scope]}</span>
              <select
                value={filters.targetId}
                disabled={controlsDisabled}
                onChange={(event) => setFilter('targetId', event.target.value)}
              >
                <option value="">{`All ${SCOPE_LABELS[filters.scope]}s`}</option>
                {targetOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span>Report Range</span>
              <select
                value={filters.rangeMode}
                disabled={controlsDisabled}
                onChange={(event) => setFilter('rangeMode', event.target.value as RangeMode)}
              >
                {(Object.keys(RANGE_LABELS) as RangeMode[]).map((rangeMode) => (
                  <option key={rangeMode} value={rangeMode}>
                    {RANGE_LABELS[rangeMode]}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span>Status</span>
              <select
                value={filters.statusMode}
                disabled={controlsDisabled}
                onChange={(event) => setFilter('statusMode', event.target.value as StatusMode)}
              >
                {(Object.keys(STATUS_LABELS) as StatusMode[]).map((statusMode) => (
                  <option key={statusMode} value={statusMode}>
                    {STATUS_LABELS[statusMode]}
                  </option>
                ))}
              </select>
            </label>

            {filters.rangeMode === 'custom' && (
              <div className={styles.customRange}>
                <label className={styles.field}>
                  <span>Start Date</span>
                  <input
                    type="date"
                    value={filters.customStart}
                    disabled={controlsDisabled}
                    onChange={(event) => setFilter('customStart', event.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  <span>End Date</span>
                  <input
                    type="date"
                    value={filters.customEnd}
                    disabled={controlsDisabled}
                    onChange={(event) => setFilter('customEnd', event.target.value)}
                  />
                </label>
              </div>
            )}
          </div>

          {error && (
            <div className={styles.errorBanner} role="alert">
              {error}
            </div>
          )}
        </section>

        {hasViewedReport && (
          <section className={styles.resultsPanel} aria-labelledby="report-results-heading">
            <div className={styles.resultsHeader}>
              <div>
                <h2 id="report-results-heading">Results</h2>
                <p className={styles.panelMeta}>{summary.count.toLocaleString()} reservation rows</p>
              </div>
            </div>

            <div className={styles.summaryGrid} aria-label="Report summary">
              <div className={styles.summaryItem}>
                <span>Reservations</span>
                <strong>{summary.count.toLocaleString()}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span>Total Hours</span>
                <strong>{formatHours(summary.hours)}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span>Resources</span>
                <strong>{summary.uniqueResources.toLocaleString()}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span>Users</span>
                <strong>{summary.uniqueOwners.toLocaleString()}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span>Cancelled</span>
                <strong>{summary.cancelled.toLocaleString()}</strong>
              </div>
            </div>

            {sortedRows.length === 0 ? (
              <p className={styles.emptyState}>No reservations match these filters.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.resultsTable}>
                  <thead>
                    <tr>
                      {renderSortHeader('start', 'Start')}
                      {renderSortHeader('end', 'End')}
                      {renderSortHeader('hours', 'Hours')}
                      {renderSortHeader('status', 'Status')}
                      {renderSortHeader('resourceType', 'Resource Type')}
                      {renderSortHeader('resource', 'Resource')}
                      {renderSortHeader('owner', 'User')}
                      {renderSortHeader('groups', 'Groups')}
                      {renderSortHeader('title', 'Title')}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.start}</td>
                        <td>{row.end}</td>
                        <td className={styles.numericCell}>{row.hoursLabel}</td>
                        <td>
                          <span
                            className={
                              row.status === 'Cancelled'
                                ? `${styles.statusPill} ${styles.statusCancelled}`
                                : styles.statusPill
                            }
                          >
                            {row.status}
                          </span>
                        </td>
                        <td>{row.resourceType}</td>
                        <td>{row.resource}</td>
                        <td>
                          <span className={styles.primaryCellText}>{row.owner}</span>
                          {row.ownerEmail && <span className={styles.secondaryCellText}>{row.ownerEmail}</span>}
                        </td>
                        <td>{row.groups || 'None'}</td>
                        <td>
                          <span className={styles.primaryCellText}>{row.title}</span>
                          {row.comments && <span className={styles.secondaryCellText}>{row.comments}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  )
}
