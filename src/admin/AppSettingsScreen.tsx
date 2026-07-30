import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { Sfsures_appsettingsesService } from '../generated/services/Sfsures_appsettingsesService'
import type { Sfsures_appsettingses } from '../generated/models/Sfsures_appsettingsesModel'
import {
  APP_SETTINGS_LOGO_COLUMN,
  imageColumnValueAsDataUrl,
} from '../theme/appSettingsLogo'
import {
  DEFAULT_RESERVATION_LIMITS,
  HARD_MAX_RESERVATION_OCCURRENCES,
  HARD_MAX_RESERVATION_SPAN_WEEKS,
  SFSU_DEFAULT_APP_NAME,
  SFSU_DEFAULT_FONT_FAMILY,
  SFSU_DEFAULT_THEME,
  SFSU_THEME_PRESETS,
  themePresetByName,
} from '../theme/themeConfig'
import { useTheme } from '../theme/ThemeContext'
import styles from './AdminApp.module.css'

const ResourcePhotoCropper = lazy(() => import('./ResourcePhotoCropper'))

interface SettingsForm {
  appName: string
  selectedThemeName: string
  maxOccurrences: string
  maxSpanWeeks: string
}

interface ParsedSettings {
  appName: string
  maxOccurrences: number
  maxSpanWeeks: number
}

interface PendingLogo {
  file: File
  byteSize: number
  previewUrl: string
}

interface LogoCropSource {
  dataUrl: string
}

interface AppSettingsLogoFields {
  sfsures_applogo?: string | null
}

const SETTINGS_SELECT = [
  'sfsures_appsettingsid',
  'sfsures_name',
  'sfsures_selectedthemename',
  'sfsures_isactive',
  'sfsures_maxreservationoccurrences',
  'sfsures_maxreservationspanweeks',
]

const LEGACY_SETTINGS_ROW_NAME = 'SFSU Reservation Settings'
const MAX_APP_NAME_LENGTH = 80
const LOGO_ACCEPT = '.jpg,.jpeg,.png,.gif,.bmp,image/jpeg,image/png,image/gif,image/bmp'
const LOGO_MAX_BYTES = 10 * 1024 * 1024
const SUPPORTED_LOGO_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/bmp'])

