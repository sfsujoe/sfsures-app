import { useEffect, useState, type FormEvent } from 'react'
import { Sfsures_appsettingsesService } from '../generated/services/Sfsures_appsettingsesService'
import type { Sfsures_appsettingses } from '../generated/models/Sfsures_appsettingsesModel'
import {
  DEFAULT_RESERVATION_LIMITS,
  HARD_MAX_RESERVATION_OCCURRENCES,
  HARD_MAX_RESERVATION_SPAN_WEEKS,
  SFSU_DEFAULT_FONT_FAMILY,
  SFSU_DEFAULT_THEME,
  useTheme,
} from '../theme/ThemeContext'
import styles from './AdminApp.module.css'

interface SettingsForm {
  name: string
  selectedThemeName: string
  primaryColor: string
  accentColor: string
  backgroundColor: string
  logoUrl: string
  fontFamily: string
  borderRadius: string
  maxOccurrences: string
  maxSpanWeeks: string
}

interface ThemePreset {
  name: string
  primaryColor: string
  accentColor: string
  backgroundColor: string
  logoUrl: string
  fontFamily: string
  borderRadius: number
}

interface ParsedSettings {
  primaryColor: string
  accentColor: string
  backgroundColor: string
  logoUrl: string | null
  fontFamily: string
  borderRadius: number
  maxOccurrences: number
  maxSpanWeeks: number
}

const SETTINGS_SELECT = [
  'sfsures_appsettingsid',
  'sfsures_name',
  'sfsures_primarycolor',
  'sfsures_accentcolor',
  'sfsures_backgroundcolor',
  'sfsures_logo',
  'sfsures_fontfamily',
  'sfsures_borderradiuspx',
  'sfsures_selectedthemename',
  'sfsures_isactive',
  'sfsures_maxreservationoccurrences',
  'sfsures_maxreservationspanweeks',
]

const THEME_PRESETS: ThemePreset[] = [
  {
    name: SFSU_DEFAULT_THEME.selectedThemeName,
    primaryColor: SFSU_DEFAULT_THEME.primaryColor,
    accentColor: SFSU_DEFAULT_THEME.accentColor,
    backgroundColor: SFSU_DEFAULT_THEME.backgroundColor,
    logoUrl: '',
    fontFamily: SFSU_DEFAULT_FONT_FAMILY,
    borderRadius: SFSU_DEFAULT_THEME.borderRadius,
  },
]

const DEFAULT_FORM: SettingsForm = {
  name: 'SFSU Reservation Settings',
  selectedThemeName: SFSU_DEFAULT_THEME.selectedThemeName,
  primaryColor: SFSU_DEFAULT_THEME.primaryColor,
  accentColor: SFSU_DEFAULT_THEME.accentColor,
  backgroundColor: SFSU_DEFAULT_THEME.backgroundColor,
  logoUrl: '',
  fontFamily: SFSU_DEFAULT_FONT_FAMILY,
  borderRadius: String(SFSU_DEFAULT_THEME.borderRadius),
  maxOccurrences: String(DEFAULT_RESERVATION_LIMITS.maxOccurrences),
  maxSpanWeeks: String(DEFAULT_RESERVATION_LIMITS.maxSpanWeeks),
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/
const THEME_FIELD_KEYS = new Set<keyof SettingsForm>([
  'primaryColor',
  'accentColor',
  'backgroundColor',
  'logoUrl',
  'fontFamily',
  'borderRadius',
])

function normalizeHex(value: string): string {
  return value.trim().toUpperCase()
}

function wholeNumberFromInput(value: string): number | null {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) {
    return null
  }

  return parsed
}

function limitedNumber(value: number | undefined | null, fallback: number, hardMax: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.min(Math.max(Math.floor(value), 1), hardMax)
}

