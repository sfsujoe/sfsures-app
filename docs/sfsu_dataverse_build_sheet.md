
Reservation System Development



How can I help you today?


Accessibility review
Last message 23 hours ago
Starting calendar screen development
Last message 2 days ago
Starting UI development
Last message 4 days ago
Protecting Dataverse backups from malicious bookings
Last message 4 days ago
Booker role web API security vulnerability
Last message 5 days ago
Booker role ownership inheritance decision
Last message 5 days ago
Building Tables
Last message 6 days ago
Audit-log table for build sheet
Last message Jun 24
Building a simple Power Apps and Dataverse demo
Last message Jun 24
Power Apps Dataverse vs LibreBooking database architecture
Last message Jun 20
App onboarding and initial admin setup
Last message Jun 18
Claude Code extension context awareness in VS Code
Last message Jun 17
Power Apps calendar-first design concerns
Last message Jun 11
Vibe tool plan review and implementation
Last message Jun 9
Starting a new chat with project files
Last message Jun 4
Compacting Power Apps reservation system prompt
Last message Jun 4
Power Apps Vibe prompt
Last message Jun 4
LabArchives Scheduler discontinuation
Last message Apr 29
Power Apps file editing capabilities
Last message Apr 16
Memory
Only you
Purpose & context Joe is the lead developer (and largely sole developer) building the SFSU Resource Reservation System — a Power Apps code app (React/TypeScript/Vite) backed by Microsoft Dataverse, replacing LabArchives Scheduler for the College of Science & Engineering with a hard October 1, 2026 go-live. The system manages resource bookings, recurring series, blackout windows, and group-scoped permissions across resource types (rooms, vehicles, equipment). It is architected as a managed solution that replicates across university departments with zero code changes. Success means DPRC (accessibility body) approval, a passing security review, and a handoff model where Joe provisions once and app admins handle everything ongoing with zero ITS involvement after initial environment provisioning. Key people: Scott is the designated non-admin colleague used for Booker-level permission inheritance testing. ITS involvement is scoped to a single one-time production environment provisioning act only. Core constraints: Publisher prefix sfsures and solution packaging are non-negotiable (enables managed-solution replication) Separate-per-department instance model (not campus-wide single app) DPRC vetting requires WCAG 2.1 AA compliance throughout Structured pen-testing required before go-live SFSU brand colors: Core Purple #442C8B, Core Gold #DCAE27 --- Current state Active UI components built and working in published app: CalendarScreen.tsx, BookingModal.tsx, AccessGate.tsx, UserContext.tsx. Conflict detection confirmed working against real Dataverse data. Accessibility — Tier 1 complete (visual confirmation done, screen-reader verification outstanding): useFocusTrap hook with correct TypeScript generic RefObject<T | null> BookingModal.tsx: focus trapping, ARIA dialog semantics with aria-labelledby, always-mounted assertive live region for errors CalendarScreen.tsx: "New booking" FullCalendar customButtons entry as keyboard-operable booking path (FullCalendar drag-to-select has no keyboard equivalent), polite live region for success announcements with announce() helper, focus-trap on event-detail popover Global visible focus ring in App.css with FullCalendar-specific specificity override; toolbar clipping fixed via padding on .calendarWrap FullCalendar prev/next icon fix: buttonIcons={false} + Unicode angle brackets Native datetime picker indicator: custom Core Purple SVG glyph via CSS pseudo-element Outstanding Tier 1 items: Full screen-reader announcement verification (VoiceOver hearing conflict and success messages) Booker user-level permissions inheritance test (requires non-admin identity — Scott) Accessibility Tiers 2 and 3 queued. Sandbox environment cose-res-demo-sandbox self-provisioned by Joe; ITS dependency reduced to Production only. --- On the horizon Complete screen-reader announcement verification (VoiceOver) Run Booker permissions inheritance test with Scott's identity Accessibility Tier 2 and Tier 3 work Admin Theme screen (hardcoded SFSU palette presets + free-form hex/URL escape hatch + Default reset button) User management screen, reports screen (deferred from initial build) Power Automate nightly export to SharePoint (anomaly-alert flow deferred to phase two) Dataverse plugin (C# server-side enforcement of business rules, deferred to phase two) Application Insights telemetry (phase two) ITS ask for Production environment: full Dataverse, code apps enabled, US region, Dynamics 365 apps off, System Administrator for Joe on both Production and Sandbox --- Key learnings & principles Platform-confirmed technical facts: window.paPlatformContext is undefined in both local dev and published runtime — use Office365UsersService.MyProfileV2('userPrincipalName') for identity Dataverse create() lookup fields require @odata.bind navigation property syntax: 'sfsuresResource@odata.bind': '/sfsuresresources(${guid})' — the value suffix used for reads returns error 0x80060888 on writes Formatted value annotations on lookup reads come back as sfsuresresourcevalue@OData.Community.Display.V1.FormattedValue (leading underscore + value suffix), not sfsuresResource@OData.Community.Display.V1.FormattedValue #root needs explicit width: 100% in App.css or it collapses inside the Power Apps iframe Dataverse choice values for sfsuresrecordstatus: 997330000 (Active) / 997330001 (Disabled) — not 1/2 Apostrophes in TSX string literals cause TS1005 build errors — use 'has not' not "hasn't" Power Apps iframe CSP blocks data: fonts (causing tofu/empty-box rendering) but allows data: images — apply this distinction to all future asset delivery decisions add-data-source 404s immediately after table creation due to metadata propagation delay; retry succeeds Generated service filenames use naive pluralization (appsettings → appsettingses, reservationseries → reservationserieses) — always read filenames from src/generated/ rather than guessing create() generated input type marks system-defaulted fields as required; clean fix: create({ … } as Parameters<typeof XService.create>[0]) Missing read role causes getAll to return empty .data rather than throwing — permission failure is visually identical to "no data" hidenavbar=true appended to play URL suppresses Power Apps shell chrome Architecture decisions locked: Security enforcement lives at the Dataverse platform layer, not app UI — in-app role checks are cosmetic (controlling screen/button visibility only) Three Owner teams (sfsures Admins, sfsures Bookers, sfsures Viewers), each carrying exactly one security role — sized for least-trustworthy population principle Reservation Series (table 10) and Reservation Occurrence (table 11) are User/team-owned (not Organization-owned) to support Booker own-records-only write boundary; all other tables Organization-owned Custom owner lookup named sfsuresBookingOwner — distinct from system OwnerId which is what the security engine reads Booker role: Assign and Share privileges on Reservation Series and Occurrence are None (prevents peer-reservation reassignment bypass) On-premises Windows AD security groups are not supported in Power Platform — Dataverse-native Owner teams are the correct access mechanism Logo stored as a URL in sfsuresappsettings (Box-hosted or equivalent) — not bundled SVG, not Dataverse Image column — so logo varies per department and rebranding requires no redeploy Entra security groups handle coarse role assignment (Admin/Booker/Viewer — three groups maximum); per-resource access control lives in in-app junction tables as ordinary business data Dynamic table provisioning per resource is ruled out (requires System Administrator/Customizer privileges; incompatible with managed-solution replication) Core Purple (#442C8B) confirmed as WCAG-compliant focus ring color (~10.6:1 against white); Core Gold fails at ~2.07:1 (requirement: 3:1) FullCalendar customButtons keyboard booking path is the correct architectural approach — FullCalendar grid drag-to-select has no keyboard equivalent Audit log design: Frozen text-snapshot design — no live lookups — preserves historical state over current state Append-only; Write and Delete are None at all privilege levels including Admin; narrow purge path delegated to a separate purge role Tamper-resistant against edits/deletes but not forgery-proof against raw API injection — accepted and documented residual risk Reconciliation control: cross-check log row createdby against claimed Actor SF State ID to detect fabricated entries Business rules (locked): SF State ID on sfsuresappuser is write-once. App pulls it from Office365Users at user-record creation and writes it once; never exposed as editable in any UI. After creation it is read-only, used only for identity lookup, searches, and reporting. Platform permits editing the primary column but business rules forbid it (same family as disable-not-delete). Disable-not-delete on App User preserves reservation history; onboarding = add to team, offboarding = remove from team AccessGate blocks on ALL three failure cases: not-onboarded (no App User row), disabled (Record Status = 997330001), and error (network/permission failure). No pass-through for any case. Gate is defense-in-depth; real enforcement is the Dataverse security role. Recurrence conflicts are atomic all-or-nothing — full series fails if any occurrence conflicts; error surfaces total count, first three conflicts chronologically with owner display names, blackout-window carve-out --- Approach & patterns Documentation-first: Decisions recorded as locked in runbooks to prevent relitigating resolved forks. Dated addendums are accurate-as-of-their-date; CLAUDE.md and the build sheet are the live truth Runbook pattern: Each session produces a dated markdown addendum (sfsu*addendum.md); CLAUDE.md is regenerated and swapped in at session end Screenshot verification used iteratively for UI work; verbal confirmation sufficient for straightforward terminal commands Scope and ordering decisions are Joe's — Claude provides prioritized recommendations with explicit reasoning; Joe sets priorities Claude surfaces architectural discrepancies proactively rather than proceeding on flawed assumptions Web search used to verify load-bearing platform facts before giving guidance that depends on them Joe prefers understanding the mechanical "why" behind platform behaviors, not just steps to follow Prefers tradeoff framing ("here's what gets harder") over abstract best-practice advice Session workflow: continue when memory is stable, document at natural stopping points --- Tools & resources Stack: Power Apps code app, React/TypeScript/Vite, FullCalendar, Microsoft Dataverse, Office365Users connector Build tool: npx power-apps CLI (npm CLI); pac code commands are deprecated Dev environment: orgdaa34530.crm.dynamics.com; Sandbox: cose-res-demo-sandbox; org URL has no trailing slash Generated files: src/generated/services/ and src/generated/models/ — filenames must be read from directory, not guessed Identity: Office365UsersService.MyProfileV2('userPrincipalName') → GraphUserV1.userPrincipalName Connection IDs: Per-environment, not per-app; existing connections in same environment can be reused App Access Checker: Production triage tool for diagnosing blank-app issues (licensing vs. sharing vs. missing role) DPRC: University accessibility review body; WCAG 2.1 AA required for go-live approval

