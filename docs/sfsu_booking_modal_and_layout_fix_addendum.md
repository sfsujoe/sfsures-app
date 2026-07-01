# SFSU Reservation System — Runbook Addendum: Booking Modal + Access Gate Fix + Layout Fix

**Date:** June 29, 2026
**Phase:** UI build continuation. Booking flow built end-to-end and verified live against real
Dataverse data: access gate passes, calendar renders full-width, click-to-book writes a real
occurrence row, conflict detection blocks overlapping bookings, and the new reservation appears
on the calendar with the correct resource name.

Addendum to all prior runbooks, in particular `sfsu_ui_build_kickoff_addendum.md` (June 27).
Where this conflicts with that file's "immediate next steps," this file wins — the booking
modal is now built, tested, and live.

---

## Headline outcomes

1. **Booking modal built and working end-to-end in the published app.** Click a calendar slot →
   modal opens with pre-filled start/end → pick a resource → conflict check runs → row writes to
   `sfsures_reservationoccurrence` → calendar refreshes and shows the new booking with the correct
   resource name.
2. **AccessGate identity lookup fixed.** `window._paPlatformContext` does not exist in this SDK
   version (confirmed undefined in both local dev and the published runtime). The correct pattern
   is `Office365UsersService.MyProfile_V2('userPrincipalName')` — added Office365Users as a data
   source and rewrote the gate around it. Confirmed working live.
3. **Full-width calendar layout fixed.** The app was rendering in a narrow ~500px column
   regardless of browser width. Root cause: `#root` had no explicit `width` and was collapsing to
   content width inside the Power Apps iframe. One-line fix in `App.css`.
4. **`UserContext` introduced.** AccessGate now populates the authenticated user's App User record
   (GUID, SF State ID, display name, email) into React context on successful access, so BookingModal
   and future screens can read the current user without a redundant Dataverse query.
5. **Dataverse lookup write/read field-name conventions learned the hard way** — both are now
   documented in memory and below, since they will recur on every future create/read involving a
   lookup column.
6. **Conflict detection verified live.** Booking an overlapping slot was blocked with the expected
   error message; no duplicate row was written.
7. **Sandbox environment self-provisioned by Joe** (`cose-res-demo-sandbox`), appearing under
   "Build apps with Dataverse" with Dataverse already enabled. Code-apps-enabled status and System
   Administrator grant still need verification, but this likely removes one of the two ITS
   environment asks.

---

## What was built this session

### `src/auth/UserContext.tsx` (new)
React context holding the authenticated user's App User record (`appUserId`, `sfStateId`,
`displayName`, `email`). Populated by AccessGate on successful check; consumed via
`useCurrentUser()`. Avoids re-querying Dataverse for identity in every component that needs it
(BookingModal today; reports/admin screens later).

### `src/auth/AccessGate.tsx` (rewritten)
Same three-state blocking behavior as before (not-onboarded / disabled / error — see locked
directive below), but the UPN lookup now goes through `Office365UsersService.MyProfile_V2`
instead of a nonexistent window global. On success, wraps children in `UserProvider` so the rest
of the app can read the current user.

### `src/booking/BookingModal.tsx` + `BookingModal.module.css` (new)
Single-booking creation (no recurrence — deliberately deferred, see Decision below). Resource
picker (active resources, all of them for now — group-scoping is app-layer and still TODO),
start/end datetime inputs pre-filled from the calendar selection, conflict detection against both
active occurrences and blackout windows for the selected resource using the same delegable overlap
query shape as `CalendarScreen`, and a create call that writes one `sfsures_reservationoccurrence`
row with `Series` left null.

### `src/calendar/CalendarScreen.tsx` (updated)
`handleDateSelect` now opens `BookingModal` instead of just clearing the selection. Added a
`refreshCalendar` helper that re-fetches the currently loaded date range after a successful
booking, so the new event appears immediately without a full reload. Occurrence `select` array
expanded to include the lookup fields needed for display (see field-naming section below).

### `App.css` (one-line fix)
Added `width: 100%` to the `html, body, #root` rule. This was the entire fix for the full-width
layout bug (see Decision section).

---

## Decision — Single booking only, recurrence deferred

Considered scoping today's session to single + recurring bookings together, or just the modal
shell with no write. **Chose single-booking-only with a real Dataverse write.**

**Rationale:** the demo's core moment is the full loop — click, book, see it land, see it
reappear — and that loop is identical whether or not recurrence exists. Recurrence adds real
machinery (series row, occurrence-date expansion, atomic all-or-nothing validation across N
generated rows, frequency/interval/day-of-week UI) that deserves its own session rather than being
rushed alongside the first end-to-end test of the write path. Nothing built today is throwaway —
recurrence will call the same occurrence-create logic N times inside a validation wrapper and add
a series row on top.

