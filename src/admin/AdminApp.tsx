import { lazy, Suspense, useState, type CSSProperties } from 'react'
import { useCurrentUser } from '../auth/UserContext'
import { useTheme } from '../theme/ThemeContext'
import { AppSettingsScreen } from './AppSettingsScreen'
import styles from './AdminApp.module.css'

const UsersScreen = lazy(() => import('./UsersScreen'))
const GroupsScreen = lazy(() => import('./GroupsScreen'))
const ResourceTypesScreen = lazy(() => import('./ResourceTypesScreen'))
const ResourcesScreen = lazy(() => import('./ResourcesScreen'))
const BlackoutsScreen = lazy(() => import('./BlackoutsScreen'))

interface AdminAppProps {
  onBack: () => void
}

const NAV_ITEMS = [
  { id: 'settings', label: 'Settings', disabled: false },
  { id: 'resourceTypes', label: 'Resource Types', disabled: false },
  { id: 'resources', label: 'Resources', disabled: false },
  { id: 'users', label: 'Users', disabled: false },
  { id: 'groups', label: 'Groups', disabled: false },
  { id: 'blackouts', label: 'Blackouts', disabled: false },
  { id: 'reports', label: 'Reports', disabled: true },
] as const

type AdminSection = (typeof NAV_ITEMS)[number]['id']

const SECTION_TITLES: Record<AdminSection, string> = {
  settings: 'App Settings',
  resourceTypes: 'Resource Types',
  resources: 'Resources',
  users: 'Users',
  groups: 'Groups',
  blackouts: 'Blackouts',
  reports: 'Reports',
}

export default function AdminApp({ onBack }: AdminAppProps) {
  const currentUser = useCurrentUser()
  const { theme } = useTheme()
  const [activeSection, setActiveSection] = useState<AdminSection>('settings')

  const adminVars = {
    '--admin-primary': theme.primaryColor,
    '--admin-accent': theme.accentColor,
    '--admin-date-header': theme.dateHeaderColor,
  } as CSSProperties

  if (currentUser?.isAppAdmin !== true) {
    return (
      <div className={styles.denied} style={adminVars}>
        <div className={styles.deniedPanel}>
          <p className={styles.eyebrow}>Admin</p>
          <h1>Access unavailable</h1>
          <button type="button" className={styles.primaryButton} onClick={onBack}>
            Calendar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.adminShell} style={adminVars}>
      <aside className={styles.rail}>
        <button type="button" className={styles.backButton} onClick={onBack}>
          Calendar
        </button>

        <nav className={styles.nav} aria-label="Admin sections">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={
                activeSection === item.id
                  ? `${styles.navButton} ${styles.navButtonActive}`
                  : styles.navButton
              }
              aria-current={activeSection === item.id ? 'page' : undefined}
              aria-disabled={item.disabled}
              disabled={item.disabled}
              onClick={() => {
                if (!item.disabled) {
                  setActiveSection(item.id)
                }
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className={styles.workspace}>
        <header className={styles.workspaceHeader}>
          <div>
            <p className={styles.eyebrow}>Admin</p>
            <h1>{SECTION_TITLES[activeSection]}</h1>
          </div>
          <p className={styles.signedIn}>{currentUser.displayName}</p>
        </header>

        {activeSection === 'settings' && <AppSettingsScreen />}
        {activeSection === 'users' && (
          <Suspense
            fallback={
              <section className={styles.settingsPanel} aria-busy="true">
                <div className={styles.inlineLoading} role="status">
                  Loading users...
                </div>
              </section>
            }
          >
            <UsersScreen />
          </Suspense>
        )}
        {activeSection === 'resourceTypes' && (
          <Suspense
            fallback={
              <section className={styles.settingsPanel} aria-busy="true">
                <div className={styles.inlineLoading} role="status">
                  Loading resource types...
                </div>
              </section>
            }
          >
            <ResourceTypesScreen />
          </Suspense>
        )}
        {activeSection === 'resources' && (
          <Suspense
            fallback={
              <section className={styles.settingsPanel} aria-busy="true">
                <div className={styles.inlineLoading} role="status">
                  Loading resources...
                </div>
              </section>
            }
          >
            <ResourcesScreen />
          </Suspense>
        )}
        {activeSection === 'groups' && (
          <Suspense
            fallback={
              <section className={styles.settingsPanel} aria-busy="true">
                <div className={styles.inlineLoading} role="status">
                  Loading groups...
                </div>
              </section>
            }
          >
            <GroupsScreen />
          </Suspense>
        )}
        {activeSection === 'blackouts' && (
          <Suspense
            fallback={
              <section className={styles.settingsPanel} aria-busy="true">
                <div className={styles.inlineLoading} role="status">
                  Loading blackouts...
                </div>
              </section>
            }
          >
            <BlackoutsScreen />
          </Suspense>
        )}
      </main>
    </div>
  )
}
