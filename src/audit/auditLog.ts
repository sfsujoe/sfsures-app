import type { CurrentUser } from '../auth/UserContext'
import { Sfsures_auditlogsService } from '../generated/services/Sfsures_auditlogsService'
import type {
  Sfsures_auditlogssfsures_actiontype,
  Sfsures_auditlogssfsures_outcome,
  Sfsures_auditlogssfsures_targettype,
} from '../generated/models/Sfsures_auditlogsModel'

export const AUDIT_ACTION_TYPES = {
  reservationCreated: 997330000,
  reservationModified: 997330001,
  groupCreated: 997330006,
  groupEdited: 997330010,
  resourceCatalogEdited: 997330007,
  blackoutWindowEdited: 997330008,
  groupMemberAdded: 997330011,
  groupMemberRemoved: 997330012,
} as const satisfies Record<string, Sfsures_auditlogssfsures_actiontype>

export const AUDIT_OUTCOMES = {
  success: 997330000,
  failed: 997330002,
} as const satisfies Record<string, Sfsures_auditlogssfsures_outcome>

export const AUDIT_TARGET_TYPES = {
  reservation: 997330000,
  resource: 997330001,
  group: 997330003,
  blackoutWindow: 997330004,
} as const satisfies Record<string, Sfsures_auditlogssfsures_targettype>

interface AuditLogEntry {
  actor: CurrentUser | null
  actionType: Sfsures_auditlogssfsures_actiontype
  outcome?: Sfsures_auditlogssfsures_outcome
  targetType: Sfsures_auditlogssfsures_targettype
  targetId?: string
  targetKey?: string
  targetLabel?: string
  beforeState?: unknown
  afterState?: unknown
  details?: unknown
}

function stringifySnapshot(snapshot: unknown): string | undefined {
  if (snapshot === undefined || snapshot === null) return undefined
  if (typeof snapshot === 'string') return snapshot

  return JSON.stringify(snapshot)
}

function actorGroupSnapshot(actor: CurrentUser | null): string | undefined {
  if (!actor?.groups.length) return undefined

  return actor.groups.map((group) => group.name).join('; ')
}

export async function writeAuditLog(entry: AuditLogEntry): Promise<boolean> {
  try {
    await Sfsures_auditlogsService.create({
      sfsures_entrytype: 997330001,
      sfsures_actiontype: entry.actionType,
      sfsures_outcome: entry.outcome ?? AUDIT_OUTCOMES.success,
      sfsures_actorsfstateid: entry.actor?.sfStateId,
      sfsures_actordisplayname: entry.actor?.displayName,
      sfsures_actorgroupsnapshot: actorGroupSnapshot(entry.actor),
      sfsures_actiontimestamp: new Date().toISOString(),
      sfsures_targettype: entry.targetType,
      sfsures_targetid: entry.targetId,
      sfsures_targetkey: entry.targetKey,
      sfsures_targetlabel: entry.targetLabel,
      sfsures_beforestate: stringifySnapshot(entry.beforeState),
      sfsures_afterstate: stringifySnapshot(entry.afterState),
      sfsures_details: stringifySnapshot(entry.details),
      statecode: 0,
      statuscode: 1,
    } as unknown as Parameters<typeof Sfsures_auditlogsService.create>[0])

    return true
  } catch (err) {
    console.error('Audit log write failed:', err)
    return false
  }
}
