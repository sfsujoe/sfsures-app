# SFSU Reservation System — Runbook Addendum: Pre-Publish Checklist + VS Code Scaffold

**Date:** June 27, 2026
**Phase:** UI build kickoff. Schema verified and published. VS Code project scaffolded, all 14
Dataverse service files generated, clean build confirmed. Ready to build the first screen.

Addendum to all prior runbooks. Nothing here changes the schema or enforcement layer — both
remain as built per the June 26 addendums. This session completes the two prerequisites that
gate the UI build and leaves the project in a state where component work can begin immediately.

---

## Headline outcomes

1. **Pre-publish verification checklist completed.** All critical schema items confirmed via
   screenshot review before publishing.
2. **Schema published** to `orgdaa34530.crm.dynamics.com` — "Publish all customizations
   succeeded" confirmed.
3. **VS Code project scaffolded** at `C:\Users\909272551\dev\sfsures-app` using the Microsoft
   Vite template. Registered to the dev environment as "SFSU Reservation System."
4. **All 14 Dataverse service + model files generated** via `add-data-source`. Filenames
   recorded (see below — pluralization is naive; always use this table, never guess).
5. **Clean build confirmed** — `npm run build` passes with zero errors, zero warnings,
   32 modules, 521ms.

---

## Pre-publish checklist results

Every item reviewed via screenshot before publishing. All passed.

- **Reservation Series** — User/team-owned confirmed (Owner / Owning User / Owning Team /
  Owning Business Unit columns present). Booking Owner (`sfsures_BookingOwner`, Lookup → App
  User) present and renamed correctly. All recurrence columns present. Record Status Choice. ✓
- **Reservation Occurrence** — User/team-owned confirmed. Booking Owner + Resource
  denormalized (both Lookup columns on the occurrence row). Series lookup present and
  **Required = No** (optional, correct for single bookings). Start/End as Date and time.
  Name primary is Autonumber. Record Status Choice. ✓
- **Resource Attribute Value** — Five distinct typed Value columns confirmed: ValueBoolean
  (Yes/no), ValueChoice (Single line of text), ValueDateTime (Date and time), ValueNumber
  (Decimal), ValueText (Single line of text). No JSON column anywhere. ✓
- **Group Resource Type Access** — Explicit junction table (Autonumber primary, not native
  N:N). Group + Resource Type lookups + Access Level Choice present. Org-owned. ✓
- **Group Resource Access** — Explicit junction table. Group + Resource lookups + Access Level
  Choice present. Org-owned. ✓ (Two separate junction tables confirmed — the #1 regression
  risk cleared.)
- **App User alternate key** — SF State ID Unique Key (`sfsures_sfstateiduniquekey`) on SF
  State ID column, Status = **Active**. ✓
- **Audit Log** — All frozen-text snapshot columns present (Actor SF State ID, Actor Display
  Name, Actor Group Snapshot as Memo, Action Timestamp, Target ID, Target Label, Before State,
  After State, Details). Four Choice columns (Entry Type, Action Type, Outcome, Target Type).
  Name primary is Autonumber. No lookup columns. Org-owned. ✓
- **Blackout Window** — Reason column (Multiple lines of text) Required = **Yes**. Start/End
  as Date and time. Resource lookup present. ✓

---

## Generated service/model filename map

**Never guess these — pluralization is naive. Always import from this table.**

| Table logical name | Service file | Model file |
|---|---|---|
| `sfsures_appuser` | `Sfsures_appusersService` | `Sfsures_appusersModel` |
| `sfsures_appsettings` | `Sfsures_appsettingsesService` | `Sfsures_appsettingsesModel` |
| `sfsures_attributedefinition` | `Sfsures_attributedefinitionsService` | `Sfsures_attributedefinitionsModel` |
| `sfsures_auditlog` | `Sfsures_auditlogsService` | `Sfsures_auditlogsModel` |
| `sfsures_blackoutwindow` | `Sfsures_blackoutwindowsService` | `Sfsures_blackoutwindowsModel` |
| `sfsures_groupresourceaccess` | `Sfsures_groupresourceaccessesService` | `Sfsures_groupresourceaccessesModel` |
| `sfsures_groupresourcetypeaccess` | `Sfsures_groupresourcetypeaccessesService` | `Sfsures_groupresourcetypeaccessesModel` |
| `sfsures_group` | `Sfsures_groupsService` | `Sfsures_groupsModel` |
| `sfsures_reservationoccurrence` | `Sfsures_reservationoccurrencesService` | `Sfsures_reservationoccurrencesModel` |
| `sfsures_reservationseries` | `Sfsures_reservationseriesesService` | `Sfsures_reservationseriesesModel` |
| `sfsures_resourceattributevalue` | `Sfsures_resourceattributevaluesService` | `Sfsures_resourceattributevaluesModel` |
| `sfsures_resource` | `Sfsures_resourcesService` | `Sfsures_resourcesModel` |
| `sfsures_resourcetype` | `Sfsures_resourcetypesService` | `Sfsures_resourcetypesModel` |
| `sfsures_usergroupassignment` | `Sfsures_usergroupassignmentsService` | `Sfsures_usergroupassignmentsModel` |

