/**
 * App.tsx — root component
 *
 * Layer order:
 *   ThemeProvider (loads active settings row; falls back to SFSU defaults)
 *     └─ ThemeCSSVars (applies --sfsures-* CSS custom properties to :root)
 *           └─ AccessGate (SF State ID check; blocks with modal if failed)
 *                 └─ CalendarScreen (the first real screen)
 *
 * Every screen added later goes inside AccessGate so the access check is
 * enforced for the whole app, not just the calendar route.
 */

import { useEffect } from 'react'
import { ThemeProvider, useTheme } from './theme/ThemeContext'
import { AccessGate } from './auth/AccessGate'
import { CalendarScreen } from './calendar/CalendarScreen'
import './App.css'

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
    root.style.setProperty('--sfsures-font', theme.fontFamily)
    root.style.setProperty('--sfsures-radius', `${theme.borderRadius}px`)
  }, [theme, loading])

  return null
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  return (
    <ThemeProvider>
      <ThemeCSSVars />
      <AccessGate>
        <CalendarScreen />
      </AccessGate>
    </ThemeProvider>
  )
}
