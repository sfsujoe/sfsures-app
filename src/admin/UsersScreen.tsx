import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { useFocusTrap } from '../a11y/useFocusTrap'
import { AUDIT_ACTION_TYPES, AUDIT_TARGET_TYPES, writeAuditLog } from '../audit/auditLog'
import { APP_ADMIN_GROUP_KEY, useCurrentUser } from '../auth/UserContext'
import { Office365UsersService } from '../generated/services/Office365UsersService'
import { Sfsures_appusersService } from '../generated/services/Sfsures_appusersService'
import { Sfsures_groupsService } from '../generated/services/Sfsures_groupsService'
import { Sfsures_usergroupassignmentsService } from '../generated/services/Sfsures_usergroupassignmentsService'
import { SystemusersService } from '../generated/services/SystemusersService'
import type { Sfsures_appusers } from '../generated/models/Sfsures_appusersModel'
import type { Sfsures_groups } from '../generated/models/Sfsures_groupsModel'
import type { Sfsures_usergroupassignments } from '../generated/models/Sfsures_usergroupassignmentsModel'
import type { User } from '../generated/models/Office365UsersModel'
import type { Systemusers } from '../generated/models/SystemusersModel'
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
  dataverseUserId: string
  recordStatus: number
  assignments: UserGroupAssignment[]
  groups: AdminGroup[]
}

interface DirectoryUser {
  directoryObjectId: string
  displayName: string
  email: string
  userPrincipalName: string
}

interface DataverseSystemUser {
  userId: string
}

type AppUserOnboardingOutcome = 'created' | 'mapped' | 'exists'

interface SelectedPhotoResult {
  lookupId: string
  url: string | null
  unavailable: boolean
}

const RECORD_STATUS_ACTIVE = 997330000
const RECORD_STATUS_DISABLED = 997330001
const DIRECTORY_TEXT_MIN_LENGTH = 3
const DIRECTORY_NUMERIC_MIN_LENGTH = 5
const DIRECTORY_RESULT_LIMIT = 8
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

function normalizeIdentity(value: string | undefined | null): string {
  return value?.trim().toLowerCase() ?? ''
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
    directoryObjectId: user.Id?.trim() ?? '',
    displayName: user.DisplayName?.trim() || email || userPrincipalName,
    email,
    userPrincipalName: userPrincipalName || email,
  }
}

function directoryUserFieldValue(user: DirectoryUser): string {
  const identity = user.email || user.userPrincipalName
  return user.displayName && normalizeIdentity(user.displayName) !== normalizeIdentity(identity)
    ? `${user.displayName} — ${identity}`
    : identity
}

