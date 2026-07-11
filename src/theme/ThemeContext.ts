import { createContext, useContext } from 'react'
import {
  DEFAULT_RESERVATION_LIMITS,
  SFSU_DEFAULT_THEME,
  type AppTheme,
  type ReservationLimits,
} from './themeConfig'

export interface ThemeContextValue {
  theme: AppTheme
  reservationLimits: ReservationLimits
  loading: boolean
  reloadSettings: () => Promise<void>
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: SFSU_DEFAULT_THEME,
  reservationLimits: DEFAULT_RESERVATION_LIMITS,
  loading: true,
  reloadSettings: async () => undefined,
})

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}
