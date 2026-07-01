/**
 * BookingModal
 *
 * Creates a single reservation occurrence (no series). Opened by
 * CalendarScreen's handleDateSelect with pre-filled start/end times.
 *
 * Flow:
 *   1. User picks a resource from the dropdown (active resources loaded on mount)
 *   2. User adjusts start/end if needed
 *   3. On "Book": conflict detection runs first (delegable overlap query against
 *      active occurrences + blackout windows for the selected resource)
 *   4. If clear → create one sfsures_reservationoccurrence row → close + refresh
 *   5. If conflicts → show details, don't write
 *
 * The Booking Owner is set from UserContext (the authenticated user's App User
 * record, populated by AccessGate on startup). Series is null (single booking).
 *
 * Resource-scope check (group membership) is TODO — for now the picker shows
 * all active resources. The Dataverse security role is still the real boundary;
 * this is a UX filter, not a security gate.
 *
 * Accessibility:
 *   - role="dialog" + aria-modal + aria-labelledby (named by the visible title)
 *   - Focus is trapped inside the dialog while open and restored to the trigger
 *     on close (useFocusTrap)
 *   - Escape closes
 *   - Status (validation / conflict / error) is mirrored into an always-mounted
 *     assertive live region so screen readers hear it without moving focus. The
 *     visual banner below is unchanged and remains navigable for full detail.
 *   - Success is NOT announced here: the modal unmounts on success, so a live
 *     region in it cannot reliably fire. Success is announced from a page-level
 *     live region in CalendarScreen (wired in the next file).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Sfsures_resourcesService } from '../generated/services/Sfsures_resourcesService'
import { Sfsures_reservationoccurrencesService } from '../generated/services/Sfsures_reservationoccurrencesService'
import { Sfsures_blackoutwindowsService } from '../generated/services/Sfsures_blackoutwindowsService'
import { useTheme } from '../theme/ThemeContext'
import { useCurrentUser } from '../auth/UserContext'
import { useFocusTrap } from '../a11y/useFocusTrap'
import styles from './BookingModal.module.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BookingModalProps {
  /** Pre-filled from the calendar selection */
  start: Date
  /** Pre-filled from the calendar selection */
  end: Date
  /** Close the modal without booking */
  onClose: () => void
  /** Called after a successful create — CalendarScreen uses this to refresh */
  onBooked: () => void
}

interface ResourceOption {
  id: string
  name: string
}

