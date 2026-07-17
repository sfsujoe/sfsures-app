import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useFocusTrap } from '../a11y/useFocusTrap'
import { AUDIT_ACTION_TYPES, AUDIT_TARGET_TYPES, writeAuditLog } from '../audit/auditLog'
import { useCurrentUser } from '../auth/UserContext'
import type { Sfsures_blackoutwindows } from '../generated/models/Sfsures_blackoutwindowsModel'
import type { Sfsures_reservationoccurrences } from '../generated/models/Sfsures_reservationoccurrencesModel'
import type { Sfsures_resources } from '../generated/models/Sfsures_resourcesModel'
import { Sfsures_blackoutwindowsService } from '../generated/services/Sfsures_blackoutwindowsService'
import { Sfsures_reservationoccurrencesService } from '../generated/services/Sfsures_reservationoccurrencesService'
import { Sfsures_resourcesService } from '../generated/services/Sfsures_resourcesService'
import styles from './AdminApp.module.css'

interface AdminResource {
  resourceId: string
  name: string
  location: string
  recordStatus: number
}

interface BlackoutWindow {
  blackoutId: string
  name: string
  resourceId: string
  resourceName: string
  start: string
  end: string
  reason: string
  createdByName: string
  createdOn: string
}

interface BlackoutForm {
  resourceId: string
  start: string
  end: string
  reason: string
}

interface ReservationOverlap {
  occurrenceId: string
  start: string
  end: string
  ownerName: string
}

type SortMode = 'newest' | 'oldest' | 'resource'

const RESOURCE_STATUS_ACTIVE = 997330000
const RESERVATION_STATUS_ACTIVE = 997330000

function toDataverseIso(date: Date): string {
  return date.toISOString().split('.')[0] + 'Z'
}

