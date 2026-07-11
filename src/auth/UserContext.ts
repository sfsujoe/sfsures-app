/**
 * Authenticated App User context, types, and permission keys.
 *
 * The provider component lives in UserProvider.tsx so this shared module can
 * safely export non-component values without interfering with Fast Refresh.
 */

import { createContext, useContext } from 'react'

export const APP_ADMIN_GROUP_KEY = 'APP_ADMINS'
export const REPORT_VIEWERS_GROUP_KEY = 'REPORT_VIEWERS'

export interface CurrentUserGroup {
  groupId: string
  name: string
  groupKey: string
  isSystemGroup: boolean
}

export interface CurrentUser {
  /** Dataverse row GUID for sfsures_appuser */
  appUserId: string
  /** Office365/Entra sign-in name used for tenant-backed profile lookups */
  userPrincipalName?: string
  /** First 9 chars of UPN — the immutable key */
  sfStateId: string
  /** Display name snapshot from the App User row */
  displayName: string
  /** Email snapshot from the App User row */
  email: string
  /** Active app groups the user belongs to */
  groups: CurrentUserGroup[]
  /** Stable active app group keys for fast UI permission checks */
  groupKeys: string[]
  /** App-layer admin UI permission */
  isAppAdmin: boolean
  /** App-layer report UI permission */
  canViewReports: boolean
}

export const UserContext = createContext<CurrentUser | null>(null)

/**
 * Returns the current App User record, or null before AccessGate has allowed
 * the authenticated branch to render.
 */
export function useCurrentUser(): CurrentUser | null {
  return useContext(UserContext)
}
