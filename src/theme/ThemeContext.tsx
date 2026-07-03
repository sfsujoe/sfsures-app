/**
 * ThemeContext
 *
 * Loads the single active sfsures_appsettings row at startup and exposes
 * resolved theme values plus app-level reservation limits as React context.
 * The rest of the app reads from this context, never from Dataverse directly,
 * so every component is immune to the "active row not yet loaded" timing
 * problem.
 *
 * Fallback values are the SFSU defaults so the app is fully usable even if
 * the settings row doesn't exist yet in a fresh instance. Reservation limits
 * are hard-capped in code: App Settings may only make them more restrictive.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Sfsures_appsettingsesService } from '../generated/services/Sfsures_appsettingsesService'
import sfsuDefaultLogoUrl from '../assets/sfsu-logo.png?inline'

export const SFSU_DEFAULT_FONT_FAMILY =
  "'Source Sans 3', system-ui, -apple-system, 'Segoe UI', sans-serif"

export const HARD_MAX_RESERVATION_OCCURRENCES = 50
export const HARD_MAX_RESERVATION_SPAN_WEEKS = 18

export interface ReservationLimits {
  maxOccurrences: number
  maxSpanWeeks: number
}

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
  logoUrl: sfsuDefaultLogoUrl,
  fontFamily: SFSU_DEFAULT_FONT_FAMILY,
  borderRadius: 6,
  selectedThemeName: 'SFSU Default',
}

export const DEFAULT_RESERVATION_LIMITS: ReservationLimits = {
  maxOccurrences: HARD_MAX_RESERVATION_OCCURRENCES,
  maxSpanWeeks: HARD_MAX_RESERVATION_SPAN_WEEKS,
}

interface AppSettingsLimitFields {
  sfsures_maxreservationoccurrences?: number | null
  sfsures_maxreservationspanweeks?: number | null
}

const BASE_SETTINGS_SELECT = [
  'sfsures_primarycolor',
  'sfsures_accentcolor',
  'sfsures_backgroundcolor',
  'sfsures_logo',
  'sfsures_fontfamily',
  'sfsures_borderradiuspx',
  'sfsures_selectedthemename',
  'sfsures_isactive',
]

const LIMIT_SETTINGS_SELECT = [
  'sfsures_maxreservationoccurrences',
  'sfsures_maxreservationspanweeks',
]

function themeText(value: string | undefined | null, fallback: string): string {
  return value?.trim() || fallback
}

function restrictedWholeNumber(
  value: number | undefined | null,
  fallback: number,
  hardMax: number
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.min(Math.max(Math.floor(value), 1), hardMax)
}

interface ThemeContextValue {
  theme: AppTheme
  reservationLimits: ReservationLimits
  loading: boolean
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: SFSU_DEFAULTS,
  reservationLimits: DEFAULT_RESERVATION_LIMITS,
  loading: true,
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<AppTheme>(SFSU_DEFAULTS)
  const [reservationLimits, setReservationLimits] = useState<ReservationLimits>(
    DEFAULT_RESERVATION_LIMITS
  )
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        let result

        try {
          result = await Sfsures_appsettingsesService.getAll({
            select: [...BASE_SETTINGS_SELECT, ...LIMIT_SETTINGS_SELECT],
            filter: 'sfsures_isactive eq true',
            top: 1,
          })
        } catch (err) {
          console.warn(
            'App Settings limit columns could not be loaded — retrying with theme columns only:',
            err
          )
          result = await Sfsures_appsettingsesService.getAll({
            select: BASE_SETTINGS_SELECT,
            filter: 'sfsures_isactive eq true',
            top: 1,
          })
        }

        const row = result.data?.[0]
        if (row) {
          const limitRow = row as typeof row & AppSettingsLimitFields

          setTheme({
            primaryColor: themeText(row.sfsures_primarycolor, SFSU_DEFAULTS.primaryColor),
            accentColor: themeText(row.sfsures_accentcolor, SFSU_DEFAULTS.accentColor),
            backgroundColor: themeText(row.sfsures_backgroundcolor, SFSU_DEFAULTS.backgroundColor),
            logoUrl: themeText(row.sfsures_logo, SFSU_DEFAULTS.logoUrl),
            fontFamily: themeText(row.sfsures_fontfamily, SFSU_DEFAULTS.fontFamily),
            borderRadius: row.sfsures_borderradiuspx ?? SFSU_DEFAULTS.borderRadius,
            selectedThemeName: themeText(
              row.sfsures_selectedthemename,
              SFSU_DEFAULTS.selectedThemeName
            ),
          })

          setReservationLimits({
            maxOccurrences: restrictedWholeNumber(
              limitRow.sfsures_maxreservationoccurrences,
              DEFAULT_RESERVATION_LIMITS.maxOccurrences,
              HARD_MAX_RESERVATION_OCCURRENCES
            ),
            maxSpanWeeks: restrictedWholeNumber(
              limitRow.sfsures_maxreservationspanweeks,
              DEFAULT_RESERVATION_LIMITS.maxSpanWeeks,
              HARD_MAX_RESERVATION_SPAN_WEEKS
            ),
          })
        }
        // If no active row: stay on defaults — a fresh instance still renders correctly.
      } catch (err) {
        // Network or permission error: stay on defaults.
        console.warn('App Settings load failed — using SFSU defaults:', err)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, reservationLimits, loading }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}