function toDatetimeLocal(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

function fromDatetimeLocal(value: string): Date {
  return new Date(value)
}

function nextHourSlot(): { start: Date; end: Date } {
  const start = new Date()
  start.setMinutes(0, 0, 0)
  start.setHours(start.getHours() + 1)
  const end = new Date(start)
  end.setHours(end.getHours() + 1)
  return { start, end }
}

function emptyBlackoutForm(resourceId = ''): BlackoutForm {
  const slot = nextHourSlot()
  return {
    resourceId,
    start: toDatetimeLocal(slot.start),
    end: toDatetimeLocal(slot.end),
    reason: '',
  }
}

function formatBlackoutRange(startIso: string, endIso: string): string {
  const start = new Date(startIso)
  const end = new Date(endIso)

  if (isNaN(start.getTime())) return 'Time unavailable'

  const date = start.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const startTime = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const endTime = isNaN(end.getTime())
    ? ''
    : end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

  return endTime ? `${date}, ${startTime} to ${endTime}` : `${date}, ${startTime}`
}

function formatCreatedDate(value: string): string {
  if (!value) return 'Unavailable'
  const date = new Date(value)
  if (isNaN(date.getTime())) return 'Unavailable'
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function isCurrentBlackout(blackout: Pick<BlackoutWindow, 'start' | 'end'>, now: Date): boolean {
  const start = new Date(blackout.start)
  const end = new Date(blackout.end)
  return !isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= now && end >= now
}

function isUpcomingBlackout(blackout: Pick<BlackoutWindow, 'end'>, now: Date): boolean {
  const end = new Date(blackout.end)
  return !isNaN(end.getTime()) && end >= now
}

function blackoutMatchesSearch(blackout: BlackoutWindow, search: string): boolean {
  const normalizedSearch = search.trim().toLowerCase()
  if (!normalizedSearch) return true

  return [
    blackout.resourceName,
    blackout.reason,
    blackout.createdByName,
    formatBlackoutRange(blackout.start, blackout.end),
  ].some((value) => value.toLowerCase().includes(normalizedSearch))
}

function blackoutSnapshot(blackout: BlackoutWindow | BlackoutForm, resourceName?: string) {
  return {
    blackoutId: 'blackoutId' in blackout ? blackout.blackoutId : undefined,
    resourceId: blackout.resourceId,
    resourceName: resourceName ?? ('resourceName' in blackout ? blackout.resourceName : undefined),
    start: 'start' in blackout ? blackout.start : undefined,
    end: 'end' in blackout ? blackout.end : undefined,
    reason: blackout.reason || null,
  }
}

function blackoutResourceDisplayName(
  blackout: Sfsures_blackoutwindows & Record<string, unknown>,
  resourceName: string | undefined
): string {
  const formattedValue =
    blackout['sfsures_Resource@OData.Community.Display.V1.FormattedValue'] ??
    blackout['_sfsures_resource_value@OData.Community.Display.V1.FormattedValue']

  return typeof formattedValue === 'string' && formattedValue.trim()
    ? formattedValue
    : resourceName ?? 'Unknown resource'
}

function occurrenceOwnerDisplayName(
  occurrence: Sfsures_reservationoccurrences & Record<string, unknown>
): string {
  const formattedValue =
    occurrence['_sfsures_bookingowner_value@OData.Community.Display.V1.FormattedValue']

  return typeof formattedValue === 'string' && formattedValue.trim()
    ? formattedValue
    : 'Reservation owner unavailable'
}

function blackoutCreatorDisplayName(
  blackout: Sfsures_blackoutwindows & Record<string, unknown>
): string {
  const formattedValue = blackout['_createdby_value@OData.Community.Display.V1.FormattedValue']

  return typeof formattedValue === 'string' && formattedValue.trim() ? formattedValue : ''
}

export default function BlackoutsScreen() {
  const currentUser = useCurrentUser()
  const [resources, setResources] = useState<AdminResource[]>([])
  const [blackouts, setBlackouts] = useState<BlackoutWindow[]>([])
  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('oldest')
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [activeForm, setActiveForm] = useState<BlackoutForm | null>(null)
  const [selectedBlackoutId, setSelectedBlackoutId] = useState<string | null>(null)
  const [overlapReport, setOverlapReport] = useState<ReservationOverlap[]>([])
  const [modalError, setModalError] = useState('')
  const [savingBlackout, setSavingBlackout] = useState(false)
  const [removingBlackoutId, setRemovingBlackoutId] = useState<string | null>(null)
  const [blackoutPendingRemoval, setBlackoutPendingRemoval] = useState<BlackoutWindow | null>(null)
  const createDialogRef = useRef<HTMLDivElement | null>(null)
  const detailDialogRef = useRef<HTMLDivElement | null>(null)
  const removeDialogRef = useRef<HTMLDivElement | null>(null)
  useFocusTrap(createDialogRef, activeForm !== null)
  useFocusTrap(detailDialogRef, selectedBlackoutId !== null)
  useFocusTrap(removeDialogRef, blackoutPendingRemoval !== null)

  const loadBlackouts = useCallback(async () => {
    setLoadStatus('loading')
    setError('')

    try {
      const [resourceResult, blackoutResult] = await Promise.all([
        Sfsures_resourcesService.getAll({
          select: [
            'sfsures_resourceid',
            'sfsures_name',
            'sfsures_location',
            'sfsures_recordstatus',
          ],
          filter: `sfsures_recordstatus eq ${RESOURCE_STATUS_ACTIVE}`,
          orderBy: ['sfsures_name asc'],
          top: 500,
        }),
        Sfsures_blackoutwindowsService.getAll({
          select: [
            'sfsures_blackoutwindowid',
            'sfsures_name',
            '_sfsures_resource_value',
            'sfsures_start',
            'sfsures_end',
            'sfsures_reason',
            '_createdby_value',
            'createdon',
            'statecode',
          ],
          filter: 'statecode eq 0',
          orderBy: ['sfsures_start asc'],
          top: 1000,
        }),
      ])

      const loadedResources = ((resourceResult.data ?? []) as Sfsures_resources[])
        .map((resource) => ({
          resourceId: resource.sfsures_resourceid,
          name: resource.sfsures_name,
          location: resource.sfsures_location ?? '',
          recordStatus: resource.sfsures_recordstatus ?? RESOURCE_STATUS_ACTIVE,
        }))
        .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))

      const resourcesById = new Map(
        loadedResources.map((resource) => [resource.resourceId, resource])
      )

      const now = new Date()
      const loadedBlackouts = ((blackoutResult.data ?? []) as Sfsures_blackoutwindows[])
        .map((blackout) => {
          const resourceId = blackout._sfsures_resource_value ?? ''
          const resource = resourcesById.get(resourceId)
          return {
            blackoutId: blackout.sfsures_blackoutwindowid,
            name: blackout.sfsures_name,
            resourceId,
            resourceName: blackoutResourceDisplayName(
              blackout as Sfsures_blackoutwindows & Record<string, unknown>,
              resource?.name
            ),
            start: blackout.sfsures_start ?? '',
            end: blackout.sfsures_end ?? '',
            reason: blackout.sfsures_reason ?? '',
            createdByName: blackoutCreatorDisplayName(
              blackout as Sfsures_blackoutwindows & Record<string, unknown>
            ),
            createdOn: blackout.createdon ?? '',
          }
        })
        .filter(
          (blackout) =>
            blackout.blackoutId &&
            blackout.start &&
            blackout.end &&
            isUpcomingBlackout(blackout, now)
        )

      setResources(loadedResources)
      setBlackouts(loadedBlackouts)
      setLoadStatus('ready')
    } catch (err) {
      console.error('Blackouts admin load failed:', err)
      setError(err instanceof Error ? err.message : 'Blackouts could not be loaded.')
      setLoadStatus('error')
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => void loadBlackouts())
  }, [loadBlackouts])

  useEffect(() => {
    if (!activeForm && !selectedBlackoutId && !blackoutPendingRemoval) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !savingBlackout && !removingBlackoutId) {
        setActiveForm(null)
        setSelectedBlackoutId(null)
        setBlackoutPendingRemoval(null)
        setModalError('')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeForm, blackoutPendingRemoval, removingBlackoutId, savingBlackout, selectedBlackoutId])

  const filteredBlackouts = useMemo(() => {
    const now = new Date()
    return blackouts
      .filter((blackout) => blackoutMatchesSearch(blackout, search))
      .sort((a, b) => {
        const aCurrent = isCurrentBlackout(a, now)
        const bCurrent = isCurrentBlackout(b, now)
        if (aCurrent !== bCurrent) return aCurrent ? -1 : 1

        if (sortMode === 'resource') {
          const resourceSort = a.resourceName
            .toLowerCase()
            .localeCompare(b.resourceName.toLowerCase())
          if (resourceSort !== 0) return resourceSort
          return new Date(a.start).getTime() - new Date(b.start).getTime()
        }

        const startSort = new Date(a.start).getTime() - new Date(b.start).getTime()
        return sortMode === 'newest' ? startSort * -1 : startSort
      })
  }, [blackouts, search, sortMode])

  const selectedBlackout = useMemo(
    () => blackouts.find((blackout) => blackout.blackoutId === selectedBlackoutId) ?? null,
    [blackouts, selectedBlackoutId]
  )

  function handleRetryLoadBlackouts() {
    void loadBlackouts()
  }

  function openCreateBlackout() {
    setActiveForm(emptyBlackoutForm(resources[0]?.resourceId ?? ''))
    setOverlapReport([])
    setModalError('')
    setError('')
    setStatus('')
  }

  function closeCreateBlackout() {
    if (savingBlackout) return
    setActiveForm(null)
    setModalError('')
  }

  async function handleCreateBlackout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeForm) return

    const resource = resources.find((item) => item.resourceId === activeForm.resourceId)
    const start = fromDatetimeLocal(activeForm.start)
    const end = fromDatetimeLocal(activeForm.end)
    const reason = activeForm.reason.trim()

    if (!resource) {
      setModalError('Choose a Resource.')
      return
    }
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      setModalError('Start and end times are required.')
      return
    }
    if (end <= start) {
      setModalError('End time must be after the start time.')
      return
    }
    if (!reason) {
      setModalError('Enter a reason.')
      return
    }

    setSavingBlackout(true)
    setModalError('')

    try {
      const startIso = toDataverseIso(start)
      const endIso = toDataverseIso(end)
      const overlapResult = await Sfsures_reservationoccurrencesService.getAll({
        select: [
          'sfsures_reservationoccurrenceid',
          'sfsures_start',
          'sfsures_end',
          '_sfsures_bookingowner_value',
        ],
        filter:
          `statecode eq 0 and _sfsures_resource_value eq ${resource.resourceId}` +
          ` and sfsures_recordstatus eq ${RESERVATION_STATUS_ACTIVE}` +
          ` and sfsures_start lt ${endIso}` +
          ` and sfsures_end gt ${startIso}`,
        orderBy: ['sfsures_start asc'],
        top: 100,
      })
      const overlaps = ((overlapResult.data ?? []) as Sfsures_reservationoccurrences[])
        .map((occurrence) => ({
          occurrenceId: occurrence.sfsures_reservationoccurrenceid,
          start: occurrence.sfsures_start ?? '',
          end: occurrence.sfsures_end ?? '',
          ownerName: occurrenceOwnerDisplayName(
            occurrence as Sfsures_reservationoccurrences & Record<string, unknown>
          ),
        }))
        .filter((overlap) => overlap.occurrenceId && overlap.start && overlap.end)
      const name = `${resource.name} blackout ${formatBlackoutRange(startIso, endIso)}`
      const created = await Sfsures_blackoutwindowsService.create({
        sfsures_name: name,
        sfsures_start: startIso,
        sfsures_end: endIso,
        sfsures_reason: reason,
        'sfsures_Resource@odata.bind': `/sfsures_resources(${resource.resourceId})`,
        statecode: 0,
        statuscode: 1,
      } as unknown as Parameters<typeof Sfsures_blackoutwindowsService.create>[0])

      const createdId = created.data?.sfsures_blackoutwindowid
      const auditWritten = await writeAuditLog({
        actor: currentUser,
        actionType: AUDIT_ACTION_TYPES.blackoutWindowEdited,
        targetType: AUDIT_TARGET_TYPES.blackoutWindow,
        targetId: createdId,
        targetKey: createdId ? `blackout:${createdId}` : undefined,
        targetLabel: name,
        afterState: blackoutSnapshot(
          {
            ...activeForm,
            start: startIso,
            end: endIso,
            reason,
          },
          resource.name
        ),
        details: {
          source: 'Admin Blackouts screen',
          operation: 'create',
        },
      })

      setActiveForm(null)
      setStatus(
        auditWritten ? 'Blackout created.' : 'Blackout created. Audit log could not be written.'
      )
      setOverlapReport(overlaps)
      await loadBlackouts()
      if (createdId) setSelectedBlackoutId(createdId)
    } catch (err) {
      console.error('Create blackout failed:', err)
      setModalError(err instanceof Error ? err.message : 'Blackout could not be created.')
    } finally {
      setSavingBlackout(false)
    }
  }

  function openRemoveBlackout(blackout: BlackoutWindow) {
    if (removingBlackoutId) return
    setBlackoutPendingRemoval(blackout)
    setError('')
    setStatus('')
  }

  function closeRemoveBlackout() {
    if (removingBlackoutId) return
    setBlackoutPendingRemoval(null)
  }

  async function handleConfirmRemoveBlackout() {
    const blackout = blackoutPendingRemoval
    if (!blackout || removingBlackoutId) return

    setRemovingBlackoutId(blackout.blackoutId)
    setError('')
    setStatus('')

    try {
      await Sfsures_blackoutwindowsService.update(blackout.blackoutId, {
        statecode: 1,
        statuscode: 2,
      })

      const auditWritten = await writeAuditLog({
        actor: currentUser,
        actionType: AUDIT_ACTION_TYPES.blackoutWindowEdited,
        targetType: AUDIT_TARGET_TYPES.blackoutWindow,
        targetId: blackout.blackoutId,
        targetKey: `blackout:${blackout.blackoutId}`,
        targetLabel: blackout.name || `${blackout.resourceName} blackout`,
        beforeState: blackoutSnapshot(blackout),
        details: {
          source: 'Admin Blackouts screen',
          operation: 'remove',
        },
      })

      setSelectedBlackoutId((current) =>
        current === blackout.blackoutId ? null : current
      )
      setBlackoutPendingRemoval(null)
      setOverlapReport([])
      setStatus(
        auditWritten ? 'Blackout removed.' : 'Blackout removed. Audit log could not be written.'
      )
      await loadBlackouts()
    } catch (err) {
      console.error('Remove blackout failed:', err)
      setError(err instanceof Error ? err.message : 'Blackout could not be removed.')
    } finally {
      setRemovingBlackoutId(null)
    }
  }

  if (loadStatus === 'loading') {
    return (
      <section className={styles.settingsPanel} aria-busy="true">
        <div className={styles.panelToolbar}>
          <h2>Blackouts</h2>
        </div>
        <div className={styles.inlineLoading} role="status">
          Loading blackouts...
        </div>
      </section>
    )
  }

  return (
    <section className={styles.settingsPanel}>
      <div className={styles.panelToolbar}>
        <div>
          <h2>Blackouts</h2>
          <p className={styles.panelMeta}>{blackouts.length} upcoming Blackouts</p>
        </div>
        <div className={styles.panelActions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={openCreateBlackout}
            disabled={resources.length === 0}
          >
            New Blackout
          </button>
        </div>
      </div>

      {error && (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      )}

      {status && (
        <p className={styles.statusBanner} role="status">
          {status}
        </p>
      )}

      {overlapReport.length > 0 && (
        <section className={styles.warningBanner} role="status" aria-live="polite">
          <h3>Existing reservation overlaps</h3>
          <ul>
            {overlapReport.map((overlap) => (
              <li key={overlap.occurrenceId}>
                {formatBlackoutRange(overlap.start, overlap.end)}
                {overlap.ownerName ? ` - ${overlap.ownerName}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      {loadStatus === 'error' ? (
        <button type="button" className={styles.primaryButton} onClick={handleRetryLoadBlackouts}>
          Retry
        </button>
      ) : (
        <>
          <div className={styles.blackoutControls}>
            <label className={styles.field}>
              <span>Search Blackouts</span>
              <input
                className={styles.input}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>

            <label className={styles.field}>
              <span>Sort By</span>
              <select
                className={styles.input}
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as SortMode)}
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="resource">Resource</option>
              </select>
            </label>
          </div>

          <div className={styles.blackoutList} role="list" aria-label="Upcoming Blackouts">
            {filteredBlackouts.length === 0 ? (
              <p className={styles.emptyState}>No upcoming blackouts found.</p>
            ) : (
              filteredBlackouts.map((blackout) => {
                const current = isCurrentBlackout(blackout, new Date())
                return (
                  <article key={blackout.blackoutId} className={styles.blackoutListItem}>
                    <div className={styles.blackoutListMain}>
                      <div className={styles.catalogListHeading}>
                        <span className={styles.catalogListName}>{blackout.resourceName}</span>
                        {current && <span className={styles.statusPill}>Current</span>}
                      </div>
                      <p className={styles.catalogListMeta}>
                        {formatBlackoutRange(blackout.start, blackout.end)}
                      </p>
                    </div>
                    <div className={styles.blackoutListActions}>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        disabled={removingBlackoutId === blackout.blackoutId}
                        onClick={() => {
                          setSelectedBlackoutId(blackout.blackoutId)
                          setModalError('')
                        }}
                      >
                        More Info
                      </button>
                      <button
                        type="button"
                        className={styles.dangerButton}
                        disabled={removingBlackoutId === blackout.blackoutId}
                        onClick={() => openRemoveBlackout(blackout)}
                      >
                        {removingBlackoutId === blackout.blackoutId
                          ? 'Removing...'
                          : 'Remove Blackout'}
                      </button>
                    </div>
                  </article>
                )
              })
            )}
          </div>
        </>
      )}

      {activeForm && (
        <div className={styles.modalBackdrop}>
          <div
            ref={createDialogRef}
            className={styles.adminModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="blackout-create-title"
            tabIndex={-1}
          >
            <form className={styles.modalForm} onSubmit={handleCreateBlackout}>
              <header className={styles.modalHeader}>
                <div>
                  <p className={styles.detailLabel}>Blackout</p>
                  <h2 id="blackout-create-title">New Blackout</h2>
                </div>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={savingBlackout}
                  onClick={closeCreateBlackout}
                >
                  Close
                </button>
              </header>

              {modalError && (
                <p className={styles.errorBanner} role="alert">
                  {modalError}
                </p>
              )}

              <div className={styles.modalBody}>
                <label className={styles.field}>
                  <span>Resource</span>
                  <select
                    className={styles.input}
                    value={activeForm.resourceId}
                    onChange={(event) =>
                      setActiveForm((current) =>
                        current ? { ...current, resourceId: event.target.value } : current
                      )
                    }
                  >
                    <option value="">Select Resource</option>
                    {resources.map((resource) => (
                      <option key={resource.resourceId} value={resource.resourceId}>
                        {resource.name}
                        {resource.location ? ` - ${resource.location}` : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <div className={styles.blackoutDateGrid}>
                  <label className={styles.field}>
                    <span>Start</span>
                    <input
                      className={styles.input}
                      type="datetime-local"
                      value={activeForm.start}
                      onChange={(event) =>
                        setActiveForm((current) =>
                          current ? { ...current, start: event.target.value } : current
                        )
                      }
                    />
                  </label>

                  <label className={styles.field}>
                    <span>End</span>
                    <input
                      className={styles.input}
                      type="datetime-local"
                      value={activeForm.end}
                      onChange={(event) =>
                        setActiveForm((current) =>
                          current ? { ...current, end: event.target.value } : current
                        )
                      }
                    />
                  </label>
                </div>

                <label className={styles.field}>
                  <span>Reason</span>
                  <textarea
                    className={styles.textarea}
                    rows={5}
                    value={activeForm.reason}
                    onChange={(event) =>
                      setActiveForm((current) =>
                        current ? { ...current, reason: event.target.value } : current
                      )
                    }
                  />
                </label>
              </div>

              <footer className={styles.modalFooter}>
                <span className={styles.modalFooterStatus} role="status">
                  {savingBlackout ? 'Saving blackout...' : ''}
                </span>
                <div className={styles.modalFooterActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    disabled={savingBlackout}
                    onClick={closeCreateBlackout}
                  >
                    Cancel
                  </button>
                  <button type="submit" className={styles.primaryButton} disabled={savingBlackout}>
                    {savingBlackout ? 'Creating...' : 'Create Blackout'}
                  </button>
                </div>
              </footer>
            </form>
          </div>
        </div>
      )}

      {selectedBlackout && (
        <div className={styles.modalBackdrop}>
          <div
            ref={detailDialogRef}
            className={styles.adminModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="blackout-detail-title"
            tabIndex={-1}
          >
            <header className={styles.modalHeader}>
              <div>
                <p className={styles.detailLabel}>Blackout</p>
                <h2 id="blackout-detail-title">{selectedBlackout.resourceName}</h2>
              </div>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setSelectedBlackoutId(null)}
              >
                Close
              </button>
            </header>

            <div className={styles.modalBody}>
              <dl className={styles.detailList}>
                <div>
                  <dt>Resource</dt>
                  <dd>{selectedBlackout.resourceName}</dd>
                </div>
                <div>
                  <dt>Date and times</dt>
                  <dd>{formatBlackoutRange(selectedBlackout.start, selectedBlackout.end)}</dd>
                </div>
                <div>
                  <dt>Entered by</dt>
                  <dd>{selectedBlackout.createdByName || 'Unavailable'}</dd>
                </div>
                <div>
                  <dt>Entered on</dt>
                  <dd>{formatCreatedDate(selectedBlackout.createdOn)}</dd>
                </div>
              </dl>

              <section className={styles.blackoutDetailSection}>
                <h3>Reason</h3>
                <p>{selectedBlackout.reason || 'Not specified'}</p>
              </section>
            </div>

            <footer className={styles.modalFooter}>
              <span />
              <div className={styles.modalFooterActions}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => setSelectedBlackoutId(null)}
                >
                  Done
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}

      {blackoutPendingRemoval && (
        <div className={styles.modalBackdrop}>
          <div
            ref={removeDialogRef}
            className={styles.adminModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="blackout-remove-title"
            tabIndex={-1}
          >
            <header className={styles.modalHeader}>
              <div>
                <p className={styles.detailLabel}>Remove blackout</p>
                <h2 id="blackout-remove-title">Remove this blackout?</h2>
              </div>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={removingBlackoutId === blackoutPendingRemoval.blackoutId}
                onClick={closeRemoveBlackout}
              >
                Close
              </button>
            </header>

            <div className={styles.modalBody}>
              <dl className={styles.detailList}>
                <div>
                  <dt>Resource</dt>
                  <dd>{blackoutPendingRemoval.resourceName}</dd>
                </div>
                <div>
                  <dt>Date and times</dt>
                  <dd>
                    {formatBlackoutRange(
                      blackoutPendingRemoval.start,
                      blackoutPendingRemoval.end
                    )}
                  </dd>
                </div>
              </dl>
              <p className={styles.sectionMeta}>
                Removing this blackout will make the time available for new reservations.
              </p>
            </div>

            <footer className={styles.modalFooter}>
              <span className={styles.modalFooterStatus} role="status">
                {removingBlackoutId === blackoutPendingRemoval.blackoutId
                  ? 'Removing blackout...'
                  : ''}
              </span>
              <div className={styles.modalFooterActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={removingBlackoutId === blackoutPendingRemoval.blackoutId}
                  onClick={closeRemoveBlackout}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.dangerButton}
                  disabled={removingBlackoutId === blackoutPendingRemoval.blackoutId}
                  onClick={() => void handleConfirmRemoveBlackout()}
                >
                  {removingBlackoutId === blackoutPendingRemoval.blackoutId
                    ? 'Removing...'
                    : 'Remove Blackout'}
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </section>
  )
}
