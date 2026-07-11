/**
 * AccessGate
 *
 * Fires before any content renders. Calls Office365Users.MyProfile_V2 to get
 * the signed-in user's UPN, extracts the SF State ID (first 9 chars), checks
 * it against sfsures_appuser (must exist + Record Status = Active), and blocks
 * with a full-screen modal if any check fails.
 *
 * On success, wraps children in a UserProvider so any downstream component
 * can call useCurrentUser() to get the authenticated user's App User record
 * without re-querying Dataverse.
 *
 * Security notes:
 * - This gate is defense-in-depth. The real authorization boundary is the
 *   Dataverse security role. A user with no role gets empty .data, not an
 *   error — the gate guards against that silent-empty failure mode too.
 * - Do NOT expose app content behind this modal via z-index tricks; the
 *   modal is rendered instead of the content, not on top of it.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { Office365UsersService } from '../generated/services/Office365UsersService'
import { Sfsures_appusersService } from '../generated/services/Sfsures_appusersService'
import { Sfsures_groupsService } from '../generated/services/Sfsures_groupsService'
import { Sfsures_usergroupassignmentsService } from '../generated/services/Sfsures_usergroupassignmentsService'
import { useTheme } from '../theme/ThemeContext'
import {
  APP_ADMIN_GROUP_KEY,
  REPORT_VIEWERS_GROUP_KEY,
  type CurrentUser,
  type CurrentUserGroup,
} from './UserContext'
import { UserProvider } from './UserProvider'
import styles from './AccessGate.module.css'

function extractSfStateId(upn: string | undefined | null): string | null {
  if (!upn) return null
  const raw = upn.split('@')[0]
  if (!raw || raw.length < 9) return null
  return raw.substring(0, 9)
}

function normalizeGroupKey(groupKey: string | undefined | null): string {
  return groupKey?.trim().toUpperCase() ?? ''
}

async function loadCurrentUserGroups(appUserId: string): Promise<CurrentUserGroup[]> {
  const assignmentResult = await Sfsures_usergroupassignmentsService.getAll({
    select: ['sfsures_usergroupassignmentid', '_sfsures_group_value', '_sfsures_user_value', 'statecode'],
    filter: `_sfsures_user_value eq ${appUserId} and statecode eq 0`,
    top: 200,
  })

  const groupIds = new Set(
    (assignmentResult.data ?? [])
      .map((assignment) => assignment._sfsures_group_value)
      .filter((groupId): groupId is string => !!groupId)
  )

  if (groupIds.size === 0) {
    return []
  }

  const groupResult = await Sfsures_groupsService.getAll({
    select: [
      'sfsures_groupid',
      'sfsures_name',
      'sfsures_groupkey',
      'sfsures_issystemgroup',
      'sfsures_recordstatus',
    ],
    filter: 'sfsures_recordstatus eq 997330000',
    orderBy: ['sfsures_name asc'],
    top: 500,
  })

  return (groupResult.data ?? [])
    .filter((group) => groupIds.has(group.sfsures_groupid))
    .map((group) => ({
      groupId: group.sfsures_groupid,
      name: group.sfsures_name,
      groupKey: normalizeGroupKey(group.sfsures_groupkey),
      isSystemGroup: group.sfsures_issystemgroup === true,
    }))
    .filter((group) => group.groupKey)
}

type GateStatus =
  | 'checking'
  | 'allowed'
  | 'not-onboarded'
  | 'disabled'
  | 'error'

interface AccessGateProps {
  children: ReactNode
}

export function AccessGate({ children }: AccessGateProps) {
  const [status, setStatus] = useState<GateStatus>('checking')
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const { theme } = useTheme()

  useEffect(() => {
    const check = async () => {
      try {
        // Step 1: get the signed-in user's UPN from Office365Users.
        const profileResult = await Office365UsersService.MyProfile_V2('userPrincipalName')
        const upn = profileResult.data?.userPrincipalName
        const sfStateId = extractSfStateId(upn)

        if (!sfStateId) {
          setStatus('not-onboarded')
          return
        }

        // Step 2: look up the App User row by SF State ID.
        const result = await Sfsures_appusersService.getAll({
          select: [
            'sfsures_appuserid',
            'sfsures_sfstateid',
            'sfsures_displayname',
            'sfsures_email',
            'sfsures_recordstatus',
          ],
          filter: `sfsures_sfstateid eq '${sfStateId}'`,
          top: 1,
        })

        const row = result.data?.[0]

        if (!row) {
          setStatus('not-onboarded')
          return
        }

        // Record Status: Active = 997330000, Disabled = 997330001.
        if (row.sfsures_recordstatus === 997330001) {
          setStatus('disabled')
          return
        }

        const groups = await loadCurrentUserGroups(row.sfsures_appuserid)
        const groupKeys = Array.from(new Set(groups.map((group) => group.groupKey)))
        const isAppAdmin = groupKeys.includes(APP_ADMIN_GROUP_KEY)
        const canViewReports = isAppAdmin || groupKeys.includes(REPORT_VIEWERS_GROUP_KEY)

        setCurrentUser({
          appUserId: row.sfsures_appuserid,
          userPrincipalName: upn,
          sfStateId: row.sfsures_sfstateid,
          displayName: row.sfsures_displayname ?? '',
          email: row.sfsures_email ?? '',
          groups,
          groupKeys,
          isAppAdmin,
          canViewReports,
        })
        setStatus('allowed')
      } catch (err) {
        console.error('Access gate check failed:', err)
        setStatus('error')
      }
    }

    check()
  }, [])

  if (status === 'checking') {
    return (
      <div className={styles.overlay}>
        <div className={styles.card}>
          <div className={styles.spinner} style={{ borderTopColor: theme.primaryColor }} />
          <p className={styles.message}>Verifying your access…</p>
        </div>
      </div>
    )
  }

  if (status === 'allowed' && currentUser) {
    return (
      <UserProvider user={currentUser}>
        {children}
      </UserProvider>
    )
  }

  const heading =
    status === 'disabled'
      ? 'Your account has been deactivated'
      : status === 'error'
        ? 'Unable to verify access'
        : 'Access not granted'

  const body =
    status === 'disabled'
      ? 'Your account exists but has been deactivated. Contact your department administrator to re-enable access.'
      : status === 'error'
        ? 'A problem occurred while checking your access. Try reloading the page. If this continues, contact your department administrator.'
        : 'Your SFSU account has not been added to this reservation system yet. Contact your department administrator to request access.'

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <div
          className={styles.iconWrap}
          style={{ backgroundColor: `${theme.primaryColor}18` }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2Zm0 11a1 1 0 0 1-1-1V8a1 1 0 1 1 2 0v4a1 1 0 0 1-1 1Zm0 4a1.25 1.25 0 1 1 0-2.5A1.25 1.25 0 0 1 12 17Z"
              fill={theme.primaryColor}
            />
          </svg>
        </div>
        <h1 className={styles.heading} style={{ color: theme.primaryColor }}>
          {heading}
        </h1>
        <p className={styles.message}>{body}</p>
      </div>
    </div>
  )
}