Last updated 19 hours ago

Instructions
Add instructions to tailor Claude’s responses

Files
3% of project capacity used
Search mode

sfsu_accessibility_tier1_addendum.md
187 lines

md



sfsu_booking_modal_and_layout_fix_addendum.md
264 lines

md



sfsu_ui_build_kickoff_addendum.md
160 lines

md



sfsu_environment_and_demo_planning_addendum.md
272 lines

md



sfsu_threat_model_addendum.md
212 lines

md



sfsu_security_roles_and_teams_addendum.md
284 lines

md



sfsu_dataverse_build_sheet.md
460 lines

md



sfsu_schema_build_complete_addendum.md
291 lines

md



sfsu_access_validation_and_logging_addendum.md
333 lines

md



sfsu_onboarding_and_access_exploration.md
212 lines

md



sfsu_governance_and_claudecode_addendum.md
154 lines

md



sfsu_codeapp_vscode_runbook_addendum.md
192 lines

md



sfsu_reservation_system_summary.md
142 lines

md



sfsu_reservation_system_progress.md
119 lines

md



sfsu_reservation_system_chat_summary.md
131 lines

md



sfsu_vibe_coding_session_notes.md
78 lines

md


sfsu_dataverse_build_sheet.md


# SFSU Reservation System — Dataverse Build Sheet (canonical schema reference)
 