---

## Key technical findings (will recur — read before next Dataverse write/read work)

### 1. Identity comes from Office365Users, not a window global
`window._paPlatformContext` does not exist in this SDK version — confirmed `undefined` in local
dev (`npm run dev`) **and** in the published play URL. The correct pattern for a code app:

```ts
const profileResult = await Office365UsersService.MyProfile_V2('userPrincipalName')
const upn = profileResult.data?.userPrincipalName
```

Requires `Office365Users` as a registered data source (`npx power-apps add-data-source --api-id
office365users`). When prompted "Are you using a connection reference instead of a connection
ID?" → **No**. When prompted for the connection ID, find it in make.powerapps.com → Connections
→ click the existing Office 365 Users connection → read the ID from the URL. **Connection IDs are
per-environment, not per-app** — an existing connection from another app in the same environment
can be reused.

### 2. Dataverse lookup fields: WRITE convention ≠ READ convention
This is the single biggest time-sink this session and will hit every future table with a lookup
column.

**Writing a lookup** (in a `create()` call) requires the OData navigation-property bind syntax —
the `_value` suffix convention does **not** work for writes and returns a clear but easy-to-miss
error:

```
"CRM do not support direct update of Entity Reference properties, Use Navigation properties instead."
```

Correct write pattern:
```ts
await SomeService.create({
  // ...other fields...
  'sfsures_Resource@odata.bind': `/sfsures_resources(${resourceGuid})`,
  'sfsures_BookingOwner@odata.bind': `/sfsures_appusers(${appUserGuid})`,
} as unknown as Parameters<typeof SomeService.create>[0])
```
Pattern: `{NavigationPropertyName}@odata.bind` → `/{plural_table_logical_name}({guid})`. The
navigation property name matches the schema name given to the lookup column in the designer
(`sfsures_Resource`, `sfsures_BookingOwner` — capitalization matters, matches the column's display
name converted to schema-name casing).

**Reading a lookup** (via `getAll` with `select`) returns the GUID under the `_value` suffix
convention, and Dataverse automatically attaches a formatted-value annotation alongside it — no
`$expand` needed:

```json
{
  "_sfsures_resource_value": "2e23b7e9-2f73-f111-ab0f-7c1e528d1e65",
  "_sfsures_resource_value@OData.Community.Display.V1.FormattedValue": "TEST Confocal Microscope",
  "_sfsures_resource_value@Microsoft.Dynamics.CRM.associatednavigationproperty": "sfsures_Resource",
  "_sfsures_resource_value@Microsoft.Dynamics.CRM.lookuplogicalname": "sfsures_resource"
}
```

**The field name we originally guessed wrong:** we assumed the formatted value would be keyed as
`sfsures_Resource@OData.Community.Display.V1.FormattedValue` (the nav property name). It is
actually keyed as `_sfsures_resource_value@OData.Community.Display.V1.FormattedValue` (the read
field name, with its `_value` suffix, plus the annotation). **Always log a real row and read the
actual key names rather than guessing from the column's schema name** — this is the same lesson as
the naive-pluralization gotcha, one level deeper.

### 3. `#root` needs an explicit width inside the Power Apps iframe
The app rendered in a fixed ~500px-wide column regardless of browser window size, while a sibling
test app (Simple Calendar) filled the full width in the same environment — ruling out a platform
constraint. Diagnostic path: `getBoundingClientRect()` on `#root` and its parent at the console
confirmed `html`/`body` were full width (1440px) but `#root` had collapsed to content width
(~500px). The Vite template's `index.html` mounts React into a bare `<div id="root">` with no
explicit width; in normal browser contexts this defaults to `100%`, but inside this iframe context
it did not. Fix:

```css
html, body, #root {
  height: 100%;
  width: 100%;   /* added */
  margin: 0;
  padding: 0;
}
```

**This is now a standing build directive** — verify `#root` width explicitly any time a future
screen looks unexpectedly narrow in the published app; check this before assuming it's a platform
limitation.

### 4. `hidenavbar=true` suppresses the Power Apps shell chrome
Appending `&hidenavbar=true` to the published play URL hides the purple "Power Apps | App Name"
shell bar, leaving only the app's own header. Per-URL, not a persistent app setting — the
URL with this flag should be the one shared with end users / bookmarked for the demo.

---

## Diagnostic technique worth keeping

