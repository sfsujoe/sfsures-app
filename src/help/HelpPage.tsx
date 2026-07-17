import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useTheme } from '../theme/ThemeContext'
import styles from './HelpPage.module.css'

interface HelpPageProps {
  activeTopicId?: string
}

interface TopicStep {
  title?: string
  text: string
}

interface HelpTopic {
  id: string
  title: string
  summary: string
  keywords: string[]
  steps?: TopicStep[]
  notes?: string[]
}

const TOPICS: HelpTopic[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    summary: 'Use the calendar to view resources, open reservations, and create bookings.',
    keywords: ['calendar', 'home', 'start', 'access'],
    steps: [
      { text: 'Open the app and wait for the calendar to finish loading.' },
      { text: 'Use Month, Week, or Day to change the calendar view.' },
      { text: 'Use Previous, Next, and Today to move through dates.' },
      { text: 'Click a reservation to review details such as time, comments, custom fields, and owner.' },
    ],
    notes: [
      'You only see resources your groups are allowed to view.',
      'If the calendar looks empty, try a different date range before assuming there are no reservations.',
    ],
  },
  {
    id: 'create-reservation',
    title: 'Create a Reservation',
    summary: 'Book a resource from the calendar with the New reservation button or by selecting time.',
    keywords: ['book', 'reserve', 'new reservation', 'resource', 'time'],
    steps: [
      { text: 'Click New reservation, or select a time range on the calendar.' },
      { text: 'Choose the resource you want to reserve.' },
      { text: 'Confirm the start and end time.' },
      { text: 'Complete any required custom fields.' },
      { text: 'Add comments if helpful.' },
      { text: 'Click Reserve.' },
    ],
    notes: [
      'The app checks for conflicts and blackout windows before saving.',
      'If a conflict appears, adjust the time or choose another resource.',
    ],
  },
  {
    id: 'recurring-reservations',
    title: 'Recurring Reservations',
    summary: 'Create daily, weekly, or monthly reservations when a booking repeats.',
    keywords: ['repeat', 'recurring', 'series', 'daily', 'weekly', 'monthly'],
    steps: [
      { text: 'Open New reservation.' },
      { text: 'Choose the resource and first time slot.' },
      { text: 'Select a repeat pattern: Daily, Weekly, or Monthly.' },
      { text: 'Set how often the reservation repeats.' },
      { text: 'Choose when the series ends, either by count or end date.' },
      { text: 'Review the generated reservation count, then click Reserve.' },
    ],
    notes: [
      'Recurring reservations must stay within the app reservation limits.',
      'Each occurrence is checked for conflicts before the series is created.',
    ],
  },
  {
    id: 'custom-fields',
    title: 'Custom Fields',
    summary: 'Some resources ask for extra reservation details such as chartfield or destination.',
    keywords: ['custom fields', 'questions', 'required', 'answers', 'chartfield'],
    steps: [
      { text: 'Open New reservation or Edit reservation.' },
      { text: 'Look for the Custom Fields section.' },
      { text: 'Enter values for any required fields.' },
      { text: 'Click Reserve or Save changes.' },
    ],
    notes: [
      'Custom fields depend on the selected resource.',
      'Saved custom field answers appear in the reservation details popover.',
    ],
  },
  {
    id: 'comments',
    title: 'Comments',
    summary: 'Use comments for brief notes that help explain the booking.',
    keywords: ['comments', 'notes', 'details'],
    steps: [
      { text: 'Open New reservation or Edit reservation.' },
      { text: 'Enter a short note in Comments.' },
      { text: 'Save the reservation.' },
    ],
    notes: [
      'Comments are visible in the reservation details popover.',
      'Avoid private or sensitive information unless your local process allows it.',
    ],
  },
  {
    id: 'view-details',
    title: 'View Reservation Details',
    summary: 'Open a reservation to see details without editing it.',
    keywords: ['details', 'owner', 'resource attributes', 'custom fields', 'popover'],
    steps: [
      { text: 'Click a reservation on the calendar.' },
      { text: 'Review the date, time, comments, Resource Attributes, Custom Fields, and owner details.' },
      { text: 'Click the close button or press Escape when finished.' },
    ],
    notes: [
      'Resource Attributes are facts about the resource, supplied by administrators.',
      'Custom Fields are answers supplied for that reservation.',
    ],
  },
  {
    id: 'edit-reservation',
    title: 'Edit a Reservation',
    summary: 'Change a reservation you own, including time, comments, and custom fields.',
    keywords: ['edit', 'change', 'update', 'save'],
    steps: [
      { text: 'Click your reservation on the calendar.' },
      { text: 'Click Edit reservation.' },
      { text: 'Update the time, comments, or custom field answers.' },
      { text: 'Click Save changes.' },
    ],
    notes: [
      'You can edit your own reservations. App admins may have additional options.',
      'The app checks for conflicts again before saving changes.',
    ],
  },
  {
    id: 'edit-series',
    title: 'Edit a Recurring Series',
    summary: 'Update an entire recurring reservation series when the repeating pattern needs to change.',
    keywords: ['series', 'recurring', 'edit series', 'repeat'],
    steps: [
      { text: 'Click an occurrence in the recurring series.' },
      { text: 'Click Edit series.' },
      { text: 'Update the repeat pattern, comments, or custom field answers.' },
      { text: 'Save the series.' },
    ],
    notes: [
      'Editing a series updates the active occurrences in that series.',
      'Use Edit reservation if only one occurrence needs a change.',
    ],
  },
  {
    id: 'delete-reservation',
    title: 'Delete or Cancel a Reservation',
    summary: 'Remove a reservation or recurring reservation when it is no longer needed.',
    keywords: ['delete', 'cancel', 'remove', 'series', 'occurrence'],
    steps: [
      { text: 'Click your reservation on the calendar.' },
      { text: 'Choose Delete reservation for a single reservation.' },
      { text: 'For recurring reservations, choose Delete occurrence or Delete series.' },
      { text: 'Confirm the delete action.' },
    ],
    notes: [
      'Deleted reservations are removed from the active calendar.',
      'Choose Delete series only when the whole recurring series should be removed.',
    ],
  },
  {
    id: 'blackouts-conflicts',
    title: 'Blackouts and Conflicts',
    summary: 'Understand why a requested time may be unavailable.',
    keywords: ['blackout', 'maintenance', 'conflict', 'unavailable'],
    steps: [
      { text: 'If a conflict message appears, read the listed conflicting time.' },
      { text: 'Change the requested time or choose a different resource.' },
      { text: 'Try saving again.' },
    ],
    notes: [
      'Blackout windows mark maintenance or unavailable periods.',
      'The app prevents overlapping active reservations for the same resource.',
    ],
  },
  {
    id: 'profile-gateway',
    title: 'Profile and Gateway',
    summary: 'Use the profile image in the header as a shortcut to SFSU Gateway.',
    keywords: ['profile', 'gateway', 'photo', 'header'],
    steps: [
      { text: 'Find your profile photo or initials in the top-right header.' },
      { text: 'Click it to open SFSU Gateway in a new tab.' },
    ],
    notes: [
      'If your profile photo is unavailable, the app shows your initials instead.',
    ],
  },
  {
    id: 'keyboard-access',
    title: 'Keyboard Access',
    summary: 'Use the app without a mouse.',
    keywords: ['keyboard', 'tab', 'accessibility', 'focus'],
    steps: [
      { text: 'Press Tab to move through header controls and calendar buttons.' },
      { text: 'Use New reservation to create a booking without dragging on the calendar.' },
      { text: 'Press Escape to close popovers and menus.' },
      { text: 'Follow the visible focus ring to see where you are on the page.' },
    ],
    notes: [
      'The calendar grid supports mouse selection, but New reservation is the keyboard-friendly booking path.',
    ],
  },
]

