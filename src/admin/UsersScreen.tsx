import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { AUDIT_ACTION_TYPES, AUDIT_TARGET_TYPES, writeAuditLog } from '../audit/auditLog'
import { APP_ADMIN_GROUP_KEY, useCurrentUser } from '../auth/UserContext'
import { Office365UsersService } from '../generated/services/Office365UsersService'
import { Sfsures_appusersService } from '../generated/services/Sfsures_appusersService'
import { Sfsures_groupsService } from '../generated/services/Sfsures_groupsService'
import { Sfsures_usergroupassignmentsService } from '../generated/services/Sfsures_usergroupassignmentsService'
import type { Sfsures_appusers } from '../generated/models/Sfsures_appusersModel'
import type { Sfsures_groups } from '../generated/models/Sfsures_groupsModel'
import type { Sfsures_usergroupassignments } from '../generated/models/Sfsures_usergroupassignmentsModel'
import type { User } from '../generated/models/Office365UsersModel'
import styles from './AdminApp.module.css'

interface AdminGroup {
  groupId: string
  name: string
  groupKey: string
  isSystemGroup: boolean
}

interface UserGroupAssignment {
  assignmentId: string
  userId: string
  groupId: string
}

interface AdminUser {
  appUserId: string
  sfStateId: string
  displayName: string
  email: string
  recordStatus: number
  assignments: UserGroupAssignment[]
  groups: AdminGroup[]
}

interface DirectoryUser {
  displayName: string
  email: string
  userPrincipalName: string
}

const RECORD_STATUS_ACTIVE = 997330000
const RECORD_STATUS_DISABLED = 997330001
const DIRECTORY_TEXT_MIN_LENGTH = 3
const DIRECTORY_NUMERIC_MIN_LENGTH = 5
const DIRECTORY_RESULT_LIMIT = 8

function normalizeGroupKey(groupKey: string | undefined | null): string {
  return groupKey?.trim().toUpperCase() ?? ''
}

function extractSfStateId(upn: string | undefined | null): string | null {
  if (!upn) return null
  const localPart = upn.split('@')[0]
  if (!localPart || localPart.length < 9) return null
  return localPart.substring(0, 9)
}

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''")
}

function userDisplayName(user: Pick<AdminUser, 'displayName' | 'email' | 'sfStateId'>): string {
  return user.displayName || user.email || user.sfStateId
}

function userMatchesSearch(user: AdminUser, search: string): boolean {
  const normalizedSearch = search.trim().toLowerCase()
  if (!normalizedSearch) return true

  return [user.displayName, user.email, user.sfStateId]
    .some((value) => value.toLowerCase().includes(normalizedSearch))
}