The access-gate and layout bugs were both solved the same way: **add a temporary `console.log`,
rebuild, push, reproduce, read the real value, remove the log.** This is slower than guessing but
was faster in aggregate than the three wrong guesses that preceded it on both bugs (the window
global name, then the formatted-value field name). Default to this pattern earlier next time a
runtime value's exact shape is uncertain, rather than iterating on plausible-looking fixes.

Comparing against a known-working sibling app (Simple Calendar) was also decisive — it converted
"is this a platform limitation or our bug" from a guess into a one-screenshot answer.

---

## Still open (carried forward, nothing resolved this session unless noted above)

1. **WCAG 2.1 AA accessibility pass** — raised explicitly this session by Joe ahead of the DPRC
   vetting. Foundation already in place (semantic `<header>`/`<main>`, `role="dialog"
   aria-modal`, `:focus-visible` outline in `App.css`, Escape-to-close on both the event popover
   and booking modal). Gaps to address: focus trapping inside modals (Tab currently can escape to
   the calendar behind an open modal), `aria-live` regions for dynamic status (booking
   success/conflict/error messages currently update visually only), keyboard-only path through
   FullCalendar's slot selection, and a screen-reader pass on the calendar's event blocks
   (currently rely on color + position only). **Not yet started — next session candidate.**
2. **Calendar fixed-max-width on desktop** — RESOLVED this session (see Decision/Finding #3
   above). Leaving this line struck through in spirit; future readers should treat the layout
   question as closed unless a new symptom appears.
3. **Resource group-scoping in BookingModal** — picker currently shows all active resources
   regardless of the signed-in user's group membership. Marked TODO in code. Dataverse role is
   still the real security boundary regardless; this is a UX correctness gap, not a security one.
4. **Recurrence** — deliberately deferred this session (see Decision above). Builds on the same
   occurrence-create path already proven working.
5. **Vite chunk size warning** — reappeared on this build (expected, FullCalendar is sizeable).
   Still intentionally deferred; revisit with code splitting if load times become noticeable.
6. **Sandbox environment verification** — `cose-res-demo-sandbox` exists (self-provisioned by
   Joe, appears under "Build apps with Dataverse," Dataverse already enabled). Still need to
   confirm: code apps feature toggle enabled, System Administrator grant for Joe on this
   environment. If both check out, the ITS ask shrinks from two environments to one
   (Production only).
7. **Booker User-level inheritance test** — still deferred, still requires Scott (non-admin
   identity), still must-do before go-live. Unaffected by this session's work.
8. **Mid-session revocation test** — still pending.
9. **Admin Theme screen** — picker UI not yet built (schema support — `Selected Theme Name`
   column — already exists per the June 25 addendum).
10. **Reports screen, user management screen** — deferred from initial build, unchanged.
11. **Nightly export flow + anomaly-alert flow** — not yet built.
12. **Segregated purge role** for audit log retention deletes — not yet built.
13. **≥2 co-owners + ITS reassignment backstop** — not yet seated.
14. **Application Insights telemetry** — explicitly phase two, unchanged.
15. **Dataverse plugin for server-side audit logging** — phase two security hardening, unchanged.
16. **ITS environment provisioning** — narrowed in scope pending item 6 above; otherwise
    unchanged as the gating dependency for a "real" demo environment separate from dev.

---

## Recommended next session

Given everything above, the natural next-session candidates in rough priority order:

1. **Accessibility pass** (item 1) — flagged explicitly by Joe this session ahead of DPRC vetting;
   cheapest to build in now versus retrofit later, and touches every screen built so far
   (AccessGate, CalendarScreen, BookingModal) rather than compounding across future screens too.
2. **Seed realistic demo data** — a week of bookings across resources, a blackout window, a second
   resource type — now that the write path is proven, this is fast and makes every subsequent
   screen (and any ad hoc demo) look credible immediately.
3. **Admin Theme screen** — schema-ready, self-contained, good demo value (item 9).
4. **Recurrence** — larger lift, own session, builds on today's proven occurrence-write path.

Joe's call on ordering — flagging accessibility first because it was raised explicitly this
session, not because it's unconditionally higher priority than the others.

---

## How to resume

Open next session with: **"Booking modal is built and working end-to-end — access gate, full-width
calendar, click-to-book, conflict detection all verified live. Pick up at [accessibility pass /
demo data seeding / theme screen / recurrence] — your call."** The Dataverse lookup write/read
field-naming conventions (Finding #2 above) and the `#root` width fix (Finding #3) are now in
memory and should not need rediscovering. `sfsu_dataverse_build_sheet.md` (June 26) remains the
schema source of truth; nothing in the schema changed this session.
