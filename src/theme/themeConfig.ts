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
  primaryColor: string
  accentColor: string
  backgroundColor: string
  dateHeaderColor: string
  logoUrl: string
  fontFamily: string
  borderRadius: number
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
