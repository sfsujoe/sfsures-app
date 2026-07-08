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

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
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
  dateHeaderColor: string // hex with #; used by FullCalendar date header cells
  logoUrl: string
  fontFamily: string
  borderRadius: number    // px
  selectedThemeName: string
}

export interface AppThemePreset {
  name: string
  primaryColor: string
  accentColor: string
  backgroundColor: string
  dateHeaderColor: string
  borderRadius: number
}

export const SFSU_DEFAULT_THEME_PRESET: AppThemePreset = {
  name: 'Core Purple',
  primaryColor: '#442C8B',
  accentColor: '#DCAE27',
  backgroundColor: '#FFFFFF',
  dateHeaderColor: '#FFEC82',
  borderRadius: 6,
}

export const SFSU_THEME_PRESETS: AppThemePreset[] = [
  SFSU_DEFAULT_THEME_PRESET,
  {
    name: 'Purple #2',
    primaryColor: '#665AA7',
    accentColor: '#B1A5D0',
    backgroundColor: '#FFFFFF',
    dateHeaderColor: '#FFEC82',
    borderRadius: 6,
  },
  {
    name: 'Ocean',
    primaryColor: '#044361',
    accentColor: '#70B3D7',
    backgroundColor: '#FFFFFF',
    dateHeaderColor: '#F6F0D6',
    borderRadius: 6,
  },
  {
    name: 'Forest',
    primaryColor: '#005755',
    accentColor: '#79C9AE',
    backgroundColor: '#FFFFFF',
    dateHeaderColor: '#FFE2B4',
    borderRadius: 6,
  },
  {
    name: 'Rock',
    primaryColor: '#6E5D53',
    accentColor: '#CC4D35',
    backgroundColor: '#FFFFFF',
    dateHeaderColor: '#F6F0D6',
    borderRadius: 6,
  },
]

export function themePresetByName(name: string | undefined | null): AppThemePreset {
  const normalizedName = name?.trim().toLowerCase()
  return (
    SFSU_THEME_PRESETS.find((preset) => preset.name.toLowerCase() === normalizedName) ??
    SFSU_DEFAULT_THEME_PRESET
  )
}

export const SFSU_DEFAULT_THEME: AppTheme = {
  primaryColor: SFSU_DEFAULT_THEME_PRESET.primaryColor,
  accentColor: SFSU_DEFAULT_THEME_PRESET.accentColor,
  backgroundColor: SFSU_DEFAULT_THEME_PRESET.backgroundColor,
  dateHeaderColor: SFSU_DEFAULT_THEME_PRESET.dateHeaderColor,
  logoUrl: sfsuDefaultLogoUrl,
  fontFamily: SFSU_DEFAULT_FONT_FAMILY,
  borderRadius: SFSU_DEFAULT_THEME_PRESET.borderRadius,
  selectedThemeName: SFSU_DEFAULT_THEME_PRESET.name,
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
  reloadSettings: () => Promise<void>
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: SFSU_DEFAULT_THEME,
  reservationLimits: DEFAULT_RESERVATION_LIMITS,
  loading: true,
  reloadSettings: async () => undefined,
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<AppTheme>(SFSU_DEFAULT_THEME)
  const [reservationLimits, setReservationLimits] = useState<ReservationLimits>(
    DEFAULT_RESERVATION_LIMITS
  )
  const [loading, setLoading] = useState(true)

  const loadSettings = useCallback(async () => {
    setLoading(true)

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
      if (!row) {
        setTheme(SFSU_DEFAULT_THEME)
        setReservationLimits(DEFAULT_RESERVATION_LIMITS)
        return
      }

      const limitRow = row as typeof row & AppSettingsLimitFields

      const selectedPreset = themePresetByName(row.sfsures_selectedthemename)

      setTheme({
        primaryColor: selectedPreset.primaryColor,
        accentColor: selectedPreset.accentColor,
        backgroundColor: selectedPreset.backgroundColor,
        dateHeaderColor: selectedPreset.dateHeaderColor,
        logoUrl: themeText(row.sfsures_logo, SFSU_DEFAULT_THEME.logoUrl),
        fontFamily: SFSU_DEFAULT_FONT_FAMILY,
        borderRadius: row.sfsures_borderradiuspx ?? selectedPreset.borderRadius,
        selectedThemeName: selectedPreset.name,
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
    } catch (err) {
      console.warn('App Settings load failed — using SFSU defaults:', err)
      setTheme(SFSU_DEFAULT_THEME)
      setReservationLimits(DEFAULT_RESERVATION_LIMITS)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  return (
    <ThemeContext.Provider
      value={{ theme, reservationLimits, loading, reloadSettings: loadSettings }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}
