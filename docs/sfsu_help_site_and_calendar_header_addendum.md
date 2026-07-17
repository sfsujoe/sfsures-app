# SFSU Reservation System -- Runbook Addendum: Help Site and Calendar Header

**Date:** 2026-07-17  
**Phase:** User-facing calendar polish and first in-app help site draft completed.  
**Scope:** Reservation-info Custom Field verification, calendar header Help/Gateway actions, standalone end-user help route, browser branding, and next-session Blackouts handoff.

## Headline Outcomes

1. The reservation-info Custom Fields fix was verified in the published runtime: saved Custom Field answers now appear in the calendar reservation-info modal.
2. The calendar header now has a compact Help menu before Admin/profile actions.
3. The profile photo or initials are now a keyboard-focusable link to SFSU Gateway.
4. A first draft end-user help site exists at `#/help`, with searchable left navigation and stable topic IDs for future contextual help links.
5. The next session should move to Blackouts.

## What Changed

### Calendar header

- Added a circular `?` Help button in the header.
- The Help menu includes:
  - `Help (New tab)`, which opens the standalone help route in a new browser tab.
  - `About`, currently inert except for closing the menu.
- Added visible header-specific keyboard focus styling so logo, Help, Admin, and profile controls remain visible against the purple header.
- Wrapped the profile photo/fallback initials in a link to `https://gateway.sfsu.edu/`.

### Help route

- Added a lazy-loaded `HelpPage` route under `#/help`.
- Added deep-link support for future topic-specific URLs such as `#/help/create-reservation`.
- Moved the help route outside `AccessGate` so it can open in a fresh tab without getting stuck at `Verifying your access...`.
- Kept the help page inside `ThemeProvider` so it uses current theme variables and the same Source Sans 3 font.
- Removed the in-page `Calendar` return button from the help navigation because the page opens as a separate tab.

### Help content draft

The first help draft is end-user only and intentionally excludes Admin functions. It includes topics for:

- Getting started
- Creating reservations
- Recurring reservations
- Custom Fields
- Comments
- Viewing reservation details
- Editing reservations
- Editing recurring series
- Deleting/canceling reservations
- Blackouts and conflicts
- Profile/Gateway
- Keyboard access

### Browser branding

- Replaced the default Vite document title with `SFSU Resource Reservations`.
- Added `public/sfsures-icon.svg` as the app favicon.
- The help route sets the tab title to `Help | SFSU Resource Reservations`.

## Decisions / Rationale

### Help opens outside the access gate

The help page should be available as a reference page and should not wait on the Office365Users/App User access check. Calendar and Admin app content remain behind `AccessGate`.

### Stable topic IDs now

Future contextual `?` links should target existing topic IDs rather than inventing a second help routing pattern. The current help route shape is:

```text
#/help
#/help/<topic-id>
```

### Admin help remains separate

Admin functions should get their own future help entry point from the Admin screen. The current help site is intentionally focused on regular end users.

## Current Status

- `npm run lint`: passed.
- `npm run build`: passed; the existing Vite large-chunk warning remains informational.
- Reservation-info Custom Field display works in the published runtime after the generated `*name` field fix.
- The help site is a draft but is functional, searchable, theme-aware, and deep-linkable.

## Still Open / Carry Forward

- Build the Blackouts admin screen next.
- Eventually add contextual `?` links from specific app surfaces to matching help topics.
- Later add Admin-specific help from the Admin screen, not from the calendar Help menu.
- Continue enriching help content after workflows stabilize.
- Publish and verify the Help menu/new-tab behavior in the embedded Power Apps runtime if this local build has not yet been deployed.

## How to Resume

Start next session with Blackouts:

1. Read `docs/README.md`, this addendum, and the Dataverse build-sheet Blackout Window section.
2. Inspect the generated `Sfsures_blackoutwindows` model/service names before editing source.
3. Build the Admin Blackouts screen as a lazy-loaded admin section.
4. Preserve the existing calendar blackout rendering and conflict-detection behavior while adding admin create/edit/disable flows.