function normalized(value: string): string {
  return value.trim().toLowerCase()
}

function topicMatches(topic: HelpTopic, query: string): boolean {
  const q = normalized(query)
  if (!q) return true

  const haystack = [
    topic.title,
    topic.summary,
    ...topic.keywords,
    ...(topic.steps ?? []).map((step) => `${step.title ?? ''} ${step.text}`),
    ...(topic.notes ?? []),
  ]
    .join(' ')
    .toLowerCase()

  return haystack.includes(q)
}

function setHelpTopic(topicId: string) {
  window.location.hash = `/help/${topicId}`
}

export default function HelpPage({ activeTopicId }: HelpPageProps) {
  const { theme } = useTheme()
  const [query, setQuery] = useState('')
  const helpVars = {
    '--help-primary': theme.primaryColor,
    '--help-accent': theme.accentColor,
    '--help-date-header': theme.dateHeaderColor,
    '--help-radius': `${theme.borderRadius}px`,
  } as CSSProperties
  const visibleTopics = useMemo(
    () => TOPICS.filter((topic) => topicMatches(topic, query)),
    [query]
  )
  const selectedTopicId =
    activeTopicId && TOPICS.some((topic) => topic.id === activeTopicId)
      ? activeTopicId
      : TOPICS[0].id

  useEffect(() => {
    const element = document.getElementById(selectedTopicId)
    element?.scrollIntoView({ block: 'start' })
  }, [selectedTopicId])

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Help | SFSU Resource Reservations'

    return () => {
      document.title = previousTitle
    }
  }, [])

  return (
    <div className={styles.helpShell} style={helpVars}>
      <a href="#help-main" className={styles.skipLink}>
        Skip to help content
      </a>
      <aside className={styles.sidebar} aria-label="Help topics">
        <div className={styles.sidebarHeader}>
          <p className={styles.eyebrow}>Help</p>
          <h1>SFSU Resource Reservations</h1>
        </div>

        <label className={styles.searchLabel} htmlFor="help-search">
          Search help
        </label>
        <input
          id="help-search"
          className={styles.searchInput}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search topics"
          type="search"
        />

        <nav className={styles.topicNav} aria-label="Help table of contents">
          {visibleTopics.length > 0 ? (
            visibleTopics.map((topic) => (
              <button
                key={topic.id}
                type="button"
                className={
                  topic.id === selectedTopicId
                    ? `${styles.topicButton} ${styles.topicButtonActive}`
                    : styles.topicButton
                }
                aria-current={topic.id === selectedTopicId ? 'location' : undefined}
                onClick={() => setHelpTopic(topic.id)}
              >
                <span>{topic.title}</span>
              </button>
            ))
          ) : (
            <p className={styles.emptySearch}>No topics found.</p>
          )}
        </nav>

      </aside>

      <main id="help-main" className={styles.content} tabIndex={-1}>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>End User Guide</p>
          <h2>Help that stays in the app</h2>
          <p>
            Find quick steps for viewing the calendar, booking resources, editing reservations,
            and understanding the details shown in the reservation popover.
          </p>
        </header>

        <div className={styles.topicStack}>
          {TOPICS.map((topic) => (
            <section
              key={topic.id}
              id={topic.id}
              className={styles.topicSection}
              aria-labelledby={`${topic.id}-title`}
            >
              <p className={styles.topicKicker}>Topic</p>
              <h3 id={`${topic.id}-title`}>{topic.title}</h3>
              <p className={styles.topicSummary}>{topic.summary}</p>

              {topic.steps && (
                <ol className={styles.stepList}>
                  {topic.steps.map((step, index) => (
                    <li key={`${topic.id}-step-${index}`}>
                      {step.title && <strong>{step.title}: </strong>}
                      {step.text}
                    </li>
                  ))}
                </ol>
              )}

              {topic.notes && (
                <div className={styles.noteBlock}>
                  <p>Good to know</p>
                  <ul>
                    {topic.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}