**Naming patterns to watch:**
- `appsettings` → `appsettingses` (double-es)
- `reservationseries` → `reservationserieses` (not any sensible English plural)
- `groupresourceaccess` → `groupresourceaccesses`

---

## VS Code project facts

- **Location:** `C:\Users\909272551\dev\sfsures-app`
- **Template:** `github:microsoft/PowerAppsCodeApps/templates/vite` (Vite + React + TypeScript)
- **Environment:** `orgdaa34530.crm.dynamics.com` (dev sandbox — build target until ITS
  provisions a sandbox environment)
- **App display name:** SFSU Reservation System
- **Config:** `power.config.json` written at project root by `npx power-apps init`
- **Generated files:** `src/generated/services/` and `src/generated/models/` — **do not edit**
  these; they are regenerated by `add-data-source`
- **Build:** `npm run build` — clean, zero errors, 32 modules, 521ms

---

## Clarifications established this session

- **"Publish all customizations" does not deploy anywhere public.** It flushes schema changes
  from draft state into the live Dataverse metadata API within the dev environment. Required
  before `add-data-source` so the CLI sees the final column definitions.
- **Dataverse search (the banner on the solution overview page)** — optional full-text index,
  not related to OData filter queries the app uses. Ignore for now; phase-two at most.
- **`add-data-source` 404 on first attempt** is expected (metadata propagation delay after
  table creation or publish). Retry succeeds. Did not occur this session — publish timing
  was sufficient.

---

## Immediate next steps

1. **Install FullCalendar:**
   ```bash
   npm install @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/interaction
   ```
2. **Read the frontend design skill** before writing any component code
   (`/mnt/skills/public/frontend-design/SKILL.md` — already read this session).
3. **Build the calendar screen first** — highest demo value, most logic-dense:
   - Load active theme row from `Sfsures_appsettingsesService` at startup; store in context
   - Fetch occurrences from `Sfsures_reservationoccurrencesService` with delegation-safe
     `select`, `filter`, `orderBy`, `top`
   - Fetch blackout windows from `Sfsures_blackoutwindowsService`
   - Render with FullCalendar: day/week/month toggle, occurrences as colored event blocks,
     blackout windows as non-bookable background events
   - SFSU Core Purple `#442C8B` as primary event color, Gold `#DCAE27` as accent
4. **Wrap the whole app in an access gate** at `App.tsx` level — SF State ID lookup against
   `Sfsures_appusersService` before any screen renders. Modal if check fails; no content
   visible behind it.
5. **Seed sample data** through the app as screens are built (demo environment target:
   3–4 resources, 2 resource types, a week of realistic bookings, one blackout window,
   two groups).

---

## Still open (carried from prior sessions)

1. **ITS environment provisioning** — Production + Sandbox, both with full Dataverse and
   code apps enabled. Gating dependency for the demo path.
2. **Managed solution export** — can be done now in dev before ITS responds.
3. **Booker User-level inheritance test** — requires Scott (non-admin identity). Must-do
   before go-live. Run via Web API directly against real reservation tables.
4. **Mid-session revocation test** — still pending.
5. **Nightly export flow + anomaly-alert flow** — build before go-live.
6. **Segregated purge role** for audit log retention deletes — not yet built.
7. **≥2 co-owners + ITS reassignment backstop** — not yet seated.
8. **Dataverse plugin for server-side audit logging** — phase two security hardening.

---

## How to resume

Open next session with: **"UI build kickoff addendum written (June 27). Prerequisites done —
schema published, 14 service files generated, clean build confirmed. Start the calendar screen:
FullCalendar install, then the calendar component."** The filename map above is the import
reference for every component. `sfsu_dataverse_build_sheet.md` (June 26) remains the schema
source of truth.
