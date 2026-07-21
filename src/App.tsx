/**
 * App.tsx — root component
 *
 * Layer order:
 *   ThemeProvider (loads active settings row; falls back to SFSU defaults)
 *     └─ ThemeCSSVars (applies --sfsures-* CSS custom properties to :root)
 *           └─ AppContent
 *                 ├─ HelpPage for #/help routes (no user lookup needed)
 *                 └─ AccessGate → AppRoutes for calendar/admin app content
 *
 * App content goes inside AccessGate. The standalone end-user help route stays
 * outside it so Help can open in a fresh tab without waiting on Office365Users.
 */

import { lazy, Suspense, useEffect, useState } from 'react'
import { useTheme } from './theme/ThemeContext'
import { ThemeProvider } from './theme/ThemeProvider'
import { AccessGate } from './auth/AccessGate'
import { useCurrentUser } from './auth/UserContext'
import { CalendarScreen } from './calendar/CalendarScreen'
import './App.css'

const AdminApp = lazy(() => import('./admin/AdminApp'))
const HelpPage = lazy(() => import('./help/HelpPage'))
const ReportsScreen = lazy(() => import('./reports/ReportsScreen'))

type ActiveScreen = 'calendar' | 'reports' | 'admin'

function helpTopicFromHash(): string | null {
  const match = window.location.hash.match(/^#\/help\/?([^/?#]*)/)
  if (!match) return null
  return match[1] || ''
}

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

  if (activeScreen === 'reports' && currentUser?.canViewReports) {
    return (
      <Suspense
        fallback={
          <div className="routeLoading" role="status">
            Loading reports...
          </div>
        }
      >
        <ReportsScreen onBack={() => setActiveScreen('calendar')} />
      </Suspense>
    )
  }

  return (
    <CalendarScreen
      onOpenReports={
        currentUser?.canViewReports ? () => setActiveScreen('reports') : undefined
      }
      onOpenAdmin={
        currentUser?.isAppAdmin ? () => setActiveScreen('admin') : undefined
      }
    />
  )
}

function AppContent() {
  const [helpTopicId, setHelpTopicId] = useState<string | null>(() => helpTopicFromHash())

  useEffect(() => {
    function handleHashChange() {
      setHelpTopicId(helpTopicFromHash())
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  if (helpTopicId !== null) {
    return (
      <Suspense
        fallback={
          <div className="routeLoading" role="status">
            Loading help...
          </div>
        }
      >
        <HelpPage activeTopicId={helpTopicId || undefined} />
      </Suspense>
    )
  }

  return (
    <AccessGate>
      <AppRoutes />
    </AccessGate>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <ThemeCSSVars />
      <AppContent />
    </ThemeProvider>
  )
}
