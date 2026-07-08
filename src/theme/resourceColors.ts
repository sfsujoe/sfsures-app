import type { Sfsures_resourcessfsures_calendarcolor } from '../generated/models/Sfsures_resourcesModel'

export interface ResourceColorOption {
  value: Sfsures_resourcessfsures_calendarcolor
  label: string
  backgroundColor: string
  textColor: '#000000' | '#FFFFFF'
}

const MIN_NORMAL_TEXT_CONTRAST = 4.5

function relativeLuminance(hexColor: string): number {
  const hex = hexColor.replace('#', '')
  const channels = [0, 2, 4].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
  const [r, g, b] = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  )

  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLum = relativeLuminance(foreground)
  const backgroundLum = relativeLuminance(background)
  const lighter = Math.max(foregroundLum, backgroundLum)
  const darker = Math.min(foregroundLum, backgroundLum)

  return (lighter + 0.05) / (darker + 0.05)
}

export function accessibleTextColorFor(backgroundColor: string): '#000000' | '#FFFFFF' {
  const whiteContrast = contrastRatio('#FFFFFF', backgroundColor)
  const blackContrast = contrastRatio('#000000', backgroundColor)

  if (blackContrast >= whiteContrast && blackContrast >= MIN_NORMAL_TEXT_CONTRAST) {
    return '#000000'
  }

  return '#FFFFFF'
}

function option(
  value: Sfsures_resourcessfsures_calendarcolor,
  label: string,
  backgroundColor: string
): ResourceColorOption {
  return {
    value,
    label,
    backgroundColor,
    textColor: accessibleTextColorFor(backgroundColor),
  }
}

export const RESOURCE_COLOR_OPTIONS: ResourceColorOption[] = [
  option(997330000, 'Core Purple', '#442C8B'),
  option(997330001, 'Purple #2', '#665AA7'),
  option(997330002, 'Purple #3', '#B1A5D0'),
  option(997330003, 'Core Gold', '#DCAE27'),
  option(997330004, 'Gold #2', '#FFD24F'),
  option(997330005, 'Gold #3', '#FFEC82'),
  option(997330006, 'Ocean', '#044361'),
  option(997330007, 'Forest', '#005755'),
  option(997330008, 'Sunset', '#EB8923'),
  option(997330009, 'Rock', '#6E5D53'),
  option(997330010, 'Sky', '#70B3D7'),
  option(997330011, 'Eucalyptus', '#79C9AE'),
  option(997330012, 'Stucco', '#FAC4CB'),
  option(997330013, 'Sunlight', '#FFE2B4'),
  option(997330014, 'Fog', '#F6F0D6'),
  option(997330015, 'Black', '#000000'),
]

export function resourceColorByValue(
  value: Sfsures_resourcessfsures_calendarcolor | undefined | null
): ResourceColorOption | null {
  if (typeof value !== 'number') {
    return null
  }

  return RESOURCE_COLOR_OPTIONS.find((color) => color.value === value) ?? null
}

export function resourceColorForBackground(backgroundColor: string): ResourceColorOption {
  return {
    value: 997330000,
    label: 'Custom',
    backgroundColor,
    textColor: accessibleTextColorFor(backgroundColor),
  }
}
