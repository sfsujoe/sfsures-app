import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Sfsures_appsettingsesService } from '../generated/services/Sfsures_appsettingsesService'
import { ThemeContext } from './ThemeContext'
import { APP_SETTINGS_LOGO_COLUMN, imageColumnValueAsDataUrl } from './appSettingsLogo'
import {
  DEFAULT_RESERVATION_LIMITS,
  HARD_MAX_RESERVATION_OCCURRENCES,
  HARD_MAX_RESERVATION_SPAN_WEEKS,
  SFSU_DEFAULT_APP_NAME,
  SFSU_DEFAULT_FONT_FAMILY,
  SFSU_DEFAULT_THEME,
  themePresetByName,
  type AppTheme,
  type ReservationLimits,
} from './themeConfig'

interface AppSettingsLimitFields {
  sfsures_applogo?: string | null
  sfsures_maxreservationoccurrences?: number | null
  sfsures_maxreservationspanweeks?: number | null
}

const BASE_SETTINGS_SELECT = [
  'sfsures_name',
  'sfsures_primarycolor',
  'sfsures_accentcolor',
  'sfsures_backgroundcolor',
  'sfsures_fontfamily',
  'sfsures_selectedthemename',
  'sfsures_isactive',
]

const LEGACY_SETTINGS_ROW_NAME = 'SFSU Reservation Settings'

const LIMIT_SETTINGS_SELECT = [
  'sfsures_maxreservationoccurrences',
  'sfsures_maxreservationspanweeks',
]

const OPTIONAL_SETTINGS_SELECT = [APP_SETTINGS_LOGO_COLUMN, ...LIMIT_SETTINGS_SELECT]

function appNameFromSettings(value: string | undefined | null): string {
  const trimmed = value?.trim()
  if (!trimmed || trimmed === LEGACY_SETTINGS_ROW_NAME) {
    return SFSU_DEFAULT_APP_NAME
  }

  return trimmed
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

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<AppTheme>(SFSU_DEFAULT_THEME)
  const [reservationLimits, setReservationLimits] = useState<ReservationLimits>(
    DEFAULT_RESERVATION_LIMITS
  )
  const [loading, setLoading] = useState(true)

  const loadSettings = useCallback(async () => {
    try {
      let result

      try {
        result = await Sfsures_appsettingsesService.getAll({
          select: [...BASE_SETTINGS_SELECT, ...OPTIONAL_SETTINGS_SELECT],
          filter: 'sfsures_isactive eq true',
          top: 1,
        })
      } catch (err) {
        console.warn(
          'Optional App Settings columns could not be loaded — retrying with base columns only:',
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
      const uploadedLogoUrl = imageColumnValueAsDataUrl(limitRow.sfsures_applogo)

      setTheme({
        appName: appNameFromSettings(row.sfsures_name),
        primaryColor: selectedPreset.primaryColor,
        accentColor: selectedPreset.accentColor,
        backgroundColor: selectedPreset.backgroundColor,
        dateHeaderColor: selectedPreset.dateHeaderColor,
        logoUrl: uploadedLogoUrl ?? SFSU_DEFAULT_THEME.logoUrl,
        fontFamily: SFSU_DEFAULT_FONT_FAMILY,
        borderRadius: selectedPreset.borderRadius,
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

  const reloadSettings = useCallback(async () => {
    setLoading(true)
    await loadSettings()
  }, [loadSettings])

  useEffect(() => {
    queueMicrotask(() => void loadSettings())
  }, [loadSettings])

  return (
    <ThemeContext.Provider
      value={{ theme, reservationLimits, loading, reloadSettings }}
    >
      {children}
    </ThemeContext.Provider>
  )
}
