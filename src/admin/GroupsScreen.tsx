import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { AUDIT_ACTION_TYPES, AUDIT_TARGET_TYPES, writeAuditLog } from '../audit/auditLog'
import { APP_ADMIN_GROUP_KEY, useCurrentUser } from '../auth/UserContext'
import { Sfsures_appusersService } from '../generated/services/Sfsures_appusersService'
import { Sfsures_groupsService } from '../generated/services/Sfsures_groupsService'
import { Sfsures_usergroupassignmentsService } from '../generated/services/Sfsures_usergroupassignmentsService'
import type { Sfsures_appusers } from '../generated/models/Sfsures_appusersModel'
import type { Sfsures_groups } from '../generated/models/Sfsures_groupsModel'
import type { Sfsures_usergroupassignments } from '../generated/models/Sfsures_usergroupassignmentsModel'
import styles from './AdminApp.module.css'

interface AdminGroup {
  groupId: string
  name: string
  groupKey: string
  description: string
  isSystemGroup: boolean
}

interface AdminUser {
  appUserId: string
  sfStateId: string
  displayName: string
  email: string
  recordStatus: number
}

interface UserGroupAssignment {
  assignmentId: string
  userId: string
  groupId: string
}

const RECORD_STATUS_ACTIVE = 997330000
const RECORD_STATUS_DISABLED = 997330001

function normalizeGroupKey(groupKey: string | undefined | null): string {
  return groupKey?.trim().toUpperCase() ?? ''
}

function groupKeyFromName(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 100)
}

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''")
}

function userDisplayName(user: Pick<AdminUser, 'displayName' | 'email' | 'sfStateId'>): string {
  return user.displayName || user.email || user.sfStateId
}

function groupSortKey(group: AdminGroup): string {
  return `${group.isSystemGroup ? '0' : '1'}-${group.name.toLowerCase()}`
}

function userMatchesSearch(user: AdminUser, search: string): boolean {
  const normalizedSearch = search.trim().toLowerCase()
  if (!normalizedSearch) return true

  return [user.displayName, user.email, user.sfStateId].some((value) =>
    value.toLowerCase().includes(normalizedSearch)
  )
}

function groupMatchesSearch(group: AdminGroup, search: string): boolean {
  const normalizedSearch = search.trim().toLowerCase()
  if (!normalizedSearch) return true

  return [group.name, group.description].some((value) =>
    value.toLowerCase().includes(normalizedSearch)
  )
}

function groupAuditSnapshot(group: Pick<AdminGroup, 'name' | 'groupKey' | 'description' | 'isSystemGroup'>) {
  return {
    groupName: group.name,
    groupKey: group.groupKey,
    description: group.description || null,
    isSystemGroup: group.isSystemGroup,
  }
}

function userAuditSnapshot(user: AdminUser) {
  return {
    appUserId: user.appUserId,
    sfStateId: user.sfStateId,
    displayName: userDisplayName(user),
    email: user.email || null,
    recordStatus: user.recordStatus,
  }
}

