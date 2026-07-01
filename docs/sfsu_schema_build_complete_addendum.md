# SFSU Reservation System — Runbook Addendum: Schema Build Complete + Role Granularity + Theme Picker

**Date:** June 25, 2026
**Phase:** Hands-on schema build. **All 14 Dataverse tables hand-built** in the
make.powerapps.com designer, in dependency order, each screenshotted and reviewed.
Both named regression risks cleared *in actual schema* (not inferred from plan prose).
Role granularity fork **resolved**. Theme handling **redesigned** into an admin picker.

Addendum to `sfsu_reservation_system_progress.md`, `sfsu_codeapp_vscode_runbook_addendum.md`,
`sfsu_governance_and_claudecode_addendum.md`, `sfsu_onboarding_and_access_exploration.md`, and
`sfsu_access_validation_and_logging_addendum.md`.
**Where this conflicts with earlier "next steps," this file wins** — the schema now physically
exists, which supersedes the "build the tables" instructions in the older runbooks.

---

## Headline outcomes

1. **The entire 14-table schema is built.** Resource model, users/groups/access cluster,
   reservations cluster, theming, and the audit log — all hand-built in the designer, dependency
   order, Organization-owned, `sfsures` prefix throughout. The hardest structural work of the
   project is done and reviewed table by table.
2. **Both flagged regression risks cleared in real schema:** typed Value columns on
   Resource Attribute Value (five distinct typed columns, no JSON), and the two group-access
   junctions built as **separate explicit junction tables** carrying Access Level (not native N:N).
3. **Role granularity RESOLVED → three Owner teams, one per role** (Admin / Booker / Viewer).
4. **Theme handling redesigned → admin Theme picker (Option A: hardcoded presets).** Schema
   impact was one optional column; the rest is app-layer.
5. **Write-once SF State ID locked** as a build directive.
6. **Process decision:** the Claude browser extension will **not** be used in the VS Code phase —
   the current screenshot-review-in-chat workflow stays. No `CLAUDE.md` regenerated this session
   (deliberate; this addendum is the capture instead).

---

## Decision 1 — Role granularity RESOLVED: three Owner teams, one per role

**Decided: three Owner teams (Admin, Booker, Viewer), each carrying its corresponding security
role.** This closes the fork left open on June 18 and "leaning but not nailed" on June 24.

**Why three, not fewer — the reasoning that settled it:**
- The decision is equivalent to asking, *for each boundary between roles, is it enforced by
  Dataverse or only by app UI?* A team carries one role = one privilege set; every boundary you
  want the **platform** to enforce needs its own team.
- **One team** was rejected outright: it gives a Viewer and an Admin identical Dataverse rights
  (no hard admin boundary at all), and it would force re-adding an app-role column to App User —
  the exact writable-privilege land-grab surface the cold-start analysis warned against.
- **Two teams** (Admins + Users) hard-enforces the admin boundary but leaves every Viewer with
  **Booker-level Create on reservations**, because they'd sit in the same Users team carrying the
  Booker role. A Viewer with browser dev tools could POST a `sfsures_reservationoccurrence` row
  directly and the platform would accept it. The UI hides the Book button; the privilege is really
  there.
- **Three teams** makes the UI and the platform agree completely: a Viewer has **no Create** on
  reservations, so a crafted raw-API booking returns 403, not a rogue row.