**Target:** make.powerapps.com table designer, environment `orgdaa34530.crm.dynamics.com`.
**Publisher prefix:** **`sfsures`** — **confirmed live** (verified at the first table's schema name
`sfsures_ResourceType`). Fused permanently into every logical name and identical across every
department instance, which is what makes replication trivial. Not changeable now; nothing below
should reopen it.
 
**Status (June 26, 2026):** All 14 tables are **hand-built** in the designer and reviewed. The two
reservation tables (#10, #11) were **recreated as User/team-owned** (see Ownership conventions and
the ⚠ notes on those tables); all other tables are Organization-owned. The **security roles are not
yet built** — that is the immediate next step, and the role plan below is the spec for it.
 
**How to use this:** this doubles as the as-built reference and the replication spec. Build order is
dependency-first (dependencies come first). The pre-publish checklist at the end is the
no-easy-return gate. For a future department: export as a **managed** solution and import into their
environment — identical prefix → identical logical names → identical generated services → zero app
code change.
 
---
 
## Ownership conventions (read this first — it changed)
 
Record ownership is chosen **at table creation and can never be changed** afterward (recreate is the
only fix). It determines whether the platform can enforce per-record access.
 
- **12 of 14 tables are Organization-owned.** Org ownership has no per-row owner, so a privilege is
  binary at the platform layer: a user either can do the operation on **all** rows of the table or
  on **none**. This is correct and safe for these tables because each department is its own
  environment — "Organization" scope means "every row **in this environment**," i.e. just this
  department's data. The broadest scope is automatically isolated.
