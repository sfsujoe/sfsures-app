/**
 * ThemeContext
 *
 * Loads the single active sfsures_appsettings row at startup and exposes
 * resolved theme values (hex colors, logo URL, font family, border radius)
 * as React context. The rest of the app reads from this context, never from
 * Dataverse directly, so every component is immune to the "active row not
 * yet loaded" timing problem.
 *
 * Fallback values are the SFSU defaults so the app is fully styled even if
 * the settings row doesn't exist yet in a fresh instance.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Sfsures_appsettingsesService } from '../generated/services/Sfsures_appsettingsesService'

export interface AppTheme {
  primaryColor: string    // hex with #, e.g. #442C8B
  accentColor: string     // hex with #, e.g. #DCAE27
  backgroundColor: string // hex with #, e.g. #FFFFFF
  logoUrl: string
  fontFamily: string
  borderRadius: number    // px
  selectedThemeName: string
}

const SFSU_DEFAULTS: AppTheme = {
  primaryColor: '#442C8B',
  accentColor: '#DCAE27',
  backgroundColor: '#FFFFFF',
  logoUrl: 'https://sfsu.box.com/shared/static/b3cahvh2dsiozgt5m37kw0pdre8bf5p8.png',
  fontFamily: 'Inter, system-ui, sans-serif',
  borderRadius: 6,
  selectedThemeName: 'SFSU Default',
}

interface ThemeContextValue {
  theme: AppTheme
  loading: boolean
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: SFSU_DEFAULTS,
  loading: true,
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<AppTheme>(SFSU_DEFAULTS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const result = await Sfsures_appsettingsesService.getAll({
          select: [
            'sfsures_primarycolor',
            'sfsures_accentcolor',
            'sfsures_backgroundcolor',
            'sfsures_logo',
            'sfsures_fontfamily',
            'sfsures_borderradiuspx',
            'sfsures_selectedthemename',
            'sfsures_isactive',
          ],
          filter: 'sfsures_isactive eq true',
          top: 1,
        })

        const row = result.data?.[0]
        if (row) {
          setTheme({
            primaryColor: row.sfsures_primarycolor ?? SFSU_DEFAULTS.primaryColor,
            accentColor: row.sfsures_accentcolor ?? SFSU_DEFAULTS.accentColor,
            backgroundColor: row.sfsures_backgroundcolor ?? SFSU_DEFAULTS.backgroundColor,
            logoUrl: row.sfsures_logo ?? '',
            fontFamily: row.sfsures_fontfamily ?? SFSU_DEFAULTS.fontFamily,
            borderRadius: row.sfsures_borderradiuspx ?? SFSU_DEFAULTS.borderRadius,
            selectedThemeName: row.sfsures_selectedthemename ?? SFSU_DEFAULTS.selectedThemeName,
          })
        }
        // If no active row: stay on defaults — a fresh instance still renders correctly.
      } catch (err) {
        // Network or permission error: stay on defaults.
        console.warn('Theme load failed — using SFSU defaults:', err)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, loading }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}
