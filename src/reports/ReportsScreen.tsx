import { type CSSProperties } from 'react'
import { useCurrentUser } from '../auth/UserContext'
import { useTheme } from '../theme/ThemeContext'
import styles from './ReportsScreen.module.css'

interface ReportsScreenProps {
  onBack: () => void
}

export default function ReportsScreen({ onBack }: ReportsScreenProps) {
  const currentUser = useCurrentUser()
  const { theme } = useTheme()

  const reportsVars = {
    '--reports-primary': theme.primaryColor,
    '--reports-accent': theme.accentColor,
    '--reports-date-header': theme.dateHeaderColor,
  } as CSSProperties

  if (currentUser?.canViewReports !== true) {
    return (
      <div className={styles.denied} style={reportsVars}>
        <div className={styles.deniedPanel}>
          <p className={styles.eyebrow}>Reports</p>
          <h1>Access unavailable</h1>
          <button type="button" className={styles.primaryButton} onClick={onBack}>
            Calendar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.reportsShell} style={reportsVars}>
      <aside className={styles.rail}>
        <button type="button" className={styles.backButton} onClick={onBack}>
          Calendar
        </button>
      </aside>

      <main className={styles.workspace}>
        <header className={styles.workspaceHeader}>
          <div>
            <p className={styles.eyebrow}>Reports</p>
            <h1>Reports</h1>
          </div>
          <p className={styles.signedIn}>{currentUser.displayName}</p>
        </header>

        <section className={styles.placeholderPanel} aria-labelledby="reports-placeholder-title">
          <h2 id="reports-placeholder-title">Reports are not available yet</h2>
        </section>
      </main>
    </div>
  )
}
