/**
 * UserContext
 *
 * Holds the authenticated user's App User record after AccessGate validates.
 * Populated once during the access check; consumed by any component that
 * needs the current user's SF State ID, App User GUID, display name, or
 * email without re-querying Dataverse.
 *
 * This is NOT the Dataverse security identity (systemuser / OwnerId) — it's
 * the app-layer App User record keyed by SF State ID.
 */

import { createContext, useContext, type ReactNode } from 'react'

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
}

const UserContext = createContext<CurrentUser | null>(null)

/**
 * Returns the current App User record, or null if called outside
 * the AccessGate's "allowed" branch (should never happen in practice
 * because AccessGate blocks rendering until the check passes).
 */
export function useCurrentUser(): CurrentUser | null {
  return useContext(UserContext)
}

export function UserProvider({
  user,
  children,
}: {
  user: CurrentUser
  children: ReactNode
}) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>
}