async function resolveDataverseSystemUser(profile: DirectoryUser): Promise<DataverseSystemUser> {
  const directoryObjectId = profile.directoryObjectId.trim().replace(/[{}]/g, '')
  const upn = profile.userPrincipalName.trim()
  const email = profile.email.trim()
  const identityFilters: string[] = []

  if (GUID_PATTERN.test(directoryObjectId)) {
    identityFilters.push(`azureactivedirectoryobjectid eq ${directoryObjectId}`)
  }
  if (upn) {
    identityFilters.push(`domainname eq '${escapeODataString(upn)}'`)
  }
  if (email) {
    identityFilters.push(`internalemailaddress eq '${escapeODataString(email)}'`)
  }

  if (identityFilters.length === 0) {
    throw new Error('The selected directory profile does not contain an identity Dataverse can match.')
  }

  const result = await SystemusersService.getAll({
    select: [
      'systemuserid',
      'azureactivedirectoryobjectid',
      'domainname',
      'internalemailaddress',
      'isdisabled',
      'applicationid',
    ],
    filter: `(${identityFilters.join(' or ')}) and isdisabled eq false and applicationid eq null`,
    top: 10,
  })
  const candidates = ((result.data ?? []) as Systemusers[])
    .filter((candidate) => candidate.systemuserid && candidate.isdisabled !== true)

  const directoryMatches = directoryObjectId
    ? candidates.filter(
        (candidate) => normalizeIdentity(candidate.azureactivedirectoryobjectid) === directoryObjectId.toLowerCase()
      )
    : []
  const fallbackIdentities = new Set([normalizeIdentity(upn), normalizeIdentity(email)].filter(Boolean))
  const fallbackMatches = candidates.filter(
    (candidate) =>
      fallbackIdentities.has(normalizeIdentity(candidate.domainname)) ||
      fallbackIdentities.has(normalizeIdentity(candidate.internalemailaddress))
  )
  const matches = directoryMatches.length > 0 ? directoryMatches : fallbackMatches

  if (matches.length === 0) {
    throw new Error(
      `No enabled Dataverse user was found for ${upn || email}. Add the user to this environment and the appropriate Owner team before creating the App User.`
    )
  }
  if (matches.length > 1) {
    throw new Error(
      `More than one enabled Dataverse user matched ${upn || email}. Review the environment User records before continuing.`
    )
  }

  const match = matches[0]
  return {
    userId: match.systemuserid,
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
  const [selectedDirectoryUser, setSelectedDirectoryUser] = useState<DirectoryUser | null>(null)
  const [confirmationUser, setConfirmationUser] = useState<DirectoryUser | null>(null)
  const [confirmationPhotoResult, setConfirmationPhotoResult] = useState<SelectedPhotoResult | null>(null)
  const [confirmationError, setConfirmationError] = useState('')
  const [selectedPhotoResult, setSelectedPhotoResult] = useState<SelectedPhotoResult | null>(null)
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [preparingUser, setPreparingUser] = useState(false)
  const [savingUser, setSavingUser] = useState(false)
  const [savingGroupId, setSavingGroupId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const confirmationDialogRef = useRef<HTMLDivElement | null>(null)
  useFocusTrap(confirmationDialogRef, confirmationUser !== null)

  const loadUsers = useCallback(async () => {
    try {
      const [userResult, groupResult, assignmentResult] = await Promise.all([
        Sfsures_appusersService.getAll({
          select: [
            'sfsures_appuserid',
            'sfsures_sfstateid',
            'sfsures_displayname',
            'sfsures_email',
            '_sfsures_dataverseuser_value',
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
            dataverseUserId: user._sfsures_dataverseuser_value ?? '',
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
      setError('')
      setLoadStatus('ready')
    } catch (err) {
      console.error('Users admin load failed:', err)
      setError(err instanceof Error ? err.message : 'Users could not be loaded.')
      setLoadStatus('error')
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => void loadUsers())
  }, [loadUsers])

  function handleRetryLoadUsers() {
    setLoadStatus('loading')
    setError('')
    void loadUsers()
  }

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
  const selectedPhotoLookupId = selectedUser?.email ?? ''
  const selectedPhotoMatches = selectedPhotoResult?.lookupId === selectedPhotoLookupId
  const selectedPhotoUrl = selectedPhotoMatches ? selectedPhotoResult.url : null
  const selectedPhotoLoading = Boolean(selectedPhotoLookupId) && !selectedPhotoMatches
  const selectedPhotoUnavailable =
    !selectedPhotoLookupId || (selectedPhotoMatches && selectedPhotoResult.unavailable)
  const confirmationPhotoLookupId = confirmationUser
    ? confirmationUser.directoryObjectId || confirmationUser.userPrincipalName || confirmationUser.email
    : ''
  const confirmationPhotoMatches = confirmationPhotoResult?.lookupId === confirmationPhotoLookupId
  const confirmationPhotoUrl = confirmationPhotoMatches ? confirmationPhotoResult.url : null
  const confirmationPhotoLoading = Boolean(confirmationPhotoLookupId) && !confirmationPhotoMatches
  const confirmationPhotoUnavailable =
    !confirmationPhotoLookupId || (confirmationPhotoMatches && confirmationPhotoResult.unavailable)

  useEffect(() => {
    if (!selectedPhotoLookupId) return

    const userPhotoId = selectedPhotoLookupId
    let cancelled = false

    async function loadSelectedPhoto() {
      try {
        const src = await loadTenantProfilePhotoSrc(userPhotoId)

        if (!cancelled) {
          setSelectedPhotoResult({ lookupId: userPhotoId, url: src, unavailable: !src })
        }
      } catch (err) {
        console.warn('Selected user profile photo could not be loaded:', err)
        if (!cancelled) {
          setSelectedPhotoResult({ lookupId: userPhotoId, url: null, unavailable: true })
        }
      }
    }

    void loadSelectedPhoto()

    return () => {
      cancelled = true
    }
  }, [selectedPhotoLookupId])

  useEffect(() => {
    if (!confirmationPhotoLookupId) return

    const userPhotoId = confirmationPhotoLookupId
    let cancelled = false

    async function loadConfirmationPhoto() {
      try {
        const src = await loadTenantProfilePhotoSrc(userPhotoId)

        if (!cancelled) {
          setConfirmationPhotoResult({ lookupId: userPhotoId, url: src, unavailable: !src })
        }
      } catch (err) {
        console.warn('Confirmation profile photo could not be loaded:', err)
        if (!cancelled) {
          setConfirmationPhotoResult({ lookupId: userPhotoId, url: null, unavailable: true })
        }
      }
    }

    void loadConfirmationPhoto()

    return () => {
      cancelled = true
    }
  }, [confirmationPhotoLookupId])

  useEffect(() => {
    if (selectedDirectoryUser || !directoryQueryIsLongEnough) return

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
  }, [directoryQuery, directoryQueryIsLongEnough, selectedDirectoryUser])

  function updateDirectoryQuery(value: string) {
    setNewUserLookup(value)
    setSelectedDirectoryUser(null)
    setDirectoryResults([])
    setDirectoryStatus('idle')
  }

  function clearDirectoryQuery() {
    updateDirectoryQuery('')
  }

  function selectDirectoryUser(profile: DirectoryUser) {
    setSelectedDirectoryUser(profile)
    setNewUserLookup(directoryUserFieldValue(profile))
    setDirectoryResults([])
    setDirectoryStatus('idle')
    setError('')
    setStatus('')
  }

  async function createAppUserFromDirectoryUser(
    profile: DirectoryUser
  ): Promise<{ userId: string | null; outcome: AppUserOnboardingOutcome }> {
    const upn = profile.userPrincipalName.trim()
    const sfStateId = extractSfStateId(upn)

    if (!sfStateId) {
      throw new Error('The user profile did not return a valid 9-character SF State ID.')
    }

    const dataverseUser = await resolveDataverseSystemUser(profile)

    const existingResult = await Sfsures_appusersService.getAll({
      select: [
        'sfsures_appuserid',
        'sfsures_sfstateid',
        '_sfsures_dataverseuser_value',
      ],
      filter: `sfsures_sfstateid eq '${escapeODataString(sfStateId)}'`,
      top: 1,
    })
    const existingUser = existingResult.data?.[0]

    if (existingUser?.sfsures_appuserid) {
      setSelectedUserId(existingUser.sfsures_appuserid)
      const existingDataverseUserId = existingUser._sfsures_dataverseuser_value ?? ''

      if (
        existingDataverseUserId &&
        normalizeIdentity(existingDataverseUserId) !== normalizeIdentity(dataverseUser.userId)
      ) {
        throw new Error(
          'This App User is already mapped to a different Dataverse user. Review the App User row before continuing.'
        )
      }

      if (!existingDataverseUserId) {
        await Sfsures_appusersService.update(existingUser.sfsures_appuserid, {
          'sfsures_DataverseUser@odata.bind': `/systemusers(${dataverseUser.userId})`,
        } as Parameters<typeof Sfsures_appusersService.update>[1])
        return { userId: existingUser.sfsures_appuserid, outcome: 'mapped' }
      }

      return { userId: existingUser.sfsures_appuserid, outcome: 'exists' }
    }

    const created = await Sfsures_appusersService.create({
      sfsures_sfstateid: sfStateId,
      sfsures_displayname: profile.displayName || upn.split('@')[0] || sfStateId,
      sfsures_email: profile.email || upn,
      'sfsures_DataverseUser@odata.bind': `/systemusers(${dataverseUser.userId})`,
      sfsures_recordstatus: RECORD_STATUS_ACTIVE,
      statecode: 0,
      statuscode: 1,
    } as unknown as Parameters<typeof Sfsures_appusersService.create>[0])

    return { userId: created.data?.sfsures_appuserid ?? null, outcome: 'created' }
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const lookup = newUserLookup.trim()
    if (!lookup) {
      setError('Enter a user principal name or email.')
      return
    }

    setPreparingUser(true)
    setError('')
    setStatus('')

    try {
      let profile = selectedDirectoryUser

      if (!profile) {
        const profileResult = await Office365UsersService.UserProfile_V2(
          lookup,
          'id,displayName,mail,userPrincipalName'
        )
        const directoryProfile = profileResult.data
        const upn = directoryProfile?.userPrincipalName?.trim() || lookup
        profile = {
          directoryObjectId: directoryProfile?.id?.trim() ?? '',
          displayName: directoryProfile?.displayName?.trim() || upn.split('@')[0] || upn,
          email: directoryProfile?.mail?.trim() || upn,
          userPrincipalName: upn,
        }
        selectDirectoryUser(profile)
      }

      setConfirmationPhotoResult(null)
      setConfirmationError('')
      setConfirmationUser(profile)
    } catch (err) {
      console.error('Prepare App User confirmation failed:', err)
      setError(err instanceof Error ? err.message : 'User could not be verified.')
    } finally {
      setPreparingUser(false)
    }
  }

  function closeUserConfirmation() {
    if (savingUser) return
    setConfirmationUser(null)
    setConfirmationPhotoResult(null)
    setConfirmationError('')
  }

  function handleConfirmationKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !savingUser) {
      event.preventDefault()
      closeUserConfirmation()
    }
  }

  async function handleConfirmAddUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!confirmationUser) return

    setSavingUser(true)
    setConfirmationError('')

    try {
      const result = await createAppUserFromDirectoryUser(confirmationUser)

      setConfirmationUser(null)
      setConfirmationPhotoResult(null)
      clearDirectoryQuery()
      setStatus(
        result.outcome === 'created'
          ? 'User added and linked to their Dataverse user.'
          : result.outcome === 'mapped'
            ? 'Existing App User linked to their Dataverse user.'
            : 'This App User already exists and has the correct Dataverse user link.'
      )
      await loadUsers()
      setSelectedUserId(result.userId)
    } catch (err) {
      console.error('Confirmed App User creation failed:', err)
      setConfirmationError(err instanceof Error ? err.message : 'User could not be added.')
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
        <button type="button" className={styles.primaryButton} onClick={handleRetryLoadUsers}>
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
                  onChange={(event) => updateDirectoryQuery(event.target.value)}
                />
              </label>

              {directoryQuery && !selectedDirectoryUser && (
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
                      disabled={savingUser || preparingUser}
                      onClick={() => selectDirectoryUser(result)}
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
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={savingUser || preparingUser}
            >
              {preparingUser ? 'Verifying...' : 'Add User'}
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
                              setSelectedPhotoResult((current) =>
                                current?.lookupId === selectedPhotoLookupId
                                  ? { ...current, url: null, unavailable: true }
                                  : current
                              )
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
                      <dt>Dataverse user</dt>
                      <dd>{selectedUser.dataverseUserId ? 'Mapped' : 'Not mapped'}</dd>
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

      {confirmationUser && (
        <div className={styles.modalBackdrop}>
          <div
            ref={confirmationDialogRef}
            className={styles.adminModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-user-confirmation-title"
            aria-describedby="add-user-confirmation-warning"
            tabIndex={-1}
            onKeyDown={handleConfirmationKeyDown}
          >
            <form className={styles.modalForm} onSubmit={handleConfirmAddUser}>
              <header className={styles.modalHeader}>
                <div>
                  <p className={styles.detailLabel}>App User</p>
                  <h2 id="add-user-confirmation-title">Confirm Add User</h2>
                </div>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={savingUser}
                  onClick={closeUserConfirmation}
                >
                  Close
                </button>
              </header>

              {confirmationError && (
                <p className={styles.errorBanner} role="alert">
                  {confirmationError}
                </p>
              )}

              <div className={styles.modalBody}>
                <div className={styles.userConfirmationIdentity}>
                  <div
                    className={
                      confirmationPhotoLoading
                        ? `${styles.userPhotoFallback} ${styles.userPhotoLoading}`
                        : styles.userPhotoFallback
                    }
                    aria-hidden="true"
                  >
                    {confirmationPhotoUrl && !confirmationPhotoUnavailable ? (
                      <img
                        src={confirmationPhotoUrl}
                        alt=""
                        className={styles.userPhoto}
                        onError={() => {
                          setConfirmationPhotoResult((current) =>
                            current?.lookupId === confirmationPhotoLookupId
                              ? { ...current, url: null, unavailable: true }
                              : current
                          )
                        }}
                      />
                    ) : confirmationPhotoLoading ? (
                      ''
                    ) : (
                      initialsFor(confirmationUser.displayName, confirmationUser.email)
                    )}
                  </div>
                  <div className={styles.userConfirmationDetails}>
                    <h3>{confirmationUser.displayName}</h3>
                    <p>{confirmationUser.email || confirmationUser.userPrincipalName}</p>
                  </div>
                </div>

                <p
                  id="add-user-confirmation-warning"
                  className={styles.userConfirmationWarning}
                >
                  <strong>This action cannot be undone.</strong> Confirm that this is the correct
                  person before adding them as an App User.
                </p>
              </div>

              <footer className={styles.modalFooter}>
                <div />
                <div className={styles.modalFooterActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    disabled={savingUser}
                    onClick={closeUserConfirmation}
                  >
                    Cancel
                  </button>
                  <button type="submit" className={styles.primaryButton} disabled={savingUser}>
                    {savingUser ? 'Adding...' : 'Confirm Add User'}
                  </button>
                </div>
              </footer>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
