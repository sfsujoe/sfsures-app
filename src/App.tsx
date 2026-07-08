/**
 * App.tsx — root component
 *
 * Layer order:
 *   ThemeProvider (loads active settings row; falls back to SFSU defaults)
 *     └─ ThemeCSSVars (applies --sfsures-* CSS custom properties to :root)
 *           └─ AccessGate (SF State ID check; blocks with modal if failed)
 *                 └─ AppRoutes (calendar first; admin is lazy-loaded)
 *
 * Every screen added later goes inside AccessGate so the access check is
 * enforced for the whole app, not just the calendar route.
 */

import { lazy, Suspense, useEffect, useState } from 'react'
import { ThemeProvider, useTheme } from './theme/ThemeContext'
import { AccessGate } from './auth/AccessGate'
import { useCurrentUser } from './auth/UserContext'
import { CalendarScreen } from './calendar/CalendarScreen'
import './App.css'

const AdminApp = lazy(() => import('./admin/AdminApp'))

type ActiveScreen = 'calendar' | 'admin'

// ---------------------------------------------------------------------------
// ThemeCSSVars — writes resolved hex values to CSS custom properties on <html>
// so FullCalendar overrides and global styles can consume them without prop
// drilling.
// ---------------------------------------------------------------------------

function ThemeCSSVars() {
  const { theme, loading } = useTheme()

  useEffect(() => {
    if (loading) return
    const root = document.documentElement
    root.style.setProperty('--sfsures-primary', theme.primaryColor)
    root.style.setProperty('--sfsures-accent', theme.accentColor)
    root.style.setProperty('--sfsures-bg', theme.backgroundColor)
    root.style.setProperty('--sfsures-date-header', theme.dateHeaderColor)
    root.style.setProperty('--sfsures-font', theme.fontFamily)
    root.style.setProperty('--sfsures-radius', `${theme.borderRadius}px`)
  }, [theme, loading])

  return null
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

function AppRoutes() {
  const currentUser = useCurrentUser()
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('calendar')

  useEffect(() => {
    if (activeScreen === 'admin' && currentUser?.isAppAdmin !== true) {
      setActiveScreen('calendar')
    }
  }, [activeScreen, currentUser?.isAppAdmin])

  if (activeScreen === 'admin' && currentUser?.isAppAdmin) {
    return (
      <Suspense
        fallback={
          <div className="routeLoading" role="status">
            Loading admin...
          </div>
        }
      >
        <AdminApp onBack={() => setActiveScreen('calendar')} />
      </Suspense>
    )
  }

  return (
    <CalendarScreen
      onOpenAdmin={
        currentUser?.isAppAdmin ? () => setActiveScreen('admin') : undefined
      }
    />
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <ThemeCSSVars />
      <AccessGate>
        <AppRoutes />
      </AccessGate>
    </ThemeProvider>
  )
}