const DEFAULT_FORM: SettingsForm = {
  appName: SFSU_DEFAULT_APP_NAME,
  selectedThemeName: SFSU_DEFAULT_THEME.selectedThemeName,
  maxOccurrences: String(DEFAULT_RESERVATION_LIMITS.maxOccurrences),
  maxSpanWeeks: String(DEFAULT_RESERVATION_LIMITS.maxSpanWeeks),
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

function formatBytes(bytes: number): string {
  const megabytes = bytes / (1024 * 1024)
  return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`
}

function isSupportedLogo(file: File): boolean {
  if (SUPPORTED_LOGO_TYPES.has(file.type)) {
    return true
  }

  return /\.(jpe?g|png|gif|bmp)$/i.test(file.name)
}

function readImageAsDataUrl(image: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }

      reject(new Error('The selected image could not be prepared.'))
    }
    reader.onerror = () => reject(new Error('The selected image could not be read.'))
    reader.onabort = () => reject(new Error('Reading the selected image was canceled.'))
    reader.readAsDataURL(image)
  })
}

function appNameFromRow(value: string | undefined | null): string {
  const trimmed = value?.trim()
  if (!trimmed || trimmed === LEGACY_SETTINGS_ROW_NAME) {
    return SFSU_DEFAULT_APP_NAME
  }

  return trimmed
}

function formFromRow(row: Sfsures_appsettingses | undefined): SettingsForm {
  if (!row) {
    return DEFAULT_FORM
  }

  const selectedPreset = themePresetByName(row.sfsures_selectedthemename)

  return {
    appName: appNameFromRow(row.sfsures_name),
    selectedThemeName: selectedPreset.name,
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

function logoUrlFromRow(row: Sfsures_appsettingses | undefined, fallback: string): string {
  if (!row) {
    return fallback
  }

  const rowWithLogo = row as Sfsures_appsettingses & AppSettingsLogoFields
  return imageColumnValueAsDataUrl(rowWithLogo.sfsures_applogo) ?? fallback
}

function validateForm(form: SettingsForm): { error: string } | { values: ParsedSettings } {
  const appName = form.appName.trim()
  if (!appName) {
    return { error: 'App Name is required.' }
  }

  if (appName.length > MAX_APP_NAME_LENGTH) {
    return { error: `App Name must be ${MAX_APP_NAME_LENGTH} characters or fewer.` }
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
      appName,
      maxOccurrences,
      maxSpanWeeks,
    },
  }
}

export function AppSettingsScreen() {
  const { reloadSettings } = useTheme()
  const [rowId, setRowId] = useState<string | null>(null)
  const [form, setForm] = useState<SettingsForm>(DEFAULT_FORM)
  const [currentLogoUrl, setCurrentLogoUrl] = useState(SFSU_DEFAULT_THEME.logoUrl)
  const [pendingLogo, setPendingLogo] = useState<PendingLogo | null>(null)
  const [logoCropSource, setLogoCropSource] = useState<LogoCropSource | null>(null)
  const [logoResetRequested, setLogoResetRequested] = useState(false)
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const logoInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadSettingsRow() {
      setLoadStatus('loading')
      setError('')

      try {
        let result

        try {
          result = await Sfsures_appsettingsesService.getAll({
            select: [...SETTINGS_SELECT, APP_SETTINGS_LOGO_COLUMN],
            filter: 'sfsures_isactive eq true',
            top: 1,
          })
        } catch (imageErr) {
          console.warn(
            'App Settings logo image column could not be loaded; using base settings:',
            imageErr
          )
          result = await Sfsures_appsettingsesService.getAll({
            select: SETTINGS_SELECT,
            filter: 'sfsures_isactive eq true',
            top: 1,
          })
        }

        const row = result.data?.[0]

        if (!cancelled) {
          setRowId(row?.sfsures_appsettingsid ?? null)
          setForm(formFromRow(row))
          setCurrentLogoUrl(logoUrlFromRow(row, SFSU_DEFAULT_THEME.logoUrl))
          setPendingLogo(null)
          setLogoCropSource(null)
          setLogoResetRequested(false)
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
    }))
    setStatus('')
  }

  function selectTheme(themeName: string) {
    const preset = themePresetByName(themeName)
    setForm((current) => ({
      ...current,
      selectedThemeName: preset.name,
    }))
    setStatus('')
    setError('')
  }

  function resetDefault() {
    setForm(DEFAULT_FORM)
    setCurrentLogoUrl(SFSU_DEFAULT_THEME.logoUrl)
    setPendingLogo(null)
    setLogoCropSource(null)
    setLogoResetRequested(true)
    if (logoInputRef.current) {
      logoInputRef.current.value = ''
    }
    setStatus('')
    setError('')
  }

  function handleLogoButtonClick() {
    logoInputRef.current?.click()
  }

  async function handleLogoFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return

    if (!isSupportedLogo(file)) {
      setError('Upload a JPG, PNG, GIF, or BMP image.')
      return
    }

    if (file.size > LOGO_MAX_BYTES) {
      setError(`Logo is too large. The maximum size is ${formatBytes(LOGO_MAX_BYTES)}.`)
      return
    }

    setError('')

    try {
      setLogoCropSource({ dataUrl: await readImageAsDataUrl(file) })
    } catch (err) {
      setLogoCropSource(null)
      setError(err instanceof Error ? err.message : 'The selected image could not be read.')
    }
  }

  function handleCroppedLogo(logo: PendingLogo) {
    setPendingLogo(logo)
    setCurrentLogoUrl(logo.previewUrl)
    setLogoCropSource(null)
    setLogoResetRequested(false)
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
    const selectedPreset = themePresetByName(form.selectedThemeName)
    const payload = {
      sfsures_name: values.appName,
      sfsures_primarycolor: selectedPreset.primaryColor,
      sfsures_accentcolor: selectedPreset.accentColor,
      sfsures_backgroundcolor: selectedPreset.backgroundColor,
      sfsures_fontfamily: SFSU_DEFAULT_FONT_FAMILY,
      sfsures_isactive: true,
      sfsures_selectedthemename: selectedPreset.name,
      sfsures_maxreservationoccurrences: values.maxOccurrences,
      sfsures_maxreservationspanweeks: values.maxSpanWeeks,
    }

    setSaving(true)

    try {
      let activeRowId = rowId

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

        activeRowId = result.data?.sfsures_appsettingsid ?? null
        setRowId(activeRowId)
      }

      let logoUploaded = true
      if (activeRowId && pendingLogo) {
        try {
          await Sfsures_appsettingsesService.upload(
            activeRowId,
            APP_SETTINGS_LOGO_COLUMN,
            pendingLogo.file,
            pendingLogo.file.name
          )
          setPendingLogo(null)
        } catch (logoErr) {
          logoUploaded = false
          console.error('Upload app logo failed:', logoErr)
        }
      } else if (activeRowId && logoResetRequested) {
        try {
          await Sfsures_appsettingsesService.deleteFileOrImage(
            activeRowId,
            APP_SETTINGS_LOGO_COLUMN
          )
          setLogoResetRequested(false)
        } catch (logoErr) {
          logoUploaded = false
          console.error('Reset app logo failed:', logoErr)
        }
      }

      await reloadSettings()
      setStatus(
        logoUploaded
          ? 'Settings saved.'
          : 'Settings saved, but the logo could not be updated. Confirm the App Logo image column exists and try again.'
      )
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

            <div className={styles.themeGrid} aria-label="Theme presets">
              {SFSU_THEME_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  className={
                    form.selectedThemeName === preset.name
                      ? `${styles.themeButton} ${styles.themeButtonActive}`
                      : styles.themeButton
                  }
                  aria-pressed={form.selectedThemeName === preset.name}
                  onClick={() => selectTheme(preset.name)}
                >
                  <span
                    className={styles.themePreview}
                    style={{ backgroundColor: preset.primaryColor }}
                    aria-hidden="true"
                  >
                    <span style={{ backgroundColor: preset.dateHeaderColor }} />
                    <span style={{ backgroundColor: preset.accentColor }} />
                  </span>
                  <span className={styles.themeName}>{preset.name}</span>
                </button>
              ))}
            </div>

          </section>

          <section className={styles.formSection} aria-labelledby="settings-branding-heading">
            <div className={styles.sectionHeader}>
              <h3 id="settings-branding-heading">Branding</h3>
            </div>

            <div className={styles.fieldGrid}>
              <label className={styles.fieldWide}>
                <span>App Name</span>
                <input
                  className={styles.input}
                  type="text"
                  maxLength={MAX_APP_NAME_LENGTH}
                  value={form.appName}
                  onChange={(event) => updateField('appName', event.target.value)}
                />
              </label>
              <div className={styles.fieldWide}>
                <span>App Logo</span>
                <div className={styles.appLogoEditor}>
                  <img
                    className={styles.appLogoPreview}
                    src={currentLogoUrl}
                    alt="Current app logo"
                    onError={() => {
                      if (currentLogoUrl !== SFSU_DEFAULT_THEME.logoUrl) {
                        setCurrentLogoUrl(SFSU_DEFAULT_THEME.logoUrl)
                      }
                    }}
                  />

                  <div className={styles.appLogoActions}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={handleLogoButtonClick}
                    >
                      Upload New Logo
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => {
                        setCurrentLogoUrl(SFSU_DEFAULT_THEME.logoUrl)
                        setPendingLogo(null)
                        setLogoCropSource(null)
                        setLogoResetRequested(true)
                        setStatus('')
                      }}
                    >
                      Use Default Logo
                    </button>
                    <p className={styles.fieldHint}>
                      JPG, PNG, GIF, or BMP. Max {formatBytes(LOGO_MAX_BYTES)}.
                    </p>
                  </div>

                  <input
                    ref={logoInputRef}
                    type="file"
                    accept={LOGO_ACCEPT}
                    className={styles.srOnly}
                    onChange={handleLogoFileChange}
                  />
                </div>

                {pendingLogo && (
                  <p className={styles.fieldHint}>
                    Cropped logo ready ({formatBytes(pendingLogo.byteSize)}). It will upload when
                    you save settings.
                  </p>
                )}

                {logoCropSource && (
                  <Suspense
                    fallback={
                      <div className={styles.inlineLoading} role="status">
                        Loading cropper...
                      </div>
                    }
                  >
                    <ResourcePhotoCropper
                      imageUrl={logoCropSource.dataUrl}
                      mediaAlt="Selected app logo to crop"
                      outputFileName="app-logo.jpg"
                      onCancel={() => setLogoCropSource(null)}
                      onUsePhoto={handleCroppedLogo}
                    />
                  </Suspense>
                )}
              </div>
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