interface ConflictInfo {
  type: 'booking' | 'blackout'
  start: string
  end: string
  ownerName?: string
  reason?: string
}

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BookingModal({ start, end, onClose, onBooked }: BookingModalProps) {
  const { theme } = useTheme()
  const currentUser = useCurrentUser()

  // ---- Focus trap: contain Tab inside the dialog, restore focus on close ----
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef, true) // modal only mounts when open → active while mounted

  // ---- Resource list ----
  const [resources, setResources] = useState<ResourceOption[]>([])
  const [resourcesLoading, setResourcesLoading] = useState(true)

  // ---- Form state ----
  const [selectedResourceId, setSelectedResourceId] = useState('')
  const [startStr, setStartStr] = useState(toDatetimeLocal(start))
  const [endStr, setEndStr] = useState(toDatetimeLocal(end))

  // ---- Submission state ----
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([])

  // ---- Load active resources on mount ----
  useEffect(() => {
    const load = async () => {
      try {
        // TODO: filter by the user's group resource access (junction tables).
        // For now, show all active resources — the Dataverse role is the real gate.
        const result = await Sfsures_resourcesService.getAll({
          select: ['sfsures_resourceid', 'sfsures_name', 'sfsures_recordstatus'],
          filter: 'sfsures_recordstatus eq 997330000', // Active
          orderBy: ['sfsures_name asc'],
          top: 200,
        })

       const opts: ResourceOption[] = (result.data ?? []).map((r) => ({
          id: r.sfsures_resourceid,
          name: r.sfsures_name ?? 'Unnamed',
        }))

        setResources(opts)

        // Auto-select the first resource if only one exists (common in early demo data).
        if (opts.length === 1) {
          setSelectedResourceId(opts[0].id)
        }
      } catch (err) {
        console.error('Failed to load resources:', err)
        setError('Could not load the resource list. Try closing and reopening.')
      } finally {
        setResourcesLoading(false)
      }
    }

    load()
  }, [])

  // ---- Submit handler ----
  const handleSubmit = useCallback(async () => {
    setError('')
    setConflicts([])

    // --- Validate inputs ---
    if (!selectedResourceId) {
      setError('Select a resource.')
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

    setSaving(true)

    try {
      // --- Conflict detection ---
      // Overlap condition: existing.start < new.end AND existing.end > new.start
      const startIso = toDataverseIso(startDate)
      const endIso = toDataverseIso(endDate)

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
            ` and sfsures_end gt ${startIso}`,
          top: 10,
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
            `_sfsures_resource_value eq ${selectedResourceId}` +
            ` and sfsures_start lt ${endIso}` +
            ` and sfsures_end gt ${startIso}`,
          top: 10,
        }),
      ])

      const found: ConflictInfo[] = []

      for (const occ of occResult.data ?? []) {
        found.push({
          type: 'booking',
          start: occ.sfsures_start ?? '',
          end: occ.sfsures_end ?? '',
          ownerName: undefined,
        })
      }

      for (const bw of blackoutResult.data ?? []) {
        found.push({
          type: 'blackout',
          start: bw.sfsures_start ?? '',
          end: bw.sfsures_end ?? '',
          reason: bw.sfsures_reason ?? undefined,
        })
      }

      if (found.length > 0) {
        setConflicts(found)
        setError(
          found.length === 1
            ? 'This time slot conflicts with an existing booking or blackout window.'
            : `This time slot conflicts with ${found.length} existing bookings or blackout windows.`
        )
        setSaving(false)
        return
      }

      // --- No conflicts — create the occurrence ---
      // Lookup fields: the generated create() type is over-strict (marks system-
      // defaulted fields as required). Cast to satisfy it. The lookup field names
      // use the Dataverse _fieldname_value convention for single-valued navigation
      // properties. If these names don't match your generated model, the API call
      // will fail at runtime — check src/generated/models/Sfsures_reservationoccurrencesModel.ts
      // and adjust.
      await Sfsures_reservationoccurrencesService.create({
      sfsures_start: startIso,
      sfsures_end: endIso,
      sfsures_recordstatus: 997330000,'sfsures_Resource@odata.bind': `/sfsures_resources(${selectedResourceId})`,
      'sfsures_BookingOwner@odata.bind': `/sfsures_appusers(${currentUser.appUserId})`,
    } as unknown as Parameters<typeof Sfsures_reservationoccurrencesService.create>[0])

      // Success — close modal and trigger calendar refresh.
      // (Success is announced from CalendarScreen's page-level live region, since
      // this component unmounts here.)
      onBooked()
    } catch (err) {
      console.error('Booking failed:', err)
      setError(
        err instanceof Error
          ? `Booking failed: ${err.message}`
          : 'An unexpected error occurred while creating the booking.'
      )
    } finally {
      setSaving(false)
    }
  }, [selectedResourceId, startStr, endStr, currentUser, onBooked])

  // ---- Keyboard: Escape closes ----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // ---- Render ----
  const canSubmit = !!selectedResourceId && !!startStr && !!endStr && !saving

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        ref={dialogRef}
        className={styles.modal}
        style={{ borderTopColor: theme.primaryColor }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-modal-title"
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
          <h2 id="booking-modal-title" className={styles.title}>New Booking</h2>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
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
                No active resources found. Contact your administrator.
              </p>
            ) : (
              <select
                id="booking-resource"
                className={styles.select}
                value={selectedResourceId}
                onChange={(e) => {
                  setSelectedResourceId(e.target.value)
                  setConflicts([])
                  setError('')
                }}
              >
                <option value="">Select a resource…</option>
                {resources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}
          </div>

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
                        ? `Maintenance: ${formatRange(c.start, c.end)}${c.reason ? ` — ${c.reason}` : ''}`
                        : `Booking: ${formatRange(c.start, c.end)}${c.ownerName ? ` (${c.ownerName})` : ''}`}
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

        {/* Footer */}
        <div className={styles.footer}>
          <button className={styles.btnSecondary} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className={styles.btnPrimary}
            style={{ backgroundColor: theme.primaryColor }}
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {saving ? 'Booking…' : 'Book'}
          </button>
        </div>
      </div>
    </div>
  )
}