**The clinching argument (Joe's):** "small and I trust everyone" is a property of *this* instance
and evaporates the moment a managed solution is exported into a department whose population Joe
has never met. The per-department replication model means the security posture is built once and
travels unchanged, so it must be sized for the **least trustworthy** population that will ever run
it. Assume someone, somewhere, will try to hit the Dataverse tables directly, bypassing the app.
Three teams is the only option where every role boundary survives that.

**What three teams concretely buys against a direct-to-table attacker:**
- A **Viewer** crafting a raw create-reservation call → **403** (Read@Org only; Create/Write/Delete
  None). With two teams this would have *succeeded* — the hole three teams closes.
- A **Booker** can create + read all (for conflict checks) + write/delete **own** reservations;
  cannot touch any catalog table (Read-only) or modify others' bookings — enforced server-side.
- The **catalog** (resources, attribute defs, groups, both junctions, blackout, theme) is
  Read-only for both non-admin roles at the platform level — the instance's configuration is
  locked to Admins regardless of UI.

**The one thing three teams does NOT close (flag, don't over-trust):** the **audit log**. Every
role needs Create there (Viewers trigger session-open + blocked-attempt rows), and with no service
principal, Create is necessarily open to the client — so a determined raw-API user can *inject*
spurious audit rows or stamp a false actor. They still can't *alter or delete* existing rows
(Write/Delete None for everyone, including Admin), so the log stays tamper-resistant against
rewriting history, just not injection-proof. This is the accepted residual already documented; team
count doesn't change it.

**Downstream consequences (now locked):**
- Deploy-time seeding = **three Owner teams per instance**, each carrying its role, alongside the
  first-admin + active-theme seed. Identical across departments, so zero replication cost.
- The open **Booker User-level team-inheritance test** is now the one that matters (see Still Open).

---

## Decision 2 — All 14 tables built (conventions applied uniformly)

Built top-to-bottom in dependency order. Every table screenshotted and column-checked against the
build sheet before moving on. Conventions held across **every** table:

- **Record ownership = Organization** on all 14. None has a natural per-row human owner at the
  platform level (the "Owner" columns on reservations are lookups to App User — business data, not
  Dataverse record ownership). Org ownership also makes the broadest, simplest security scope (Org)
  automatically safe per the per-department-environment isolation.
- **Custom `sfsures_RecordStatus` Choice** for business status — never the platform `statecode`
  (which carries deactivation behavior that conflicts with app meaning). Display-named
  "Record Status" to avoid colliding with the system "Status" column.
- **`sfsures` prefix** confirmed live at the first table's schema name (`sfsures_ResourceType`) —
  the one irreversible choice, verified the moment it landed rather than from a publisher screenshot.
- **Table (advanced properties)** creation path throughout, for schema-name visibility.
- **Autonumber primaries** on tables with no human name (junctions, Occurrence, Audit Log), each
  with a **distinct prefix**: `UGA-`, `GRTA-`, `GRA-`, `OCC-`, `LOG-`. Tables with a real
  human-typed name (Resource Type, Resource, Group, Reservation Series, Blackout Window,
  App Settings) keep a **text** primary.

### Table-by-table summary (custom columns; system columns omitted)

| # | Table (`sfsures_…`) | Custom columns of note |
|---|---|---|
| 1 | resourcetype | Description, Reminder lead time (hrs), Notify owner (Y/N, dflt Yes), Additional reminder recipient, Record Status (Active/Inactive) |
| 2 | attributedefinition | **Resource Type (Lookup → Resource Type)**, Data type (Choice T/N/DT/Bool/Choice, **Business Required**, dflt Text), Required (Y/N), Choice options (Memo), Display order (Whole#) |
| 3 | resource | Resource Type (Lookup), Description, Location, Record Status (Active/**Disabled**) |
| 4 | resourceattributevalue | ⚠ Resource (Lookup), Attribute Definition (Lookup), **ValueText / ValueNumber (Decimal) / ValueDateTime / ValueBoolean / ValueChoice** — five distinct typed columns, **no JSON** |
| 5 | appuser | ⚠ **SF State ID = primary Text(9) + Active Alternate Key** (`sfsures_sfstateiduniquekey`), Display Name, Email, Record Status (Active/Disabled). **No app-role column** (roles live in security roles) |
| 6 | group | Description, Record Status (Active/Inactive) |
| 7 | usergroupassignment | autonumber `UGA-`; **User (Lookup → App User)**, **Group (Lookup → Group)**. No Access level, no status |
| 8 | groupresourcetypeaccess | ⚠ autonumber `GRTA-`; **Group (Lookup)**, **Resource Type (Lookup)**, **Access Level (Choice Book/View, dflt View)** — explicit junction, BROAD |
| 9 | groupresourceaccess | ⚠ autonumber `GRA-`; **Group (Lookup)**, **Resource (Lookup)**, **Access Level (Choice Book/View, dflt View)** — explicit junction, SURGICAL |
| 10 | reservationseries | Resource (Lookup), **Owner (Lookup → App User)**, Frequency (Choice), Interval, Days of week, Range start, End mode (Choice), Until date, Occurrence count, Record Status (Active/Cancelled) |
| 11 | reservationoccurrence | ⚠ autonumber `OCC-`; **Series (Lookup → Series, OPTIONAL)**, **Resource (Lookup, denormalized)**, **Owner (Lookup → App User, denormalized)**, Start, End, Record Status (Active/Cancelled) |
| 12 | blackoutwindow | Resource (Lookup), Start, End, **Reason (Memo, Business Required)**. No Owner, no status |
| 13 | appsettings | Primary/Accent/Background color (Text, hex **with `#`**), Logo (Text URL), Font family, Border radius (px), Is Active (Y/N), **Selected Theme Name (Text)** ← added this session |
| 14 | auditlog | ⚠ autonumber `LOG-`; Entry type / Action type / Outcome / Target type (Choice ×4, local), Actor SF State ID, Actor display name, Actor group snapshot (Memo), Action timestamp, Target ID, Target label, Before state (Memo), After state (Memo), Details (Memo). **No lookups, no status** (frozen text-snapshot design) |

### Identity-model continuity confirmed
- **App User:** SF State ID primary + alternate key Active = database-enforced uniqueness.
- **Owner → App User** confirmed on **both** Reservation Series and Reservation Occurrence (not
  `systemuser`). The full ownership chain runs through the stable SF State ID record, not raw Entra
  identities — the immutable-ID design holds all the way into the reservation tables.

### Delegation-critical denormalization (Reservation Occurrence)
Resource + Owner are **real columns on Occurrence**, duplicated from the parent Series on purpose.
Conflict detection asks "does any occurrence for *this resource* overlap this window" — for that to
delegate server-side, Resource must live on the Occurrence row, not be reached via a Series hop.
Occurrence and Blackout Window share the same Resource + Start + End shape, so **one delegable
overlap query** checks bookings and maintenance together. Series lookup is **optional** so a single
non-recurring booking is one Occurrence with null Series.

---

## Decision 3 — Write-once SF State ID (build directive)

SF State ID on `sfsures_appuser` is **write-once**:
- App pulls it from **Office365Users** at user-record creation and writes it **exactly once**.
- **Never exposed as editable** in any UI thereafter; rendered read-only.
- Post-creation uses are **identity lookup, search, and reporting only**.
- The platform *permits* editing a primary column and the alternate key tolerates the edit
  (re-points to the new value, rejects duplicates) — but editing it would silently reassign every
  reservation / membership / audit entry tied to that ID to a different human. So the constraint is
  **app-layer**, same family as disable-not-delete: the platform allows it, the business rules forbid
  it, and the schema cannot enforce it.

---

## Decision 4 — Theme handling redesigned: admin Theme picker (Option A)

**Change:** instead of Joe (or future-Joe) setting colors at instance spin-up, admins get a
**Theme screen** to pick from pre-built, official-SFSU-palette options.

**Chosen: Option A — presets hardcoded in the app**, not stored in a Dataverse table.
- Rationale: the SFSU palettes are a **fixed, developer-known set, identical across every
  department instance**. That is exactly what belongs in *code*, not data ("everything identical
  across instances lives in code; everything that varies lives in data"). A preset table would just
  reintroduce per-instance seeding for something nobody edits at runtime. A data table (Option B)
  would only be right if admins defined their *own* custom presets — which they explicitly don't.

**Schema impact:** essentially none. `sfsures_appsettings` still stores the **resolved** hex colors
and is still read once at startup. Added **one** column, `sfsures_SelectedThemeName` (Text), purely
so the picker can show/re-highlight the active preset. The rendering layer is unchanged — it reads
colors from the active settings row; *how* they got populated (typed vs. picked) is upstream and
invisible.

**Theme-screen build directives (app-layer; carry to the screen-building phase):**
1. **Presets as a hardcoded `SFSU_THEMES` constant** (official palettes). Picking one writes
   resolved hex **+ logo URL** into `sfsures_appsettings` and sets `SelectedThemeName`.
2. **Free-form escape hatch retained** — admins may enter **custom hex** and a **custom logo URL**.
   Don't build the form to forbid raw values (preserves the ability to handle a palette tweak or an
   approved one-off without a redeploy). Validate format: hex starts with `#` and parses; logo URL
   is well-formed `https://`.
3. **"Default" button resets colors *and* logo URL** to the baseline (`SFSU_THEMES[0]`) and restores
   `SelectedThemeName` to the default preset. Self-contained, no data lookup, identical per instance.

**Logo storage decision:** **Text URL**, not an Image column. A URL drops straight into a React
`<img src>`; an Image column stores binary needing the SDK's `downloadImage` plumbing. Hosting on
**Box**. ⚠ **Box caveat:** a Box *shared link* often serves a viewer page, not the raw file — use the
**direct/raw image link**; sort this in Box's sharing settings when wiring it up.

**Hex storage convention:** store hex **with the leading `#`** (`#442C8B`, `#DCAE27`, `#FFFFFF`).
CSS requires the `#`; storing it bare would force an error-prone `'#' + value` prepend on every read.
Store the value in the form the consumer (CSS) wants it. Apply uniformly across all three color
columns.

---

## Clarifications / learnings this session

- **Primary-column *data* is fully editable; only the column *type* is locked to text.** Earlier
  "can't be retyped" referred to the type, not the values. Renaming a resource ("Ford" → "Ford
  F-150") is safe and won't break existing reservations, because relationships key on the **GUID**,
  not the display name. Rename freely; the only discipline is giving resources distinct names so the
  human-facing lookup isn't ambiguous.
- **Name vs. Status asymmetry, resolved by principle.** Reuse the built-in primary **Name** column
  because its built-in behavior (default label shown in lookups/search) *matches* intent. Reject the
  built-in **statecode** because its built-in behavior (row deactivation, view-hiding, SDK state)
  *conflicts* with the business "active/inactive" meaning. Same question — "does the platform's
  treatment of this column help or fight what I want?" — honest answer lands on opposite sides.
- **Lookup vs. Customer.** Use **Lookup** (single target table). **Customer** is a polymorphic
  Account-or-Contact lookup (CRM heritage) — wrong here; there are no Accounts/Contacts.
- **Autonumber not offered at table creation in this environment's UI.** Create with a plain text
  primary, then **convert the primary to Autonumber via the column editor** post-create. Clean on an
  empty table (nothing to retro-number). Set a **Prefix** so IDs are self-identifying across the
  several autonumber tables (`UGA-` etc.) — without one they all read `1000, 1001…` and a bare ID
  tells you nothing about its table.
- **Default Access Level = View (fail-safe).** Joe's call, and the right one: a grant that
  accidentally over-permits is a security gap; one that under-permits is a help-desk ticket. Pick the
  side where the failure mode is annoying, not dangerous. Mirror this default in the app's create
  form when built.
- **Alternate key provisioning shows a status.** It builds an index in the background and flips to
  **Active**; only "Active" confirms enforcement (instant on an empty table).
- **Tool/designer pluralization stays naive** (carried from prior sessions) — when generating
  services later, read `src/generated/` filenames verbatim; don't guess.

---

## Process decision

- **Claude browser extension will NOT be used in the VS Code phase.** The current process —
  step-by-step guidance with screenshot review in chat — is working; switching mid-flight and
  shuttling context between two surfaces isn't worth it. Keep the established workflow.
- **No `CLAUDE.md` regenerated this session** (deliberate). This dated addendum is the capture.
  When the VS Code/app-build phase begins, fold the still-relevant directives below into `CLAUDE.md`
  then.

---

## Still open (carry forward)

1. **Security roles NOT yet built.** The schema is structurally complete but **not yet *safe***:
   the Audit Log's append-only protection (Write = Delete = None at *every* level including Admin;
   Create for all three roles; Read @ Org for Admin only) is configured at the **role stage**, not
   on the table. Until the roles exist, the audit log would permit Write/Delete like any table. This
   is the immediate next step, not a gap in the build.
2. **Booker User-level write on Org-owned tables** — because all tables are Organization-owned,
   "Booker writes own records only" cannot lean on Dataverse record-ownership; it leans on **app
   logic + the Owner lookup**. This is the still-open **Booker team-inheritance test** (only Org-level
   inheritance was proven on June 24). Decide consciously when building the Booker role; test
   deliberately on the real tables before go-live.
3. **Mid-session revocation test** — does removing someone from a team cut access immediately or only
   on next launch? (June 24 access worked only after a clean reload.) Matters for offboarding.
4. **Custom role creation in the ITS-governed PROD environment** — confirmed in **dev only**.
5. **System Administrator on the (future) PROD environment** — the grant that unlocks team creation;
   folds into the one-time env-provisioning ask. Joe still can't create environments.
6. **First-admin + active-theme seed at deploy** — concrete steps so a fresh instance is usable
   without an app-layer privilege land-grab. Now also includes **seeding the three Owner teams**.

---

## Immediate next steps

1. **Build the three security roles** (sfsures Admin / Booker / Viewer) inside the solution, per the
   build sheet privilege grid:
   - **Admin:** full CRUD @ Org across catalog + reservations.
   - **Booker:** Read @ Org on catalog; Create + Read @ Org on reservations, Write + Delete @ **User**
     (own records only).
   - **Viewer:** Read @ Org on catalog + reservations; no create/write/delete.
2. **Apply the Audit Log security treatment** (the one table that follows none of the above):
   **Create** for all three roles; **Read @ Org for Admin only**; **Write = Delete = None at every
   level, including Admin.** The narrow purge path is a *separate* segregated retention/purge role,
   assigned to no one by default.
3. **Create the three Owner teams**, hang each role on its team (Manage security roles on the
   *team*). Confirm access flows from team membership alone.
4. **Run the pre-publish verification checklist** (typed Value columns ✓; three separate junctions
   ✓; SF State ID primary + alternate key ✓; Occurrence denormalized + DateTime ✓; Blackout Reason
   required ✓; theme single active row; audit-log entry-type + frozen-text + append-only security;
   everything inside the `sfsures` solution; ≥2 co-owners + ITS reassignment contact).
5. **Publish.** Then `npx power-apps init` → `add-data-source` per table → **build the calendar
   screen first** (FullCalendar, occurrences as N blocks, blackout windows as background events).
6. **Carry the pen-testing roadmap forward:** Viewer raw-API booking attempt (must 403), Booker
   User-level write, mid-session revocation, silent-empty read handling, audit-log tamper-resistance.

---

## How to resume

Open next session with: **"Schema is fully built (all 14 tables). Pick up at the security roles —
the three roles + the Audit Log append-only treatment + the three Owner teams."** The schema build
happened in the browser with screenshot review in chat; that workflow continues (no browser
extension). This file + `sfsu_dataverse_build_sheet.md` are the source of truth. `CLAUDE.md` was not
regenerated this session — fold the directives above into it when the VS Code/app-build phase begins.
