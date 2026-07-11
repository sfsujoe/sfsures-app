import type { ReactNode } from 'react'
import { UserContext, type CurrentUser } from './UserContext'

export function UserProvider({
  user,
  children,
}: {
  user: CurrentUser
  children: ReactNode
}) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>
}