function formFromRow(row: Sfsures_appsettingses | undefined): SettingsForm {
  if (!row) {
    return DEFAULT_FORM
  }

  return {
    name: row.sfsures_name?.trim() || DEFAULT_FORM.name,
    selectedThemeName:
      row.sfsures_selectedthemename?.trim() || SFSU_DEFAULT_THEME.selectedThemeName,
    primaryColor: normalizeHex(row.sfsures_primarycolor || SFSU_DEFAULT_THEME.primaryColor),
    accentColor: normalizeHex(row.sfsures_accentcolor || SFSU_DEFAULT_THEME.accentColor),
    backgroundColor: normalizeHex(
      row.sfsures_backgroundcolor || SFSU_DEFAULT_THEME.backgroundColor
    ),
    logoUrl: row.sfsures_logo?.trim() || '',
    fontFamily: row.sfsures_fontfamily?.trim() || SFSU_DEFAULT_FONT_FAMILY,
    borderRadius: String(row.sfsures_borderradiuspx ?? SFSU_DEFAULT_THEME.borderRadius),
    maxOccurrences: String(
      limitedNumber(
        row.sfsures_maxreservationoccurrences,
        DEFAULT_RESERVATION_LIMITS.maxOccurrences,
        HARD_MAX_RESERVATION_OCCURRENCES
      )
    ),
    maxSpanWeeks: String(
      limitedNumber(
        row.sfsures_maxreservationspanweeks,
        DEFAULT_RESERVATION_LIMITS.maxSpanWeeks,
        HARD_MAX_RESERVATION_SPAN_WEEKS
      )
    ),
  }
}

function validateForm(form: SettingsForm): { error: string } | { values: ParsedSettings } {
  const primaryColor = normalizeHex(form.primaryColor)
  const accentColor = normalizeHex(form.accentColor)
  const backgroundColor = normalizeHex(form.backgroundColor)

  if (!HEX_COLOR_RE.test(primaryColor)) {
    return { error: 'Primary color must be a 6-digit hex value with #.' }
  }

  if (!HEX_COLOR_RE.test(accentColor)) {
    return { error: 'Accent color must be a 6-digit hex value with #.' }
  }

  if (!HEX_COLOR_RE.test(backgroundColor)) {
    return { error: 'Background color must be a 6-digit hex value with #.' }
  }

  const logoUrl = form.logoUrl.trim()
  if (logoUrl && !/^https:\/\//i.test(logoUrl)) {
    return { error: 'Logo URL must start with https://.' }
  }

  const borderRadius = wholeNumberFromInput(form.borderRadius)
  if (borderRadius === null || borderRadius < 0 || borderRadius > 24) {
    return { error: 'Border radius must be a whole number from 0 to 24.' }
  }

  const maxOccurrences = wholeNumberFromInput(form.maxOccurrences)
  if (
    maxOccurrences === null ||
    maxOccurrences < 1 ||
    maxOccurrences > HARD_MAX_RESERVATION_OCCURRENCES
  ) {
    return {
      error: `Max reservation occurrences must be 1-${HARD_MAX_RESERVATION_OCCURRENCES}.`,
    }
  }

  const maxSpanWeeks = wholeNumberFromInput(form.maxSpanWeeks)
  if (
    maxSpanWeeks === null ||
    maxSpanWeeks < 1 ||
    maxSpanWeeks > HARD_MAX_RESERVATION_SPAN_WEEKS
  ) {
    return {
      error: `Max reservation span weeks must be 1-${HARD_MAX_RESERVATION_SPAN_WEEKS}.`,
    }
  }

  return {
    values: {
      primaryColor,
      accentColor,
      backgroundColor,
      logoUrl: logoUrl || null,
      fontFamily: form.fontFamily.trim() || SFSU_DEFAULT_FONT_FAMILY,
      borderRadius,
      maxOccurrences,
      maxSpanWeeks,
    },
  }
}

function ColorField({
  field,
  label,
  value,
  onChange,
}: {
  field: keyof Pick<SettingsForm, 'primaryColor' | 'accentColor' | 'backgroundColor'>
  label: string
  value: string
  onChange: (field: keyof SettingsForm, value: string) => void
}) {
  const colorValue = HEX_COLOR_RE.test(value) ? value : SFSU_DEFAULT_THEME.primaryColor

  return (
    <label className={styles.field}>
      <span>{label}</span>
      <span className={styles.colorControl}>
        <input
          type="color"
          className={styles.colorPicker}
          value={colorValue}
          aria-label={`${label} picker`}
          onChange={(event) => onChange(field, normalizeHex(event.target.value))}
        />
        <input
          className={styles.input}
          value={value}
          spellCheck={false}
          onChange={(event) => onChange(field, event.target.value)}
        />
      </span>
    </label>
  )
}