export default function GroupsScreen() {
  const currentUser = useCurrentUser()
  const [groups, setGroups] = useState<AdminGroup[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [assignments, setAssignments] = useState<UserGroupAssignment[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [groupSearch, setGroupSearch] = useState('')
  const [memberSearch, setMemberSearch] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDescription, setNewGroupDescription] = useState('')
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [savingGroup, setSavingGroup] = useState(false)
  const [savingMembershipUserId, setSavingMembershipUserId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const loadGroups = useCallback(async () => {
    try {
      const [groupResult, userResult, assignmentResult] = await Promise.all([
        Sfsures_groupsService.getAll({
          select: [
            'sfsures_groupid',
            'sfsures_name',
            'sfsures_groupkey',
            'sfsures_description',
            'sfsures_issystemgroup',
            'sfsures_recordstatus',
          ],
          filter: `sfsures_recordstatus eq ${RECORD_STATUS_ACTIVE}`,
          orderBy: ['sfsures_name asc'],
          top: 500,
        }),
        Sfsures_appusersService.getAll({
          select: [
            'sfsures_appuserid',
            'sfsures_sfstateid',
            'sfsures_displayname',
            'sfsures_email',
            'sfsures_recordstatus',
          ],
          orderBy: ['sfsures_displayname asc', 'sfsures_sfstateid asc'],
          top: 500,
        }),
        Sfsures_usergroupassignmentsService.getAll({
          select: [
            'sfsures_usergroupassignmentid',
            '_sfsures_user_value',
            '_sfsures_group_value',
            'statecode',
          ],
          filter: 'statecode eq 0',
          top: 5000,
        }),
      ])

      const loadedGroups = ((groupResult.data ?? []) as Sfsures_groups[])
        .map((group) => ({
          groupId: group.sfsures_groupid,
          name: group.sfsures_name,
          groupKey: normalizeGroupKey(group.sfsures_groupkey),
          description: group.sfsures_description ?? '',
          isSystemGroup: group.sfsures_issystemgroup === true,
        }))
        .sort((a, b) => groupSortKey(a).localeCompare(groupSortKey(b)))

      const groupIds = new Set(loadedGroups.map((group) => group.groupId))
      const loadedUsers = ((userResult.data ?? []) as Sfsures_appusers[])
        .map((user) => ({
          appUserId: user.sfsures_appuserid,
          sfStateId: user.sfsures_sfstateid,
          displayName: user.sfsures_displayname ?? '',
          email: user.sfsures_email ?? '',
          recordStatus: user.sfsures_recordstatus ?? RECORD_STATUS_ACTIVE,
        }))
        .sort((a, b) =>
          userDisplayName(a).toLowerCase().localeCompare(userDisplayName(b).toLowerCase())
        )

      const userIds = new Set(loadedUsers.map((user) => user.appUserId))
      const loadedAssignments = ((assignmentResult.data ?? []) as Sfsures_usergroupassignments[])
        .map((assignment) => ({
          assignmentId: assignment.sfsures_usergroupassignmentid,
          userId: assignment._sfsures_user_value ?? '',
          groupId: assignment._sfsures_group_value ?? '',
        }))
        .filter(
          (assignment) => userIds.has(assignment.userId) && groupIds.has(assignment.groupId)
        )

      setGroups(loadedGroups)
      setUsers(loadedUsers)
      setAssignments(loadedAssignments)
      setSelectedGroupId((current) =>
        current && loadedGroups.some((group) => group.groupId === current)
          ? current
          : loadedGroups[0]?.groupId ?? null
      )
      setError('')
      setLoadStatus('ready')
    } catch (err) {
      console.error('Groups admin load failed:', err)
      setError(err instanceof Error ? err.message : 'Groups could not be loaded.')
      setLoadStatus('error')
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => void loadGroups())
  }, [loadGroups])

  function handleRetryLoadGroups() {
    setLoadStatus('loading')
    setError('')
    void loadGroups()
  }

  const selectedGroup = useMemo(
    () => groups.find((group) => group.groupId === selectedGroupId) ?? null,
    [groups, selectedGroupId]
  )

  const filteredGroups = useMemo(
    () => groups.filter((group) => groupMatchesSearch(group, groupSearch)),
    [groupSearch, groups]
  )

  const selectedGroupAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.groupId === selectedGroupId),
    [assignments, selectedGroupId]
  )

  const selectedGroupAssignmentsByUserId = useMemo(
    () =>
      new Map(
        selectedGroupAssignments.map((assignment) => [assignment.userId, assignment])
      ),
    [selectedGroupAssignments]
  )

  const selectedGroupMemberUserIds = useMemo(
    () => new Set(selectedGroupAssignments.map((assignment) => assignment.userId)),
    [selectedGroupAssignments]
  )

  const selectedGroupMemberCount = selectedGroupMemberUserIds.size
  const filteredMembershipUsers = useMemo(
    () => users.filter((user) => userMatchesSearch(user, memberSearch)),
    [memberSearch, users]
  )

  const groupMemberCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const assignment of assignments) {
      counts.set(assignment.groupId, (counts.get(assignment.groupId) ?? 0) + 1)
    }
    return counts
  }, [assignments])

  async function handleCreateGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const name = newGroupName.trim()
    const groupKey = groupKeyFromName(name)
    const description = newGroupDescription.trim()

    if (!name) {
      setError('Enter a group name.')
      return
    }

    if (!groupKey) {
      setError('Enter a group name with at least one letter or number.')
      return
    }

    setSavingGroup(true)
    setError('')
    setStatus('')

    try {
      const existingGroupResult = await Sfsures_groupsService.getAll({
        select: ['sfsures_groupid', 'sfsures_groupkey'],
        filter: `sfsures_groupkey eq '${escapeODataString(groupKey)}'`,
        top: 1,
      })

      if (existingGroupResult.data?.[0]?.sfsures_groupid) {
        setSelectedGroupId(existingGroupResult.data[0].sfsures_groupid)
        setError('A group with this key already exists.')
        return
      }

      const created = await Sfsures_groupsService.create({
        sfsures_name: name,
        sfsures_groupkey: groupKey,
        sfsures_description: description || undefined,
        sfsures_issystemgroup: false,
        sfsures_recordstatus: RECORD_STATUS_ACTIVE,
        statecode: 0,
        statuscode: 1,
      } as unknown as Parameters<typeof Sfsures_groupsService.create>[0])

      const createdGroup = {
        name,
        groupKey,
        description,
        isSystemGroup: false,
      }
      const auditWritten = await writeAuditLog({
        actor: currentUser,
        actionType: AUDIT_ACTION_TYPES.groupCreated,
        targetType: AUDIT_TARGET_TYPES.group,
        targetId: created.data?.sfsures_groupid,
        targetKey: groupKey,
        targetLabel: name,
        afterState: groupAuditSnapshot(createdGroup),
        details: {
          source: 'Admin Groups screen',
        },
      })

      setNewGroupName('')
      setNewGroupDescription('')
      setStatus(auditWritten ? 'Group created.' : 'Group created. Audit log could not be written.')
      await loadGroups()
      if (created.data?.sfsures_groupid) {
        setSelectedGroupId(created.data.sfsures_groupid)
      }
    } catch (err) {
      console.error('Create group failed:', err)
      setError(err instanceof Error ? err.message : 'Group could not be created.')
    } finally {
      setSavingGroup(false)
    }
  }

  async function handleToggleMembership(user: AdminUser, checked: boolean) {
    if (!selectedGroup) return

    const existingAssignment = selectedGroupAssignmentsByUserId.get(user.appUserId)
    const isLockedSelfAdmin =
      !checked &&
      user.appUserId === currentUser?.appUserId &&
      selectedGroup.groupKey === APP_ADMIN_GROUP_KEY

    if (isLockedSelfAdmin) {
      setError('You cannot remove your own App Admin membership.')
      return
    }

    setSavingMembershipUserId(user.appUserId)
    setError('')
    setStatus('')

    try {
      let auditWritten = true
      if (checked) {
        if (existingAssignment) return

        const createdAssignment = await Sfsures_usergroupassignmentsService.create({
          sfsures_name: `${userDisplayName(user)} - ${selectedGroup.name}`,
          'sfsures_User@odata.bind': `/sfsures_appusers(${user.appUserId})`,
          'sfsures_Group@odata.bind': `/sfsures_groups(${selectedGroup.groupId})`,
          statecode: 0,
          statuscode: 1,
        } as unknown as Parameters<typeof Sfsures_usergroupassignmentsService.create>[0])
        auditWritten = await writeAuditLog({
          actor: currentUser,
          actionType: AUDIT_ACTION_TYPES.groupMemberAdded,
          targetType: AUDIT_TARGET_TYPES.group,
          targetId: selectedGroup.groupId,
          targetKey: selectedGroup.groupKey,
          targetLabel: selectedGroup.name,
          afterState: {
            group: groupAuditSnapshot(selectedGroup),
            member: userAuditSnapshot(user),
            assignmentId: createdAssignment.data?.sfsures_usergroupassignmentid,
          },
          details: {
            source: 'Admin Groups screen',
          },
        })
        setStatus(auditWritten ? 'Member added.' : 'Member added. Audit log could not be written.')
      } else if (existingAssignment) {
        await Sfsures_usergroupassignmentsService.delete(existingAssignment.assignmentId)
        auditWritten = await writeAuditLog({
          actor: currentUser,
          actionType: AUDIT_ACTION_TYPES.groupMemberRemoved,
          targetType: AUDIT_TARGET_TYPES.group,
          targetId: selectedGroup.groupId,
          targetKey: selectedGroup.groupKey,
          targetLabel: selectedGroup.name,
          beforeState: {
            group: groupAuditSnapshot(selectedGroup),
            member: userAuditSnapshot(user),
            assignmentId: existingAssignment.assignmentId,
          },
          afterState: {
            group: groupAuditSnapshot(selectedGroup),
            member: userAuditSnapshot(user),
            membership: 'removed',
          },
          details: {
            source: 'Admin Groups screen',
          },
        })
        setStatus(
          auditWritten ? 'Member removed.' : 'Member removed. Audit log could not be written.'
        )
      }

      await loadGroups()
    } catch (err) {
      console.error('Update group membership failed:', err)
      setError(err instanceof Error ? err.message : 'Group membership could not be changed.')
    } finally {
      setSavingMembershipUserId(null)
    }
  }

  if (loadStatus === 'loading') {
    return (
      <section className={styles.settingsPanel} aria-busy="true">
        <div className={styles.panelToolbar}>
          <h2>Groups</h2>
        </div>
        <div className={styles.inlineLoading} role="status">
          Loading groups...
        </div>
      </section>
    )
  }

  return (
    <section className={styles.settingsPanel}>
      <div className={styles.panelToolbar}>
        <div>
          <h2>Groups</h2>
          <p className={styles.panelMeta}>{groups.length} Groups</p>
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

      {loadStatus === 'error' ? (
        <button type="button" className={styles.primaryButton} onClick={handleRetryLoadGroups}>
          Retry
        </button>
      ) : (
        <>
          <form className={styles.groupCreateForm} onSubmit={handleCreateGroup}>
            <label className={styles.field}>
              <span>Group name</span>
              <input
                className={styles.input}
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
              />
            </label>

            <label className={styles.field}>
              <span>Description</span>
              <input
                className={styles.input}
                value={newGroupDescription}
                onChange={(event) => setNewGroupDescription(event.target.value)}
              />
            </label>

            <button type="submit" className={styles.primaryButton} disabled={savingGroup}>
              {savingGroup ? 'Creating...' : 'Create Group'}
            </button>
          </form>

          <div className={styles.groupAdminGrid}>
            <div className={styles.groupListPane}>
              <label className={styles.field}>
                <span>Search groups</span>
                <input
                  className={styles.input}
                  value={groupSearch}
                  onChange={(event) => setGroupSearch(event.target.value)}
                />
              </label>

              <div className={styles.groupList} role="list" aria-label="Groups">
                {filteredGroups.length === 0 ? (
                  <p className={styles.emptyState}>No groups found.</p>
                ) : (
                  filteredGroups.map((group) => (
                    <button
                      key={group.groupId}
                      type="button"
                      className={
                        selectedGroupId === group.groupId
                          ? `${styles.groupListItem} ${styles.groupListItemActive}`
                          : styles.groupListItem
                      }
                      onClick={() => setSelectedGroupId(group.groupId)}
                    >
                      <span className={styles.groupListName}>{group.name}</span>
                      {group.description && (
                        <span className={styles.groupListMeta}>{group.description}</span>
                      )}
                      <span className={styles.groupListFooter}>
                        <span
                          className={
                            group.isSystemGroup
                              ? `${styles.statusPill} ${styles.statusPillNeutral}`
                              : styles.statusPill
                          }
                        >
                          {group.isSystemGroup ? 'System' : 'Custom'}
                        </span>
                        <span className={styles.groupMemberCount}>
                          {groupMemberCounts.get(group.groupId) ?? 0} members
                        </span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className={styles.groupDetailPane}>
              {selectedGroup ? (
                <>
                  <div className={styles.userDetailHeader}>
                    <div>
                      <p className={styles.detailLabel}>Group</p>
                      <h3>{selectedGroup.name}</h3>
                    </div>
                    <span
                      className={
                        selectedGroup.isSystemGroup
                          ? `${styles.statusPill} ${styles.statusPillNeutral}`
                          : styles.statusPill
                      }
                    >
                      {selectedGroup.isSystemGroup ? 'System' : 'Custom'}
                    </span>
                  </div>

                  <dl className={styles.detailList}>
                    <div>
                      <dt>Members</dt>
                      <dd>{selectedGroupMemberCount}</dd>
                    </div>
                    <div>
                      <dt>Type</dt>
                      <dd>{selectedGroup.isSystemGroup ? 'System Group' : 'Custom Group'}</dd>
                    </div>
                  </dl>

                  {selectedGroup.description && (
                    <p className={styles.groupDescription}>{selectedGroup.description}</p>
                  )}

                  <section className={styles.groupEditor} aria-labelledby="group-members-heading">
                    <div className={styles.sectionHeader}>
                      <h3 id="group-members-heading">Membership</h3>
                    </div>

                    <label className={styles.field}>
                      <span>Search users</span>
                      <input
                        className={styles.input}
                        value={memberSearch}
                        onChange={(event) => setMemberSearch(event.target.value)}
                      />
                    </label>

                    <div className={styles.groupMembershipList}>
                      {filteredMembershipUsers.length === 0 ? (
                        <p className={styles.emptyState}>No users found.</p>
                      ) : (
                        filteredMembershipUsers.map((user) => {
                          const checked = selectedGroupMemberUserIds.has(user.appUserId)
                          const isLockedSelfAdmin =
                            checked &&
                            user.appUserId === currentUser?.appUserId &&
                            selectedGroup.groupKey === APP_ADMIN_GROUP_KEY

                          return (
                            <label key={user.appUserId} className={styles.groupMemberCheckItem}>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={
                                  savingMembershipUserId === user.appUserId || isLockedSelfAdmin
                                }
                                onChange={(event) =>
                                  void handleToggleMembership(user, event.target.checked)
                                }
                              />
                              <span className={styles.groupMemberText}>
                                <strong>{userDisplayName(user)}</strong>
                                <small>{user.email || user.sfStateId}</small>
                              </span>
                              {user.recordStatus === RECORD_STATUS_DISABLED && (
                                <span
                                  className={`${styles.statusPill} ${styles.statusPillDisabled}`}
                                >
                                  Disabled
                                </span>
                              )}
                            </label>
                          )
                        })
                      )}
                    </div>
                  </section>
                </>
              ) : (
                <p className={styles.emptyState}>No group selected.</p>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