- **2 of 14 tables are User/team-owned — a deliberate exception:** `sfsures_ReservationSeries` (#10)
  and `sfsures_ReservationOccurrence` (#11). User/team ownership gives each row a system **`OwnerId`**
  and restores the tiered access levels (None / **User (own records only)** / Business Unit / Org).
  This is the **only** way to platform-enforce "a Booker may edit/cancel **their own** reservations
  but not anyone else's." On an Org-owned table that restriction would be UI-only and a raw-API call
  would bypass it. These two tables are the one place that boundary must be real, so they get the
  exception. **Do not "correct" these back to Org-owned** — doing so silently re-opens the hole.
### The two owners on the reservation tables (keep them straight)
Each reservation row carries **two** distinct owner concepts:
 
| | System **Owner** (`OwnerId`, type Owner) | **Booking Owner** (`sfsures_BookingOwner`, Lookup → App User) |
|---|---|---|
| Set by | Platform, automatically = the signed-in user who created the row | App, = the SF State ID record the booking is *for* |
| Read by the security engine? | **Yes** — this is what User-level write/delete scopes against | **No** — it's business data, invisible to permissions |
| Purpose | The real per-record security boundary | Display, reporting, conflict-ownership, the immutable-ID chain |
 
In the normal flow (a Booker booking for themselves) both point at the same human, but they are
mechanically separate. The custom lookup was **renamed from "Owner" to "Booking Owner"** on both
reservation tables specifically so it doesn't get confused with the system Owner column.
 
---
 
## Step 0 — Publisher + solution (already done; recorded for replication)
 
1. **Publisher** with prefix `sfsures`.
2. A new **unmanaged solution** ("SFSU Reservation System") owned by that publisher.
3. **Every** table, relationship, choice, and security role lives **inside that solution** — not the
   default solution (building in the default solution makes the later export messy).
4. For a future department: export this as a **managed** solution and import into their environment.
---
 
## Build order (dependency-first)
 
1. Resource Type → 2. Attribute Definition → 3. Resource → 4. Resource Attribute Value →
5. App User → 6. Group → 7. User Group Assignment → 8. Group Resource Type Access →
9. Group Resource Access → 10. Reservation Series → 11. Reservation Occurrence →
12. Blackout Window → 13. App Settings (Theme) → 14. Audit Log.
Then: security roles → Owner teams → ownership/continuity → verification → publish.
**Type legend:** Text = single line of text · Memo = multiple lines · Whole# = whole number ·
Decimal = decimal number · DateTime = date and time · Y/N = yes/no · Choice = option set ·
Lookup = relationship · Autonumber = system-generated sequential primary.
 
**Conventions applied uniformly across all 14 tables:**
- **Custom `sfsures_RecordStatus` Choice** for business status — **never** the platform `statecode`
  (its deactivation behavior conflicts with app meaning). Display-named "Record Status."
- **Autonumber primaries** on tables with no human-meaningful name (junctions, Occurrence, Audit
  Log), each with a **distinct prefix** (`UGA-`, `GRTA-`, `GRA-`, `OCC-`, `LOG-`). Tables with a real
  human-typed name keep a **Text** primary. *(Autonumber isn't offered at table creation in this
  environment — create with a Text primary, then convert the primary to Autonumber and set the
  prefix on the empty table.)*
- Tables built via the **advanced-properties** path for schema-name visibility.
---
 
## Resource model
 
### 1. `sfsures_resourcetype` — Resource Type  (Org-owned)
Admin-creatable categories (Room, Vehicle, Boat, Equipment, Field Gear…).
 
| Column | Type | Notes |
|---|---|---|
| Name | Text | primary column |
| Description | Memo | |
| Reminder lead time (hrs) | Whole# | per-resource-type reminder |
| Notify owner | Y/N | default Yes |
| Additional reminder recipient | Text | email or shared mailbox (bounded for v1) |
| Record Status | Choice | Active / Inactive |
 
### 2. `sfsures_attributedefinition` — Attribute Definition  (Org-owned)
Defines attributes *as data* so new types/attributes need zero schema change.
 
| Column | Type | Notes |
|---|---|---|
| Name | Text | primary (attribute name, e.g. "Capacity") |
| Resource Type | Lookup → Resource Type | the owning type |
| Data type | Choice | Text / Number / DateTime / Boolean / Choice — **Business Required**, default Text |
| Required | Y/N | whether the attribute is required on a resource of this type |
| Choice options | Memo | newline-separated options (data, not a Dataverse choice) |
| Display order | Whole# | |
 
### 3. `sfsures_resource` — Resource  (Org-owned)
Individual bookable items.
 
| Column | Type | Notes |
|---|---|---|
| Name | Text | primary |
| Resource Type | Lookup → Resource Type | |
| Description | Memo | |
| Location | Text | optional |
| Record Status | Choice | Active / Disabled |
 
### 4. `sfsures_resourceattributevalue` — Resource Attribute Value  ⚠ typed columns, NOT JSON  (Org-owned)
One row per (resource, attribute). Exactly one Value column is populated per row, matching the
attribute's data type. **Most likely table to regress to a JSON blob — it must keep the five separate
typed columns below.**
 
| Column | Type | Notes |
|---|---|---|
| Name | Text | primary (autonumber or resource+attribute) |
| Resource | Lookup → Resource | |
| Attribute Definition | Lookup → Attribute Definition | |
| ValueText | Text | |
| ValueNumber | Decimal | |
| ValueDateTime | DateTime | |
| ValueBoolean | Y/N | |
| ValueChoice | Text | stores the selected option (validated in-app against the attribute's option list) |
 
---
 
## Users, groups, access
 
### 5. `sfsures_appuser` — App User  ⚠ SF State ID is the key  (Org-owned)
Named `appuser` to avoid confusion with the built-in `systemuser` table.
 
| Column | Type | Notes |
|---|---|---|
| SF State ID | Text (9) | primary column **+ Active Alternate Key** (`sfsures_sfstateiduniquekey`, unique). First 9 chars of UPN. |
| Display Name | Text | display only |
| Email | Text | display only |
| Dataverse User | Lookup → User (`systemuser`) | optional during backfill; maps the App User history/business identity to the Dataverse security principal needed for reservation `OwnerId` assignment. Referential relationship with Restrict Delete and no cascading assignment/deletion. |
| Record Status | Choice | Active / Disabled — **disable, never delete** |
 
> **Write-once SF State ID (build directive).** The app pulls SF State ID from **Office365Users** at
> user-record creation and writes it **exactly once**; thereafter it is rendered **read-only** and
> never editable in any UI. Post-creation uses: identity lookup, search, reporting only. The platform
> *permits* editing a primary column (the alternate key tolerates it), but editing it would silently
> reassign every reservation / membership / audit entry tied to that ID to a different human — so the
> constraint is **app-layer**, same family as disable-not-delete.
>
> **No app-role column here.** Admin/Booker/Viewer lives in **Dataverse security roles**, not a
> column. This table drives the startup identity lookup, group membership, and disable/history.
 
### 6. `sfsures_group` — Group  (Org-owned)
| Column | Type | Notes |
|---|---|---|
| Name | Text | primary |
| Description | Memo | |
| Record Status | Choice | Active / Inactive |
 
### 7. `sfsures_usergroupassignment` — User ↔ Group  (explicit junction, Org-owned)
| Column | Type | Notes |
|---|---|---|
| Name | Autonumber | prefix `UGA-` |
| User | Lookup → App User | |
| Group | Lookup → Group | |
 
### 8. `sfsures_groupresourcetypeaccess` — Group ↔ Resource Type  (explicit junction, BROAD)  ⚠  (Org-owned)
| Column | Type | Notes |
|---|---|---|
| Name | Autonumber | prefix `GRTA-` |
| Group | Lookup → Group | |
| Resource Type | Lookup → Resource Type | |
| Access Level | Choice | Book / View — **default View** (fail-safe: under-permission is a help-desk ticket, over-permission is a security gap) |
 
### 9. `sfsures_groupresourceaccess` — Group ↔ Resource  (explicit junction, SURGICAL)  ⚠  (Org-owned)
| Column | Type | Notes |
|---|---|---|
| Name | Autonumber | prefix `GRA-` |
| Group | Lookup → Group | |
| Resource | Lookup → Resource | |
| Access Level | Choice | Book / View — **default View** |
 
> ⚠ **#8 and #9 are two SEPARATE junction tables on purpose** (the #1 schema regression risk). Each
> is its own table with two lookups + Access Level — **not** native Dataverse M:N (whose hidden
> intersect can't carry Access Level and is harder to delegate). Authorization path at runtime:
> SF State ID → App User → groups (via #7) → permitted resource types (#8) + individual resources (#9).
 
---
 
## Reservations
 
### 10. `sfsures_reservationseries` — Reservation Series  ⚠ **User/team-owned**
The recurring master. Expansion into occurrences + the atomic all-or-nothing validation are **app
logic**, not schema.
 
| Column | Type | Notes |
|---|---|---|
| Name | Text | primary (booking title / purpose) |
| Comments | Memo | optional per-series comments; copy to generated occurrences for fast calendar/modal reads |
| Resource | Lookup → Resource | |
| **Booking Owner** | Lookup → App User | the booking owner (SF State ID record). **Renamed from "Owner"** to avoid clashing with the system Owner column. Business data — invisible to the security engine. |
| Frequency | Choice | Daily / Weekly / Monthly |
| Interval | Whole# | every N days/weeks/months |
| Days of week | Text | for weekly (e.g. "Mon,Wed,Fri") |
| Range start | DateTime | |
| End mode | Choice | Until date / Count |
| Until date | DateTime | |
| Occurrence count | Whole# | |
| Record Status | Choice | Active / Cancelled |
| *(system)* Owner / Owning User / Owning Team | Owner / Lookup | **auto-created because the table is User/team-owned.** `OwnerId` = the signed-in creator; this is what User-level write/delete scopes against. |
 
### 11. `sfsures_reservationoccurrence` — Reservation Occurrence  ⚠ delegation-critical · **User/team-owned**
The materialized rows. **Conflict detection queries this; the calendar renders from this.** Keep
Start/End as real DateTime columns and denormalize Resource + Booking Owner here so the overlap query
delegates server-side.
 
| Column | Type | Notes |
|---|---|---|
| Name | Autonumber | prefix `OCC-` |
| Comments | Memo | optional user-entered reservation comments; denormalized from Series for recurring reservations |
| Series | Lookup → Reservation Series | **optional** (not business-required) — null for single (non-recurring) bookings |
| Resource | Lookup → Resource | denormalized for delegable conflict queries |
| **Booking Owner** | Lookup → App User | denormalized. **Renamed from "Owner."** Business data, not the security owner. |
| Start | DateTime | |
| End | DateTime | |
| Record Status | Choice | Active / Cancelled |
| *(system)* Owner / Owning User / Owning Team | Owner / Lookup | **auto-created (User/team-owned).** `OwnerId` = creator; the row a raw-API attacker would try to forge to steal a slot — User-ownership is what turns that into a 403. |
 
> Single booking = one Occurrence, Series null. Recurring = one Series + N Occurrences. Either way
> conflict detection is one delegable overlap query against Occurrence. Occurrence and Blackout Window
> share the same Resource + Start + End shape, so **one** delegable overlap query checks bookings and
> maintenance together.
 
### 12. `sfsures_blackoutwindow` — Blackout / Maintenance Window  (Org-owned)
| Column | Type | Notes |
|---|---|---|
| Name | Text | primary (label) |
| Resource | Lookup → Resource | |
| Start | DateTime | |
| End | DateTime | |
| Reason | Memo | **Business Required** |
 
> Included in conflict detection alongside occurrences. Rendered as non-bookable background events.
> No owning user — conflict messages identify these as blackout/maintenance, not a name.
 
---
 
## Theming
 
### 13. `sfsures_appsettings` — App Settings / Theme  (Org-owned)
The single, central home for the **resolved** theme values and instance-level reservation limits.
App reads the active row once at startup. Theme values are editable per instance; reservation limits
are seeded at app hard maxima and may be made more restrictive by App Admins, never less restrictive.
 
| Column | Type | Notes |
|---|---|---|
| Name | Text | primary |
| Primary color | Text | hex **stored with leading `#`**, default `#442C8B` (SFSU Core Purple) |
| Accent color | Text | hex with `#`, default `#DCAE27` (SFSU Core Gold) |
| Background color | Text | hex with `#`, default `#FFFFFF` |
| Logo | Text (URL) | **direct/raw image URL**, hosted on **Box**. Text URL (not an Image column) so it drops straight into `<img src>`. ⚠ a Box *shared link* serves a viewer page — use the **raw** link. |
| Font family | Text | |
| Border radius (px) | Whole# | |
| Is Active | Y/N | exactly one active row |
| Selected Theme Name | Text | which preset the admin picker has active (for re-highlighting) |
| Max reservation occurrences | Whole# | default `50`; app hard maximum `50`; App Admins may lower this but the app clamps higher values back to `50` |
| Max reservation span weeks | Whole# | default `18`; app hard maximum `18`; App Admins may lower this but the app clamps higher values back to `18` |
 
> **Theme handling = admin Theme picker, Option A (presets hardcoded in the app).** The SFSU palettes
> are a fixed, developer-known set identical across every instance, so they live in **code** (an
> `SFSU_THEMES` constant), not a Dataverse table. Schema impact is just the one `Selected Theme Name`
> column. App-layer build directives (carry to the screen-building phase): picking a preset writes
> resolved hex + logo URL into this row and sets Selected Theme Name; a **free-form escape hatch**
> lets admins enter custom hex (`#…`, validated) and a custom `https://` logo URL; a **Default** button
> resets colors + logo to `SFSU_THEMES[0]`. Rebranding a department instance = edit this one row + swap
> the logo. No screen edits.

> **Reservation limit handling:** app hard caps live in code as
> `HARD_MAX_RESERVATION_OCCURRENCES = 50` and `HARD_MAX_RESERVATION_SPAN_WEEKS = 18`. The active App
> Settings row carries instance defaults using logical columns `sfsures_maxreservationoccurrences`
> and `sfsures_maxreservationspanweeks`, both seeded to the hard caps in a new instance. The App
> Settings screen must show each hard maximum beside the editable value and prevent or clamp looser
> values. Recurrence generation must enforce both the resolved occurrence cap and resolved span cap
> before creating any Series or Occurrence rows.
 
---
 
## Audit logging
 
### 14. `sfsures_auditlog` — Audit Log  ⚠ append-only, tamper-resistant, denormalized-on-purpose  (Org-owned)
The in-app audit trail. Written by the app on the actor's behalf; **never updated or deleted in
normal operation.** Two *distinct* record kinds, told apart by **Entry type**: a **Session open** row
(someone launched the app) and an **Action** row (someone did a thing) — capturing only one leaves
you inferring activity. Most columns are deliberate **text snapshots**, not lookups — a log is an
immutable chronological narrative read top-to-bottom, not a live relational table.
 
| Column | Type | Notes |
|---|---|---|
| Name | Autonumber | prefix `LOG-` |
| Entry type | Choice | **Session open** / **Action**. Session-open rows leave action-specific columns null. |
| Action type | Choice | (Action rows only) Reservation created / modified / cancelled · User added / disabled / edited · Group created-or-edited · Resource catalog edited · Blackout window edited · Theme-or-settings changed. Extensible. Null on Session open. |
| Outcome | Choice | **Success** / **Blocked (conflict)** / **Failed (error)**. A blocked atomic-recurrence rejection lands as Action type = Reservation created, Outcome = Blocked. |
| Actor SF State ID | Text (9) | first 9 of UPN, set by the app from the **authenticated context** (not user input) |
| Actor display name | Text | snapshot — names change, freeze what was true then |
| Actor group snapshot | Memo | denormalized delimited list, e.g. `Biology; Field Gear`. **Frozen text, not a live reference.** Read live from `usergroupassignment` at action time, then write the names onto the row. |
| Action timestamp | DateTime | app-set moment of the action. Cross-check against system `createdon`. |
| Target type | Choice | Reservation / Resource / App User / Group / Blackout window / Theme-settings / (none for Session open) |
| Target ID | Text | GUID or business key of the acted-on record, snapshotted as text |
| Target label | Text | human-readable snapshot, e.g. `Microscope #3 — 2026-07-01 14:00–16:00` |
| Before state | Memo | snapshot of relevant fields *before* a modify (e.g. old start/end). Freeform. |
| After state | Memo | snapshot *after* a modify (e.g. new start/end). |
| Details | Memo | freeform extras — e.g. a blocked attempt's conflict count + first few conflicts. |
 
> **Why text, not relationships (don't "fix" later).** A lookup shows a record's *current* state;
> this table must preserve its *historical* state. If click-through to the live record is wanted for
> the most-read class (cancellations), add **one optional nullable lookup → Reservation Occurrence**
> *for navigation only* — never render historical state through it.
>
> **`createdon` is the immutable timestamp.** Dataverse stamps it server-side, uneditable, so the
> explicit Action timestamp is a cross-check, not the system of record. Large divergence = a tamper
> signal worth surfacing.
>
> **Honest limitation — flag for pen-testing.** With no service principal, the app writes these rows
> in the **signed-in user's context**, so every user needs *Create* on this table. That makes the log
> **tamper-resistant against edits/deletes** (Write/Delete = None for everyone) but **not
> forgery-proof against injection** — a determined raw-API user could write spurious rows or stamp a
> false actor. Accepted residual risk; the log's job is reconstructing legitimate activity, not
> defending against a sophisticated insider.
 
---
 
## Security-role plan (the real enforcement layer — NOT yet built)
 
Three **custom security roles** inside the solution, each hung on its own **Owner team** (role
granularity = **three teams, one per role**). These — not UI visibility — are what stop a non-admin
from touching data they shouldn't. The in-app role checks are **cosmetic** (which screens/buttons to
show); every real lock is a privilege below.
 
Per-table access levels: **None / User (own records) / Org (all records in this environment)**.
 
| Role | Catalog tables (ResourceType, AttributeDef, Resource, AttrValue, Group, the 3 junctions, Blackout, Settings) | Reservation Series + Occurrence (**User/team-owned**) |
|---|---|---|
| **sfsures Admin** | Full CRUD, **Org** | Full CRUD, **Org** |
| **sfsures Booker** (= User) | **Read (Org)** only | Create + Read **(Org** read so they see others' bookings for conflicts/calendar) + Write + Delete **(User — own records only)** |
| **sfsures Viewer** | **Read (Org)** only | **Read (Org)** only — no create/write/delete |
 
> **Booker is the role the ownership recreate exists for.** Because #10 and #11 are now
> **User/team-owned**, "Write/Delete @ User = own records only" is **platform-enforced**, not UI-only:
> a Booker's raw-API `PATCH`/`DELETE` against a *peer's* reservation returns **403**, because the
> row's `OwnerId` isn't theirs. A Viewer's raw-API *create* returns 403 (no Create). These are the
> holes the three-team + user-ownership design closes.
>
> **⚠ Member's privilege inheritance — set the Booker role to "Direct User (Basic) access level and
> Team privileges."** The role rides on the Booker **Owner team**. Under the *other* setting ("Team
> privileges only"), a member without their own user privileges creates rows **owned by the team** —
> so every Booker's reservation would be team-owned and editable by every other Booker, the exact
> failure being guarded against. "Direct User + Team privileges" gives the Booker Create **as a
> user**, so their row is owned by them personally and User-level write means "my own bookings only."
> This setting only matters for the User-level privileges on the reservation tables; Org/None
> privileges behave identically either way.
>
> **Pre-go-live inheritance test (must-do):** on the real tables, confirm a Booker editing their
> **own** occurrence returns 200 and editing a **peer's** returns 403. Only Org-level team
> inheritance was proven earlier; User-level via team is the case to verify deliberately. Also test
> **mid-session revocation** (does removing someone from a team cut access immediately or only on next
> launch — earlier access only updated after a clean reload).
 
### Audit Log privileges (separate — follows none of the patterns above)
| Role | `sfsures_auditlog` |
|---|---|
| **sfsures Admin** | **Create + Read @ Org.** Write = **None**, Delete = **None** (append-only, even for Admin). |
| **sfsures Booker** | **Create** (User or Org — both safe for append-only). Read / Write / Delete = **None**. |
| **sfsures Viewer** | **Create** (Viewers trigger session-open + blocked-attempt rows). Read / Write / Delete = **None**. |
 
Audit-log notes:
- **Write and Delete are `None` at *every* level — not User-level.** A User-level Write would let a
  Booker rewrite their own history — the exact tampering vector. Keep Write/Delete at None everywhere.
- **Create-without-Read is intentional** for Booker/Viewer: the app must **not** read audit rows back
  for regular users (it'll hit the silent-empty failure mode), and a failed audit write should be
  surfaced/queued, never block the user's actual action.
- **The "narrow admin path" for delete** is a *separate, segregated* retention/purge role assigned to
  no one by default — explicitly **not** part of the standard Admin role.
General role notes:
- All three sit on a baseline environment role (Basic User equivalent) so the user exists in the env.
- **Assign each role to its per-instance Owner team.** Onboarding = add the user to the Owner team
  (the role rides along, granting both data access and — via the app share to the team — app access).
  Offboarding = remove from the team (kills data access); the App User row stays disabled-not-deleted
  to preserve reservation history.
- Assigning security roles is a **System Administrator–tier** action.
- The startup access-gate is **defense-in-depth**, not the boundary. Keep it as a fail-safe.
---
 
## Ownership & continuity (so instances never orphan)
 
1. **Built in a solution** (Step 0) → the app is an environment asset, not "a person's app."
2. **Seat 2–3 named co-owners** on each published app. A co-owner can use, edit, and **share** — and
   **cannot delete** — the app, so separation doesn't freeze or delete anything.
3. **ITS admin reassignment is the ultimate backstop** — a Power Platform admin can set a new owner
   even on a fully orphaned app. Confirm the process with ITS and record the contact per instance.
4. **Group co-ownership caveat:** for an app *in a solution*, a security group can't be added as
   co-owner via the share GUI (greyed out) — needs a PowerShell cmdlet (ITS). Named individuals work
   in the GUI.
5. **Service / owner account** is an alternative to decouple from a person — treat as an ITS decision.
6. **Connections:** if a departed owner's connection breaks, a co-owner can re-authenticate it.
7. **Code-app caveat:** app sharing/ownership behavior is preview-era and documented for
   canvas/model-driven apps — verify code-app co-owner/share behavior before relying on it.
Record per instance: app owner, co-owners, the three access Owner teams, the ITS reassignment contact.
 
---
 
## Pre-publish verification checklist (the no-easy-return gate)
 
- [ ] **Reservation Series + Occurrence are User/team-owned** (system **Owner / Owning User / Owning
      Team** columns present); **all other 12 tables Org-owned**.
- [ ] On both reservation tables the custom owner lookup is **Booking Owner → App User**
      (`sfsures_BookingOwner`), renamed from "Owner" and distinct from the system Owner column.
- [ ] Resource Attribute Value has the **five typed Value columns**; **no JSON column**.
- [ ] User↔Group, Group↔ResourceType, Group↔Resource are **three separate junction tables**, each
      with two lookups — none collapsed into a single lookup; Access Level **default = View** on #8/#9.
- [ ] App User: SF State ID is the primary column **and** an Active unique **Alternate Key**.
- [ ] App User: `Dataverse User` (`sfsures_DataverseUser`) maps each active App User to the correct
      enabled human System User before delegated reservation ownership is enabled; relationship is
      Referential/Restrict Delete with no cascading assignment/deletion.
- [ ] Occurrence Start/End are real **DateTime**; Series lookup **optional**; Resource + Booking Owner
      denormalized onto it; primary is Autonumber `OCC-`.
- [ ] Blackout Window Reason is **Business Required**.
- [ ] Theme lives in `sfsures_appsettings` (single active row); hex stored **with `#`**; logo is a Box
      **raw** Text URL; no colors hardcoded anywhere.
- [ ] Audit Log: **Entry type** distinguishes Session-open from Action; group snapshot + target are
      **frozen text**, not lookups (or the lookup is nav-only); primary Autonumber `LOG-`.
- [ ] Autonumber prefixes set and live: `UGA-`, `GRTA-`, `GRA-`, `OCC-`, `LOG-`.
- [ ] Custom `sfsures_RecordStatus` used for business status everywhere — not platform `statecode`.
- [ ] **Three security roles** created and scoped: Admin = Org CRUD; Booker = Read@Org catalog,
      Create+Read@Org + Write/Delete@**User** on reservations; Viewer = read-only.
- [ ] **Booker role Member's privilege inheritance = "Direct User (Basic) access level and Team
      privileges."**
- [ ] Audit Log security: **Create** for all three roles; **Write = Delete = None at every level**,
      including Admin; **Read @ Org for Admin only**; segregated purge role for retention deletes.
- [ ] Three **Owner teams** created, each carrying its role (Manage security roles on the *team*);
      access confirmed to flow from team membership alone.
- [ ] Every table / role / team is **inside the `sfsures` solution**, not the default solution.
- [ ] ≥2 co-owners seated; ITS reassignment process confirmed.
### Tests to run before go-live (pen-testing roadmap)
- **Viewer raw-API booking attempt must 403** (no Create on reservations).
- **Booker User-level write inheritance:** own occurrence edit → 200; peer's occurrence edit → 403.
- **Mid-session revocation:** does removing from a team cut access immediately or only next launch?
- **Silent-empty read handling:** distinguish "empty because no bookings" from "empty because no read
  role" in the UI (a missing read role returns empty `.data`, not a 403).
- **Audit-log tamper-resistance:** edits/deletes blocked (Write/Delete None); injection is accepted
  residual risk.
- Delegation-ceiling tests on conflict detection + reports (the primary "passes demo, dies in
  production" failure mode); atomic-recurrence orphan/race edge cases; permission-leak across both
  group-access junctions.
Once this passes, publish. **After publish:** `npx power-apps init` → `add-data-source` per table →
build the calendar screen first (FullCalendar, occurrences as N blocks, blackout windows as
non-bookable background events).
 