export function AppSettingsScreen() {
  const { reloadSettings } = useTheme()
  const [rowId, setRowId] = useState<string | null>(null)
  const [form, setForm] = useState<SettingsForm>(DEFAULT_FORM)
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadSettingsRow() {
      setLoadStatus('loading')
      setError('')

      try {
        const result = await Sfsures_appsettingsesService.getAll({
          select: SETTINGS_SELECT,
          filter: 'sfsures_isactive eq true',
          top: 1,
        })
        const row = result.data?.[0]

        if (!cancelled) {
          setRowId(row?.sfsures_appsettingsid ?? null)
          setForm(formFromRow(row))
          setLoadStatus('ready')
        }
      } catch (err) {
        console.error('App Settings admin load failed:', err)
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'App Settings could not be loaded.')
          setLoadStatus('error')
        }
      }
    }

    void loadSettingsRow()

    return () => {
      cancelled = true
    }
  }, [])

  function updateField(field: keyof SettingsForm, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
      selectedThemeName:
        field === 'selectedThemeName'
          ? value
          : THEME_FIELD_KEYS.has(field)
            ? 'Custom'
            : current.selectedThemeName,
    }))
    setStatus('')
  }

  function applyPreset(preset: ThemePreset) {
    setForm((current) => ({
      ...current,
      selectedThemeName: preset.name,
      primaryColor: preset.primaryColor,
      accentColor: preset.accentColor,
      backgroundColor: preset.backgroundColor,
      logoUrl: preset.logoUrl,
      fontFamily: preset.fontFamily,
      borderRadius: String(preset.borderRadius),
    }))
    setStatus('')
    setError('')
  }

  function resetDefault() {
    setForm(DEFAULT_FORM)
    setStatus('')
    setError('')
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setStatus('')

    const parsed = validateForm(form)
    if ('error' in parsed) {
      setError(parsed.error)
      return
    }

    const values = parsed.values
    const payload = {
      sfsures_name: form.name.trim() || DEFAULT_FORM.name,
      sfsures_primarycolor: values.primaryColor,
      sfsures_accentcolor: values.accentColor,
      sfsures_backgroundcolor: values.backgroundColor,
      sfsures_logo: values.logoUrl,
      sfsures_fontfamily: values.fontFamily,
      sfsures_borderradiuspx: values.borderRadius,
      sfsures_isactive: true,
      sfsures_selectedthemename: form.selectedThemeName.trim() || 'Custom',
      sfsures_maxreservationoccurrences: values.maxOccurrences,
      sfsures_maxreservationspanweeks: values.maxSpanWeeks,
    }

    setSaving(true)

    try {
      if (rowId) {
        await Sfsures_appsettingsesService.update(
          rowId,
          payload as unknown as Parameters<typeof Sfsures_appsettingsesService.update>[1]
        )
      } else {
        const result = await Sfsures_appsettingsesService.create({
          ...payload,
          statecode: 0,
          statuscode: 1,
        } as unknown as Parameters<typeof Sfsures_appsettingsesService.create>[0])

        setRowId(result.data?.sfsures_appsettingsid ?? null)
      }

      await reloadSettings()
      setStatus('Settings saved.')
    } catch (err) {
      console.error('App Settings admin save failed:', err)
      setError(err instanceof Error ? err.message : 'App Settings could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  if (loadStatus === 'loading') {
    return (
      <section className={styles.settingsPanel} aria-busy="true">
        <div className={styles.panelToolbar}>
          <h2>App Settings</h2>
        </div>
        <div className={styles.inlineLoading} role="status">
          Loading settings...
        </div>
      </section>
    )
  }

  return (
    <section className={styles.settingsPanel}>
      <form onSubmit={handleSave}>
        <div className={styles.panelToolbar}>
          <div>
            <h2>App Settings</h2>
            <p className={styles.panelMeta}>{rowId ? 'Active row' : 'New active row'}</p>
          </div>
          <div className={styles.panelActions}>
            <button type="button" className={styles.secondaryButton} onClick={resetDefault}>
              Reset to Default
            </button>
            <button type="submit" className={styles.primaryButton} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        {error && (
          <p className={styles.errorBanner} role="alert">
            {error}
          </p>
        )}

        {status && (
          <p className={styles.statusBanner} role="status">
            {status}
          </p>
        )}

        {loadStatus === 'error' && (
          <button type="button" className={styles.secondaryButton} onClick={resetDefault}>
            Use Defaults
          </button>
        )}

        <div className={styles.formStack}>
          <section className={styles.formSection} aria-labelledby="settings-theme-heading">
            <div className={styles.sectionHeader}>
              <h3 id="settings-theme-heading">Theme</h3>
            </div>

            <div className={styles.presetRow} aria-label="Theme presets">
              {THEME_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  className={
                    form.selectedThemeName === preset.name
                      ? `${styles.presetButton} ${styles.presetButtonActive}`
                      : styles.presetButton
                  }
                  onClick={() => applyPreset(preset)}
                >
                  <span className={styles.presetSwatches} aria-hidden="true">
                    <span style={{ backgroundColor: preset.primaryColor }} />
                    <span style={{ backgroundColor: preset.accentColor }} />
                    <span style={{ backgroundColor: preset.backgroundColor }} />
                  </span>
                  <span>{preset.name}</span>
                </button>
              ))}
            </div>

            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                <span>Settings name</span>
                <input
                  className={styles.input}
                  value={form.name}
                  onChange={(event) => updateField('name', event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>Theme name</span>
                <input
                  className={styles.input}
                  value={form.selectedThemeName}
                  onChange={(event) => updateField('selectedThemeName', event.target.value)}
                />
              </label>
            </div>

            <div className={styles.fieldGrid}>
              <ColorField
                field="primaryColor"
                label="Primary color"
                value={form.primaryColor}
                onChange={updateField}
              />
              <ColorField
                field="accentColor"
                label="Accent color"
                value={form.accentColor}
                onChange={updateField}
              />
              <ColorField
                field="backgroundColor"
                label="Background color"
                value={form.backgroundColor}
                onChange={updateField}
              />
            </div>
          </section>

          <section className={styles.formSection} aria-labelledby="settings-branding-heading">
            <div className={styles.sectionHeader}>
              <h3 id="settings-branding-heading">Branding</h3>
            </div>

            <div className={styles.fieldGrid}>
              <label className={styles.fieldWide}>
                <span>Logo URL</span>
                <input
                  className={styles.input}
                  type="url"
                  placeholder="https://"
                  value={form.logoUrl}
                  onChange={(event) => updateField('logoUrl', event.target.value)}
                />
              </label>
              <label className={styles.fieldWide}>
                <span>Font family</span>
                <input
                  className={styles.input}
                  value={form.fontFamily}
                  onChange={(event) => updateField('fontFamily', event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>Border radius</span>
                <input
                  className={styles.input}
                  type="number"
                  min="0"
                  max="24"
                  step="1"
                  value={form.borderRadius}
                  onChange={(event) => updateField('borderRadius', event.target.value)}
                />
              </label>
            </div>
          </section>

          <section className={styles.formSection} aria-labelledby="settings-limits-heading">
            <div className={styles.sectionHeader}>
              <h3 id="settings-limits-heading">Reservation Limits</h3>
            </div>

            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                <span>Max occurrences</span>
                <span className={styles.numberWithCap}>
                  <input
                    className={styles.input}
                    type="number"
                    min="1"
                    max={HARD_MAX_RESERVATION_OCCURRENCES}
                    step="1"
                    value={form.maxOccurrences}
                    onChange={(event) => updateField('maxOccurrences', event.target.value)}
                  />
                  <span>Hard max {HARD_MAX_RESERVATION_OCCURRENCES}</span>
                </span>
              </label>
              <label className={styles.field}>
                <span>Max span weeks</span>
                <span className={styles.numberWithCap}>
                  <input
                    className={styles.input}
                    type="number"
                    min="1"
                    max={HARD_MAX_RESERVATION_SPAN_WEEKS}
                    step="1"
                    value={form.maxSpanWeeks}
                    onChange={(event) => updateField('maxSpanWeeks', event.target.value)}
                  />
                  <span>Hard max {HARD_MAX_RESERVATION_SPAN_WEEKS}</span>
                </span>
              </label>
            </div>
          </section>
        </div>
      </form>
    </section>
  )
}
