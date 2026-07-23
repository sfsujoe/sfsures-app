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
type ViewerMode = 'reports' | 'visualization'
type VisualizationType =
  | 'reservationsOverTime'
  | 'hoursByResource'
  | 'reservationsByResourceType'
  | 'topUsers'
type SortKey =
  | 'start'
  | 'end'
  | 'hours'
  | 'status'
  | 'resourceType'
  | 'resource'
  | 'owner'
  | 'groups'
  | 'comments'
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

interface VisualizationDatum {
  label: string
  value: number
  secondary?: string
}

interface VisualizationModel {
  title: string
  subtitle: string
  unit: 'count' | 'hours'
  data: VisualizationDatum[]
}

const RECORD_STATUS_ACTIVE = 997330000
const RECORD_STATUS_CANCELLED = 997330001
const COMMENT_PREVIEW_LENGTH = 180
const MAX_VISUALIZATION_ITEMS = 12

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

const VISUALIZATION_LABELS: Record<VisualizationType, string> = {
  reservationsOverTime: 'Reservations over Time',
  hoursByResource: 'Hours by Resource',
  reservationsByResourceType: 'Reservations by Resource Type',
  topUsers: 'Top Users',
}

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const dayBucketFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
})

const monthBucketFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  year: 'numeric',
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

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function truncateLabel(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 1))}...` : value
}

function metricLabel(value: number, unit: VisualizationModel['unit']): string {
  if (unit === 'hours') {
    return `${formatHours(value)} hr${value === 1 ? '' : 's'}`
  }

  return `${value.toLocaleString()} reservation${value === 1 ? '' : 's'}`
}

function addMetric(map: Map<string, number>, label: string, amount: number) {
  map.set(label, (map.get(label) ?? 0) + amount)
}

function startOfWeek(date: Date): Date {
  const start = startOfLocalDay(date)
  start.setDate(start.getDate() - start.getDay())
  return start
}

function timeBucket(row: ReportRow, dateRange: DateRange): { label: string; key: string } {
  const rowDate = new Date(row.startIso)
  const rangeStart = dateRange.startIso ? new Date(dateRange.startIso) : null
  const rangeEnd = dateRange.endIso ? new Date(dateRange.endIso) : null
  const rangeDays =
    rangeStart && rangeEnd && !isNaN(rangeStart.getTime()) && !isNaN(rangeEnd.getTime())
      ? (rangeEnd.getTime() - rangeStart.getTime()) / 864e5
      : Number.POSITIVE_INFINITY

  if (rangeDays <= 21) {
    return {
      key: dateInputValue(rowDate),
      label: dayBucketFormatter.format(rowDate),
    }
  }

  if (rangeDays <= 180) {
    const weekStart = startOfWeek(rowDate)
    return {
      key: dateInputValue(weekStart),
      label: `Week of ${dayBucketFormatter.format(weekStart)}`,
    }
  }

  const monthStart = new Date(rowDate.getFullYear(), rowDate.getMonth(), 1)
  return {
    key: `${rowDate.getFullYear()}-${`${rowDate.getMonth() + 1}`.padStart(2, '0')}`,
    label: monthBucketFormatter.format(monthStart),
  }
}

function sortedVisualizationData(metrics: Map<string, number>): VisualizationDatum[] {
  return Array.from(metrics, ([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || compareText(a.label, b.label))
    .slice(0, MAX_VISUALIZATION_ITEMS)
}

function buildVisualizationModel(
  rows: ReportRow[],
  visualizationType: VisualizationType,
  dateRange: DateRange
): VisualizationModel {
  if (visualizationType === 'reservationsOverTime') {
    const metrics = new Map<string, { label: string; value: number }>()
    for (const row of rows) {
      const bucket = timeBucket(row, dateRange)
      const current = metrics.get(bucket.key) ?? { label: bucket.label, value: 0 }
      current.value += 1
      metrics.set(bucket.key, current)
    }

    return {
      title: VISUALIZATION_LABELS.reservationsOverTime,
      subtitle: `${dateRange.label} · ${rows.length.toLocaleString()} reservation rows`,
      unit: 'count',
      data: Array.from(metrics)
        .sort(([a], [b]) => compareText(a, b))
        .map(([, datum]) => datum),
    }
  }

  if (visualizationType === 'hoursByResource') {
    const metrics = new Map<string, number>()
    for (const row of rows) {
      addMetric(metrics, row.resource || 'Unknown resource', row.hours)
    }

    return {
      title: VISUALIZATION_LABELS.hoursByResource,
      subtitle: `${dateRange.label} · Top ${MAX_VISUALIZATION_ITEMS} resources by reserved hours`,
      unit: 'hours',
      data: sortedVisualizationData(metrics),
    }
  }

  if (visualizationType === 'reservationsByResourceType') {
    const metrics = new Map<string, number>()
    for (const row of rows) {
      addMetric(metrics, row.resourceType || 'Unknown Resource Type', 1)
    }

    return {
      title: VISUALIZATION_LABELS.reservationsByResourceType,
      subtitle: `${dateRange.label} · Top ${MAX_VISUALIZATION_ITEMS} resource types by reservation count`,
      unit: 'count',
      data: sortedVisualizationData(metrics),
    }
  }

  const metrics = new Map<string, number>()
  const hoursByUser = new Map<string, number>()
  for (const row of rows) {
    const label = row.owner || 'Unknown owner'
    addMetric(metrics, label, 1)
    addMetric(hoursByUser, label, row.hours)
  }

  return {
    title: VISUALIZATION_LABELS.topUsers,
    subtitle: `${dateRange.label} · Top ${MAX_VISUALIZATION_ITEMS} users by reservation count`,
    unit: 'count',
    data: sortedVisualizationData(metrics).map((datum) => ({
      ...datum,
      secondary: metricLabel(hoursByUser.get(datum.label) ?? 0, 'hours'),
    })),
  }
}

function visualizationSvg(model: VisualizationModel, colors: { primaryColor: string; accentColor: string; dateHeaderColor: string }): string {
  const width = 960
  const height = 420
  const left = 220
  const right = 44
  const top = 76
  const bottom = 44
  const plotWidth = width - left - right
  const data = model.data
  const max = Math.max(1, ...data.map((datum) => datum.value))
  const rowHeight = data.length > 0 ? Math.min(34, (height - top - bottom) / data.length) : 34
  const barHeight = Math.max(12, Math.min(22, rowHeight * 0.62))
  const escapedTitle = escapeXml(model.title)
  const escapedSubtitle = escapeXml(model.subtitle)

  if (data.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="visualization-title visualization-desc"><title id="visualization-title">${escapedTitle}</title><desc id="visualization-desc">${escapedSubtitle}</desc><rect width="${width}" height="${height}" fill="#ffffff"/><text x="32" y="42" fill="#1a1a1a" font-family="Source Sans 3, Segoe UI, sans-serif" font-size="24" font-weight="700">${escapedTitle}</text><text x="32" y="68" fill="#555555" font-family="Source Sans 3, Segoe UI, sans-serif" font-size="14">${escapedSubtitle}</text><rect x="32" y="132" width="${width - 64}" height="120" rx="8" fill="#f7f7f7" stroke="#dddddd"/><text x="${width / 2}" y="196" text-anchor="middle" fill="#555555" font-family="Source Sans 3, Segoe UI, sans-serif" font-size="18" font-weight="600">No reservations match these filters.</text></svg>`
  }

  const rowsMarkup = data
    .map((datum, index) => {
      const y = top + index * rowHeight
      const barWidth = Math.max(2, (datum.value / max) * plotWidth)
      const label = escapeXml(truncateLabel(datum.label, 30))
      const value = escapeXml(metricLabel(datum.value, model.unit))
      const secondary = datum.secondary ? ` · ${escapeXml(datum.secondary)}` : ''
      const fill = index % 2 === 0 ? colors.primaryColor : colors.accentColor

      return `<text x="32" y="${y + barHeight}" fill="#333333" font-family="Source Sans 3, Segoe UI, sans-serif" font-size="14" font-weight="600">${label}</text><rect x="${left}" y="${y + 3}" width="${barWidth}" height="${barHeight}" rx="4" fill="${escapeXml(fill)}"/><text x="${Math.min(width - right, left + barWidth + 10)}" y="${y + barHeight}" fill="#333333" font-family="Source Sans 3, Segoe UI, sans-serif" font-size="13">${value}${secondary}</text>`
    })
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="visualization-title visualization-desc"><title id="visualization-title">${escapedTitle}</title><desc id="visualization-desc">${escapedSubtitle}</desc><rect width="${width}" height="${height}" fill="#ffffff"/><rect x="0" y="0" width="${width}" height="8" fill="${escapeXml(colors.dateHeaderColor)}"/><text x="32" y="42" fill="#1a1a1a" font-family="Source Sans 3, Segoe UI, sans-serif" font-size="24" font-weight="700">${escapedTitle}</text><text x="32" y="68" fill="#555555" font-family="Source Sans 3, Segoe UI, sans-serif" font-size="14">${escapedSubtitle}</text><line x1="${left}" y1="${top - 10}" x2="${left}" y2="${height - bottom + 4}" stroke="#dddddd"/><line x1="${left}" y1="${height - bottom + 4}" x2="${width - right}" y2="${height - bottom + 4}" stroke="#dddddd"/>${rowsMarkup}</svg>`
}

function downloadSvg(filename: string, svg: string) {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export default function ReportsScreen({ onBack }: ReportsScreenProps) {
  const currentUser = useCurrentUser()
  const { theme } = useTheme()
  const [viewerMode, setViewerMode] = useState<ViewerMode>('reports')
  const [visualizationType, setVisualizationType] = useState<VisualizationType>('reservationsOverTime')
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
  const [expandedCommentIds, setExpandedCommentIds] = useState<Set<string>>(() => new Set())

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

  const visualizationModel = useMemo(
    () => buildVisualizationModel(reportRows, visualizationType, dateRange),
    [dateRange, reportRows, visualizationType]
  )

  const visualizationMarkup = useMemo(
    () =>
      visualizationSvg(visualizationModel, {
        primaryColor: theme.primaryColor,
        accentColor: theme.accentColor,
        dateHeaderColor: theme.dateHeaderColor,
      }),
    [theme.accentColor, theme.dateHeaderColor, theme.primaryColor, visualizationModel]
  )

  function targetLabel(): string {
    if (!filters.targetId) return `All ${SCOPE_LABELS[filters.scope]}s`
    return targetOptions.find((option) => option.id === filters.targetId)?.name ?? 'Selected item'
  }

  function clearReportResults() {
    setReportRows([])
    setExpandedCommentIds(new Set())
    setHasViewedReport(false)
    setReportStatus('idle')
    setError('')
  }

  function clearSelections() {
    clearReportResults()
    setFilters({
      ...DEFAULT_FILTERS,
      customStart: dateInputValue(new Date()),
      customEnd: dateInputValue(new Date()),
    })
    setVisualizationType('reservationsOverTime')
    setSortKey('start')
    setSortDirection('asc')
  }

  function changeViewerMode(mode: ViewerMode) {
    if (viewerMode === mode) return
    clearReportResults()
    setViewerMode(mode)
  }

  function setFilter<K extends keyof ReportFilters>(key: K, value: ReportFilters[K]) {
    clearReportResults()
    setFilters((current) => ({ ...current, [key]: value }))
  }

  function changeVisualizationType(type: VisualizationType) {
    clearReportResults()
    setVisualizationType(type)
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
      } else if (viewerMode === 'reports') {
        const today = dateInputValue(new Date())
        const scope = filters.scope.toLowerCase()
        downloadCsv(`sfsures-${scope}-report-${today}.csv`, rows)
      } else {
        const today = dateInputValue(new Date())
        const scope = filters.scope.toLowerCase()
        const model = buildVisualizationModel(rows, visualizationType, dateRange)
        const svg = visualizationSvg(model, {
          primaryColor: theme.primaryColor,
          accentColor: theme.accentColor,
          dateHeaderColor: theme.dateHeaderColor,
        })
        downloadSvg(`sfsures-${scope}-${visualizationType}-${today}.svg`, svg)
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

  function toggleComment(rowId: string) {
    setExpandedCommentIds((current) => {
      const next = new Set(current)
      if (next.has(rowId)) {
        next.delete(rowId)
      } else {
        next.add(rowId)
      }
      return next
    })
  }

  function renderCommentsCell(row: ReportRow) {
    if (!row.comments) {
      return <span className={styles.emptyCellText}>None</span>
    }

    const isExpanded = expandedCommentIds.has(row.id)
    const canExpand = row.comments.length > COMMENT_PREVIEW_LENGTH
    const commentId = `report-comment-${row.id}`

    return (
      <div className={styles.commentCell}>
        <span
          id={commentId}
          className={isExpanded || !canExpand ? styles.commentText : `${styles.commentText} ${styles.commentPreview}`}
        >
          {row.comments}
        </span>
        {canExpand && (
          <button
            type="button"
            className={styles.inlineLinkButton}
            aria-controls={commentId}
            aria-expanded={isExpanded}
            onClick={() => toggleComment(row.id)}
          >
            {isExpanded ? 'Less' : 'More...'}
          </button>
        )}
      </div>
    )
  }

  const controlsDisabled = referenceStatus !== 'ready' || reportStatus === 'loading'
  const downloadButtonText =
    activeAction === 'download'
      ? viewerMode === 'visualization'
        ? 'Preparing Image...'
        : 'Preparing CSV...'
      : viewerMode === 'visualization'
        ? 'Download Image'
        : 'Download CSV'

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
        <nav className={styles.railNav} aria-label="Reports views">
          <button
            type="button"
            className={
              viewerMode === 'reports'
                ? `${styles.railNavButton} ${styles.railNavButtonActive}`
                : styles.railNavButton
            }
            onClick={() => changeViewerMode('reports')}
          >
            Reservation Reports
          </button>
          <button
            type="button"
            className={
              viewerMode === 'visualization'
                ? `${styles.railNavButton} ${styles.railNavButtonActive}`
                : styles.railNavButton
            }
            onClick={() => changeViewerMode('visualization')}
          >
            Visualization
          </button>
        </nav>
      </aside>

      <main className={styles.workspace}>
        <header className={styles.workspaceHeader}>
          <div>
            <p className={styles.eyebrow}>Reports</p>
            <h1>Reservation Data Viewer</h1>
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
                disabled={reportStatus === 'loading'}
                onClick={clearSelections}
              >
                Clear Selections
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={controlsDisabled}
                onClick={() => runReport('download')}
              >
                {downloadButtonText}
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

            {viewerMode === 'visualization' && (
              <label className={styles.field}>
                <span>Visualization</span>
                <select
                  value={visualizationType}
                  disabled={controlsDisabled}
                  onChange={(event) => changeVisualizationType(event.target.value as VisualizationType)}
                >
                  {(Object.keys(VISUALIZATION_LABELS) as VisualizationType[]).map((type) => (
                    <option key={type} value={type}>
                      {VISUALIZATION_LABELS[type]}
                    </option>
                  ))}
                </select>
              </label>
            )}

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

            {viewerMode === 'visualization' ? (
              <div className={styles.visualizationCanvas} dangerouslySetInnerHTML={{ __html: visualizationMarkup }} />
            ) : sortedRows.length === 0 ? (
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
                      {renderSortHeader('comments', 'Comments')}
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
                        <td>{renderCommentsCell(row)}</td>
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
