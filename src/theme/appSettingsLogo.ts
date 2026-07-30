export const APP_SETTINGS_LOGO_COLUMN = 'sfsures_applogo'

export function imageColumnValueAsDataUrl(value: unknown): string | null {
  const base64 = typeof value === 'string' ? value.trim() : ''
  if (!base64) return null

  if (/^(data:|blob:|https?:)/i.test(base64)) {
    return base64
  }

  return `data:image/jpeg;base64,${base64}`
}