function groupSortKey(group: AdminGroup): string {
  return `${group.isSystemGroup ? '0' : '1'}-${group.name.toLowerCase()}`
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

function directoryUserFromUser(user: User): DirectoryUser | null {
  const userPrincipalName = user.UserPrincipalName?.trim() ?? ''
  const email = user.Mail?.trim() || userPrincipalName

  if (!userPrincipalName && !email) {
    return null
  }

  return {
    displayName: user.DisplayName?.trim() || email || userPrincipalName,
    email,
    userPrincipalName: userPrincipalName || email,
  }
}

function directoryQueryMinLength(query: string): number {
  return /^\d+$/.test(query.trim()) ? DIRECTORY_NUMERIC_MIN_LENGTH : DIRECTORY_TEXT_MIN_LENGTH
}

function groupAuditSnapshot(group: AdminGroup) {
  return {
    groupName: group.name,
    groupKey: group.groupKey,
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

export default function UsersScreen() {
  const currentUser = useCurrentUser()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [groups, setGroups] = useState<AdminGroup[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [newUserLookup, setNewUserLookup] = useState('')
  const [directoryResults, setDirectoryResults] = useState<DirectoryUser[]>([])
  const [directoryStatus, setDirectoryStatus] = useState<'idle' | 'searching' | 'ready' | 'error'>('idle')
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null)
  const [selectedPhotoLoading, setSelectedPhotoLoading] = useState(false)
  const [selectedPhotoUnavailable, setSelectedPhotoUnavailable] = useState(false)
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [savingUser, setSavingUser] = useState(false)
  const [savingGroupId, setSavingGroupId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const loadUsers = useCallback(async () => {
    setLoadStatus('loading')
    setError('')

    try {
      const [userResult, groupResult, assignmentResult] = await Promise.all([
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
        Sfsures_groupsService.getAll({
          select: [
            'sfsures_groupid',
            'sfsures_name',
            'sfsures_groupkey',
            'sfsures_issystemgroup',
            'sfsures_recordstatus',
          ],
          filter: `sfsures_recordstatus eq ${RECORD_STATUS_ACTIVE}`,
          orderBy: ['sfsures_name asc'],
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
          top: 1000,
        }),
      ])

      const loadedGroups = ((groupResult.data ?? []) as Sfsures_groups[])
        .map((group) => ({
          groupId: group.sfsures_groupid,
          name: group.sfsures_name,
          groupKey: normalizeGroupKey(group.sfsures_groupkey),
          isSystemGroup: group.sfsures_issystemgroup === true,
        }))
        .sort((a, b) => groupSortKey(a).localeCompare(groupSortKey(b)))

      const groupsById = new Map(loadedGroups.map((group) => [group.groupId, group]))
      const loadedAssignments = ((assignmentResult.data ?? []) as Sfsures_usergroupassignments[])
        .map((assignment) => ({
          assignmentId: assignment.sfsures_usergroupassignmentid,
          userId: assignment._sfsures_user_value ?? '',
          groupId: assignment._sfsures_group_value ?? '',
        }))
        .filter((assignment) => assignment.userId && groupsById.has(assignment.groupId))

      const assignmentsByUserId = new Map<string, UserGroupAssignment[]>()
      for (const assignment of loadedAssignments) {
        const userAssignments = assignmentsByUserId.get(assignment.userId) ?? []
        userAssignments.push(assignment)
        assignmentsByUserId.set(assignment.userId, userAssignments)
      }

      const loadedUsers = ((userResult.data ?? []) as Sfsures_appusers[])
        .map((user) => {
          const assignments = assignmentsByUserId.get(user.sfsures_appuserid) ?? []
          const userGroups = assignments
            .map((assignment) => groupsById.get(assignment.groupId))
            .filter((group): group is AdminGroup => !!group)
            .sort((a, b) => groupSortKey(a).localeCompare(groupSortKey(b)))

          return {
            appUserId: user.sfsures_appuserid,
            sfStateId: user.sfsures_sfstateid,
            displayName: user.sfsures_displayname ?? '',
            email: user.sfsures_email ?? '',
            recordStatus: user.sfsures_recordstatus ?? RECORD_STATUS_ACTIVE,
            assignments,
            groups: userGroups,
          }
        })
        .sort((a, b) =>
          userDisplayName(a).toLowerCase().localeCompare(userDisplayName(b).toLowerCase())
        )

      setGroups(loadedGroups)
      setUsers(loadedUsers)
      setSelectedUserId((current) =>
        current && loadedUsers.some((user) => user.appUserId === current)
          ? current
          : loadedUsers[0]?.appUserId ?? null
      )
      setLoadStatus('ready')
    } catch (err) {
      console.error('Users admin load failed:', err)
      setError(err instanceof Error ? err.message : 'Users could not be loaded.')
      setLoadStatus('error')
    }
  }, [])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  const filteredUsers = useMemo(
    () => users.filter((user) => userMatchesSearch(user, search)),
    [search, users]
  )
  const selectedUser = useMemo(
    () => users.find((user) => user.appUserId === selectedUserId) ?? null,
    [selectedUserId, users]
  )
  const selectedUserGroupIds = useMemo(
    () => new Set(selectedUser?.groups.map((group) => group.groupId) ?? []),
    [selectedUser]
  )
  const selectedUserIsCurrentUser = selectedUser?.appUserId === currentUser?.appUserId
  const directoryQuery = newUserLookup.trim()
  const directoryMinLength = directoryQueryMinLength(directoryQuery)
  const directoryQueryIsLongEnough = directoryQuery.length >= directoryMinLength

  useEffect(() => {
    const photoLookupId = selectedUser?.email

    if (!photoLookupId) {
      setSelectedPhotoUrl(null)
      setSelectedPhotoUnavailable(true)
      setSelectedPhotoLoading(false)
      return
    }

    const userPhotoId = photoLookupId
    let cancelled = false

    async function loadSelectedPhoto() {
      setSelectedPhotoUrl(null)
      setSelectedPhotoUnavailable(false)
      setSelectedPhotoLoading(true)

      try {
        const src = await loadTenantProfilePhotoSrc(userPhotoId)

        if (!cancelled) {
          setSelectedPhotoUrl(src)
          setSelectedPhotoUnavailable(!src)
        }
      } catch (err) {
        console.warn('Selected user profile photo could not be loaded:', err)
        if (!cancelled) {
          setSelectedPhotoUrl(null)
          setSelectedPhotoUnavailable(true)
        }
      } finally {
        if (!cancelled) {
          setSelectedPhotoLoading(false)
        }
      }
    }

    void loadSelectedPhoto()

    return () => {
      cancelled = true
    }
  }, [selectedUser?.email])

  useEffect(() => {
    if (!directoryQuery) {
      setDirectoryResults([])
      setDirectoryStatus('idle')
      return
    }

    if (!directoryQueryIsLongEnough) {
      setDirectoryResults([])
      setDirectoryStatus('idle')
      return
    }

    let cancelled = false
    const timer = window.setTimeout(async () => {
      setDirectoryStatus('searching')

      try {
        const result = await Office365UsersService.SearchUserV2(
          directoryQuery,
          DIRECTORY_RESULT_LIMIT,
          true
        )
        const results = (result.data?.value ?? [])
          .map(directoryUserFromUser)
          .filter((user): user is DirectoryUser => !!user)

        if (!cancelled) {
          setDirectoryResults(results)
          setDirectoryStatus('ready')
        }
      } catch (err) {
        console.warn('Directory user search failed:', err)
        if (!cancelled) {
          setDirectoryResults([])
          setDirectoryStatus('error')
        }
      }
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [directoryQuery, directoryQueryIsLongEnough])

  async function createAppUserFromDirectoryUser(
    profile: DirectoryUser
  ): Promise<{ userId: string | null; created: boolean }> {
    const upn = profile.userPrincipalName.trim()
    const sfStateId = extractSfStateId(upn)

    if (!sfStateId) {
      setError('The user profile did not return a valid 9-character SF State ID.')
      return { userId: null, created: false }
    }

    const existingResult = await Sfsures_appusersService.getAll({
      select: ['sfsures_appuserid', 'sfsures_sfstateid'],
      filter: `sfsures_sfstateid eq '${escapeODataString(sfStateId)}'`,
      top: 1,
    })
    const existingUser = existingResult.data?.[0]

    if (existingUser?.sfsures_appuserid) {
      setSelectedUserId(existingUser.sfsures_appuserid)
      setError('This App User already exists.')
      return { userId: existingUser.sfsures_appuserid, created: false }
    }

    const created = await Sfsures_appusersService.create({
      sfsures_sfstateid: sfStateId,
      sfsures_displayname: profile.displayName || upn.split('@')[0] || sfStateId,
      sfsures_email: profile.email || upn,
      sfsures_recordstatus: RECORD_STATUS_ACTIVE,
      statecode: 0,
      statuscode: 1,
    } as unknown as Parameters<typeof Sfsures_appusersService.create>[0])

    return { userId: created.data?.sfsures_appuserid ?? null, created: true }
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const lookup = newUserLookup.trim()
    if (!lookup) {
      setError('Enter a user principal name or email.')
      return
    }

    setSavingUser(true)
    setError('')
    setStatus('')

    try {
      const profileResult = await Office365UsersService.UserProfile_V2(
        lookup,
        'displayName,mail,userPrincipalName'
      )
      const profile = profileResult.data
      const upn = profile?.userPrincipalName?.trim() || lookup
      const result = await createAppUserFromDirectoryUser({
        displayName: profile?.displayName?.trim() || upn.split('@')[0] || upn,
        email: profile?.mail?.trim() || upn,
        userPrincipalName: upn,
      })

      if (!result.created) {
        if (result.userId) {
          await loadUsers()
          setSelectedUserId(result.userId)
        }
        return
      }

      setNewUserLookup('')
      setDirectoryResults([])
      setDirectoryStatus('idle')
      setStatus('User added.')
      await loadUsers()
      setSelectedUserId(result.userId)
    } catch (err) {
      console.error('Create App User failed:', err)
      setError(err instanceof Error ? err.message : 'User could not be added.')
    } finally {
      setSavingUser(false)
    }
  }

  async function handleSelectDirectoryUser(profile: DirectoryUser) {
    setSavingUser(true)
    setError('')
    setStatus('')

    try {
      const result = await createAppUserFromDirectoryUser(profile)

      if (!result.created) {
        if (result.userId) {
          await loadUsers()
          setSelectedUserId(result.userId)
        }
        return
      }

      setNewUserLookup('')
      setDirectoryResults([])
      setDirectoryStatus('idle')
      setStatus('User added.')
      await loadUsers()
      setSelectedUserId(result.userId)
    } catch (err) {
      console.error('Create App User from directory result failed:', err)
      setError(err instanceof Error ? err.message : 'User could not be added.')
    } finally {
      setSavingUser(false)
    }
  }

  async function handleToggleUserStatus() {
    if (!selectedUser) return

    if (selectedUserIsCurrentUser) {
      setError('You cannot disable your own App User row.')
      return
    }

    const nextStatus =
      selectedUser.recordStatus === RECORD_STATUS_DISABLED
        ? RECORD_STATUS_ACTIVE
        : RECORD_STATUS_DISABLED

    setSavingUser(true)
    setError('')
    setStatus('')

    try {
      await Sfsures_appusersService.update(selectedUser.appUserId, {
        sfsures_recordstatus: nextStatus,
      } as unknown as Parameters<typeof Sfsures_appusersService.update>[1])
      setStatus(nextStatus === RECORD_STATUS_ACTIVE ? 'User reactivated.' : 'User disabled.')
      await loadUsers()
    } catch (err) {
      console.error('Update App User status failed:', err)
      setError(err instanceof Error ? err.message : 'User status could not be changed.')
    } finally {
      setSavingUser(false)
    }
  }

  async function handleToggleGroup(group: AdminGroup, checked: boolean) {
    if (!selectedUser) return

    const existingAssignment = selectedUser.assignments.find(
      (assignment) => assignment.groupId === group.groupId
    )

    if (!checked && selectedUserIsCurrentUser && group.groupKey === APP_ADMIN_GROUP_KEY) {
      setError('You cannot remove your own App Admin membership.')
      return
    }

    setSavingGroupId(group.groupId)
    setError('')
    setStatus('')

    try {
      let auditWritten = true
      if (checked) {
        if (existingAssignment) return

        const createdAssignment = await Sfsures_usergroupassignmentsService.create({
          sfsures_name: `${userDisplayName(selectedUser)} - ${group.name}`,
          'sfsures_User@odata.bind': `/sfsures_appusers(${selectedUser.appUserId})`,
          'sfsures_Group@odata.bind': `/sfsures_groups(${group.groupId})`,
          statecode: 0,
          statuscode: 1,
        } as unknown as Parameters<typeof Sfsures_usergroupassignmentsService.create>[0])
        auditWritten = await writeAuditLog({
          actor: currentUser,
          actionType: AUDIT_ACTION_TYPES.groupMemberAdded,
          targetType: AUDIT_TARGET_TYPES.group,
          targetId: group.groupId,
          targetKey: group.groupKey,
          targetLabel: group.name,
          afterState: {
            group: groupAuditSnapshot(group),
            member: userAuditSnapshot(selectedUser),
            assignmentId: createdAssignment.data?.sfsures_usergroupassignmentid,
          },
          details: {
            source: 'Admin Users screen',
          },
        })
        setStatus(auditWritten ? 'Group added.' : 'Group added. Audit log could not be written.')
      } else if (existingAssignment) {
        await Sfsures_usergroupassignmentsService.delete(existingAssignment.assignmentId)
        auditWritten = await writeAuditLog({
          actor: currentUser,
          actionType: AUDIT_ACTION_TYPES.groupMemberRemoved,
          targetType: AUDIT_TARGET_TYPES.group,
          targetId: group.groupId,
          targetKey: group.groupKey,
          targetLabel: group.name,
          beforeState: {
            group: groupAuditSnapshot(group),
            member: userAuditSnapshot(selectedUser),
            assignmentId: existingAssignment.assignmentId,
          },
          afterState: {
            group: groupAuditSnapshot(group),
            member: userAuditSnapshot(selectedUser),
            membership: 'removed',
          },
          details: {
            source: 'Admin Users screen',
          },
        })
        setStatus(auditWritten ? 'Group removed.' : 'Group removed. Audit log could not be written.')
      }

      await loadUsers()
    } catch (err) {
      console.error('Update group assignment failed:', err)
      setError(err instanceof Error ? err.message : 'Group membership could not be changed.')
    } finally {
      setSavingGroupId(null)
    }
  }

  if (loadStatus === 'loading') {
    return (
      <section className={styles.settingsPanel} aria-busy="true">
        <div className={styles.panelToolbar}>
          <h2>Users</h2>
        </div>
        <div className={styles.inlineLoading} role="status">
          Loading users...
        </div>
      </section>
    )
  }

  return (
    <section className={styles.settingsPanel}>
      <div className={styles.panelToolbar}>
        <div>
          <h2>Users</h2>
          <p className={styles.panelMeta}>{users.length} App Users</p>
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
        <button type="button" className={styles.primaryButton} onClick={() => void loadUsers()}>
          Retry
        </button>
      ) : (
        <>
          <form className={styles.userCreateForm} onSubmit={handleCreateUser}>
            <div className={styles.directorySearchField}>
              <label className={styles.fieldWide}>
                <span>Add a new user by name, email, or SF State ID</span>
                <input
                  className={styles.input}
                  type="search"
                  value={newUserLookup}
                  placeholder="Search the directory..."
                  autoComplete="off"
                  onChange={(event) => setNewUserLookup(event.target.value)}
                />
              </label>

              {directoryQuery && (
                <div className={styles.directoryResults} role="listbox">
                  {!directoryQueryIsLongEnough && (
                    <p className={styles.directoryHint}>
                      Type at least {directoryMinLength} characters.
                    </p>
                  )}

                  {directoryQueryIsLongEnough && directoryStatus === 'searching' && (
                    <p className={styles.directoryHint}>Searching directory...</p>
                  )}

                  {directoryQueryIsLongEnough && directoryStatus === 'error' && (
                    <p className={styles.directoryHint}>Directory search unavailable.</p>
                  )}

                  {directoryStatus === 'ready' && directoryResults.length === 0 && (
                    <p className={styles.directoryHint}>No directory results.</p>
                  )}

                  {directoryResults.map((result) => (
                    <button
                      key={`${result.userPrincipalName}-${result.email}`}
                      type="button"
                      className={styles.directoryResult}
                      disabled={savingUser}
                      onClick={() => void handleSelectDirectoryUser(result)}
                    >
                      <span className={styles.directoryResultName}>{result.displayName}</span>
                      <span className={styles.directoryResultMeta}>
                        {result.email || result.userPrincipalName}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="submit" className={styles.primaryButton} disabled={savingUser}>
              {savingUser ? 'Adding...' : 'Add User'}
            </button>
          </form>

          <div className={styles.userAdminGrid}>
            <div className={styles.userListPane}>
              <label className={styles.field}>
                <span>Search current users</span>
                <input
                  className={styles.input}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>

              <div className={styles.userList} role="list" aria-label="App Users">
                {filteredUsers.length === 0 ? (
                  <p className={styles.emptyState}>No users found.</p>
                ) : (
                  filteredUsers.map((user) => (
                    <button
                      key={user.appUserId}
                      type="button"
                      className={
                        selectedUserId === user.appUserId
                          ? `${styles.userListItem} ${styles.userListItemActive}`
                          : styles.userListItem
                      }
                      onClick={() => setSelectedUserId(user.appUserId)}
                    >
                      <span className={styles.userListName}>{userDisplayName(user)}</span>
                      <span className={styles.userListMeta}>
                        {user.email || user.sfStateId}
                      </span>
                      <span
                        className={
                          user.recordStatus === RECORD_STATUS_DISABLED
                            ? `${styles.statusPill} ${styles.statusPillDisabled}`
                            : styles.statusPill
                        }
                      >
                        {user.recordStatus === RECORD_STATUS_DISABLED ? 'Disabled' : 'Active'}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className={styles.userDetailPane}>
              {selectedUser ? (
                <>
                  <div className={styles.userDetailHeader}>
                    <div className={styles.userIdentity}>
                      <div
                        className={
                          selectedPhotoLoading
                            ? `${styles.userPhotoFallback} ${styles.userPhotoLoading}`
                            : styles.userPhotoFallback
                        }
                        aria-hidden="true"
                      >
                        {selectedPhotoUrl && !selectedPhotoUnavailable ? (
                          <img
                            src={selectedPhotoUrl}
                            alt=""
                            className={styles.userPhoto}
                            onError={() => {
                              setSelectedPhotoUrl(null)
                              setSelectedPhotoUnavailable(true)
                            }}
                          />
                        ) : selectedPhotoLoading ? (
                          ''
                        ) : (
                          initialsFor(selectedUser.displayName, selectedUser.email)
                        )}
                      </div>
                      <div>
                        <p className={styles.detailLabel}>App User</p>
                        <h3>{userDisplayName(selectedUser)}</h3>
                      </div>
                    </div>
                    <span
                      className={
                        selectedUser.recordStatus === RECORD_STATUS_DISABLED
                          ? `${styles.statusPill} ${styles.statusPillDisabled}`
                          : styles.statusPill
                      }
                    >
                      {selectedUser.recordStatus === RECORD_STATUS_DISABLED ? 'Disabled' : 'Active'}
                    </span>
                  </div>

                  <dl className={styles.detailList}>
                    <div>
                      <dt>SF State ID</dt>
                      <dd>{selectedUser.sfStateId}</dd>
                    </div>
                    <div>
                      <dt>Email</dt>
                      <dd>
                        {selectedUser.email ? (
                          <a href={`mailto:${selectedUser.email}`}>{selectedUser.email}</a>
                        ) : (
                          'Unavailable'
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Groups</dt>
                      <dd>{selectedUser.groups.length}</dd>
                    </div>
                  </dl>

                  <div className={styles.detailActions}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      disabled={savingUser || selectedUserIsCurrentUser}
                      onClick={() => void handleToggleUserStatus()}
                    >
                      {selectedUser.recordStatus === RECORD_STATUS_DISABLED
                        ? 'Reactivate User'
                        : 'Disable User'}
                    </button>
                  </div>

                  <section className={styles.groupEditor} aria-labelledby="group-editor-heading">
                    <div className={styles.sectionHeader}>
                      <h3 id="group-editor-heading">Group Memberships</h3>
                    </div>
                    <div className={styles.groupChecklist}>
                      {groups.length === 0 ? (
                        <p className={styles.emptyState}>No active groups available.</p>
                      ) : (
                        groups.map((group) => {
                          const checked = selectedUserGroupIds.has(group.groupId)
                          const isLockedSelfAdmin =
                            checked &&
                            selectedUserIsCurrentUser &&
                            group.groupKey === APP_ADMIN_GROUP_KEY

                          return (
                            <label key={group.groupId} className={styles.groupCheckItem}>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={savingGroupId === group.groupId || isLockedSelfAdmin}
                                onChange={(event) =>
                                  void handleToggleGroup(group, event.target.checked)
                                }
                              />
                              <span>
                                <strong>{group.name}</strong>
                                <small>{group.isSystemGroup ? 'System group' : 'Custom group'}</small>
                              </span>
                            </label>
                          )
                        })
                      )}
                    </div>
                  </section>
                </>
              ) : (
                <p className={styles.emptyState}>No user selected.</p>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
