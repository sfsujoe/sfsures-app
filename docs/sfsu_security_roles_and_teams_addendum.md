# SFSU Reservation System — Runbook Addendum: Ownership Fix + Security Roles + Owner Teams

**Date:** June 26, 2026
**Phase:** Enforcement layer built. Resolved the Path A vs. Path B ownership fork, **recreated the two
reservation tables as User/team-owned**, **built all three security roles** (Viewer / Booker / Admin)
inside the solution, and **created the three Owner teams**, each carrying its one role. The privilege
model is no longer a plan — it physically exists end to end.

Addendum to `sfsu_reservation_system_progress.md`, `sfsu_codeapp_vscode_runbook_addendum.md`,
`sfsu_governance_and_claudecode_addendum.md`, `sfsu_onboarding_and_access_exploration.md`,
`sfsu_access_validation_and_logging_addendum.md`, and `sfsu_schema_build_complete_addendum.md`.
**Where this conflicts with earlier "next steps," this file wins** — the roles and teams now exist,
which supersedes the "build the roles" instructions in the older runbooks. The regenerated
`sfsu_dataverse_build_sheet.md` (June 26) is the matching as-built schema reference.

---

## Headline outcomes

1. **Path A vs. Path B RESOLVED → Path B.** Reservation Series and Reservation Occurrence are now
   **User/team-owned**; the other 12 tables stay Organization-owned. This is the only way to
   platform-enforce "a Booker edits/cancels their own reservations but not anyone else's."
2. **Tables 10 and 11 recreated** as User/team-owned, with the custom owner lookup **renamed
   "Owner" → "Booking Owner"** (`sfsures_BookingOwner`) on both, to keep it distinct from the
   auto-created system Owner column.
3. **All three security roles built** inside the `sfsures` solution (Viewer, Booker, Admin), each
   scoped per the build sheet, including the Audit Log append-only carve-out.
4. **Member's privilege inheritance = "Direct User (Basic) access level and Team privileges"** set on
   all three roles — load-bearing on Booker, a harmless no-op on Viewer/Admin.
5. **Three Owner teams created** (`sfsures Admins`, `sfsures Bookers`, `sfsures Viewers`), each
   carrying exactly its one matching role. Joe is Administrator on all three.
6. **Build sheet regenerated** to fold in the ownership change, the Booking Owner rename, and the
   inheritance-toggle requirement.
7. **Booker inheritance test deferred** (not run this session) — unblocked and on the must-do list
   for before go-live.

---

## The decision that drove the session: Path A vs. Path B

The uniform "all 14 tables Organization-owned" convention collided with the Booker role's intended
**Write/Delete @ User ("own records only")** on the reservation tables. The collision is mechanical:

- **Access levels are tiered (None / User / BU / Org) only on User/team-owned tables**, where each row
  has a system `OwnerId` for the engine to compare against.
- **On an Organization-owned table there is no per-row owner**, so a privilege collapses to **binary**:
  the user can do the operation on *all* rows of the table or on *none*. "User-level" is meaningless
  there.
- Therefore, on Org-owned reservation tables, Booker write would have to be **Org** (can edit
  everyone's bookings) or **None** (can't book at all). "Own records only" could only ever be an
  **app-layer** rule the platform doesn't back — and the custom `Owner`/`Booking Owner` lookup is
  **invisible to the security engine** (it reads `OwnerId` and roles, never a custom lookup).

**Path A** = keep Org-owned, accept "own records only" as UI-only (a Booker hitting the Web API could
edit/cancel any peer's reservation; audit log detects but doesn't prevent). **Path B** = make the two
reservation tables User/team-owned so the platform genuinely refuses a Booker's API call against a
peer's row (403).

**Chosen: Path B.** The clinching logic is the same one that settled three teams: the managed solution
travels to departments whose population Joe has never met, so the posture must be sized for the
**least trustworthy** population that will ever run it. Leaving Booker-can't-edit-others as UI-only
re-opens exactly the direct-to-table hole the whole "app is not the boundary" model exists to close.
Cost accepted: ownership type is fixed at creation, so Path B meant **recreating tables 10 and 11**
(no data, nothing published — rework + re-screenshot, not a disaster).

> **Scope check Joe raised and confirmed:** Bookers should *not* be able to edit each other's
> reservations. (If shared editing across Bookers were desired, Path A's Org-write would be the
> feature, not a bug, and the fork would dissolve. It isn't desired — hence Path B.)

---

## The two owners on the reservation tables (the model to keep straight)

| | System **Owner** (`OwnerId`, type Owner) | **Booking Owner** (`sfsures_BookingOwner`, Lookup → App User) |
|---|---|---|
| Set by | Platform, automatically = the signed-in user who created the row | App, = the SF State ID record the booking is *for* |
| Read by the security engine? | **Yes** — this is what User-level write/delete scopes against | **No** — business data, invisible to permissions |
| Purpose | The real per-record security boundary | Display, reporting, conflict-ownership, the immutable-ID chain |

In the normal flow (a Booker booking for themselves) both point at the same human, but they are
mechanically separate. The rename to "Booking Owner" exists precisely so the business lookup doesn't
get confused with the system Owner column.

---

## Key learning: the app is not the boundary; the security role is

The concrete question Joe posed — *can Scott, added as a test user, fire up Power Apps and add rows to
a table outside the reservation app?* — surfaced the principle cleanly:

- **Every Dataverse client authenticates as the user and is checked against the same role privileges.**
  The code app, the **Web API** (`POST`/`PATCH` from a browser console), the Excel Dataverse
  connector, a Power Automate flow, Power BI — all are different doorknobs on the same door. The app
  has no special standing; it runs in the user's context and gets exactly what the user's role allows.
- So "can Scott add rows outside the app?" reduces entirely to **"does his role grant Create on that
  table?"** If yes, he can `POST` to the Web API with no app involved. If only Read, the write is
  **403** (and a *write* 403 is loud in the console, unlike the silent-empty *read* failure).
- **Maker-portal grid editing is *additionally* gated** by customization privileges (Environment
  Maker / System Customizer), which a data-only role wouldn't include — so a plain Booker/Viewer
  likely can't even see the tables in make.powerapps.com. **But that buys nothing**, because the Web
  API path needs none of those maker privileges; it's gated purely by table **data** privileges.
- **In-app role checks are cosmetic** — they decide which screens/buttons show, nothing more. A curious
  user with dev tools ignores all of it. Every real lock is a security-role privilege on a table.

This is the direct justification for Path B (and for three teams, and for the audit-log injection
caveat): assume someone will hit the tables directly, bypassing the app.

---

## As-built: the three security roles (inside the `sfsures` solution)

All three created via PPAC **+ New role** (which pre-seeds the **App Opener** baseline — kept, not
stripped), then table privileges set in the classic grid. All three set to **Member's privilege
inheritance = "Direct User (Basic) access level and Team privileges."** All three added to the
solution as components (verified: solution shows **Security roles (3)** + 14 tables = 17 objects).

**Access-level shorthand:** Org = all rows in this environment · User = own records only · None.

### `sfsures Viewer`
| Tables | Privileges |
|---|---|
| All 13 non-audit tables (catalog + both reservation tables) | **Read @ Org**; everything else None |
| `sfsures_auditlog` | **Create @ Org**; Read/Write/Delete = None |

Read @ Org on reservations lets a Viewer see the calendar; Create-without-Read on the audit log lets
them write session-open / blocked-attempt rows without ever reading or altering the log.

### `sfsures Booker`
| Tables | Privileges |
|---|---|
| Read-only catalog (ResourceType, AttributeDefinition, ResourceAttributeValue, Group, UserGroupAssignment, GroupResourceTypeAccess, GroupResourceAccess, BlackoutWindow, AppSettings) | **Read @ Org**; everything else None |
| **Resource** and **App User** (lookup targets) | **Read @ Org + Append To @ Org**; everything else None |
| **Reservation Series** and **Reservation Occurrence** (User/team-owned) | **Create @ Org · Read @ Org · Write @ User · Delete @ User · Append @ User · Append To @ User · Assign = None · Share = None** |
| `sfsures_auditlog` | **Create @ Org**; Read/Write/Delete = None |

Read @ Org on reservations = sees everyone's bookings for conflict detection/calendar; Write/Delete @
User = touches only their own. Append To @ Org on Resource and App User = any Booker's reservation may
point at any resource/user. **Assign = Share = None on the reservation tables** is the orphan-cell fix
Joe caught (see learnings) — without it, Assign @ Org would let a Booker reassign a peer's reservation
to themselves and then edit it, a clean bypass of own-records-only.

### `sfsures Admin`
| Tables | Privileges |
|---|---|
| All 13 non-audit tables | **Full Access** (Create/Read/Write/Delete/Append/Append To/Assign/Share, all @ Org) |
| `sfsures_auditlog` | **Create @ Org + Read @ Org**; **Write = Delete = Append = Append To = None** (append-only **even for Admin**) |

Assign/Share @ Org on the reservation tables is **correct for Admin** (trusted, manages ownership and
transfers) — the None rule is Booker/Viewer-specific. Audit Log Write/Delete None even for Admin is
what keeps the log tamper-resistant against rewriting history; the only delete path is the **separate,
segregated purge role** (assigned to no one by default), still to be built.

---

## As-built: the three Owner teams

PPAC → Settings → Users + permissions → Teams → **+ Create team**. Then **tick the team's checkbox →
Manage security roles → check its one role → Save** (roles are *not* on the team edit page — the
checkbox→Manage command is both the view and the edit surface).

| Team | Team type | Role carried | Administrator |
|---|---|---|---|
| `sfsures Admins` | **Owner** | `sfsures Admin` | Joe |
| `sfsures Bookers` | **Owner** | `sfsures Booker` | Joe |
| `sfsures Viewers` | **Owner** | `sfsures Viewer` | Joe |

- **Team type Owner is non-negotiable** — only an Owner team can carry a security role and have
  members inherit it. (Access team = record-sharing only, can't hold a role. Entra/Office group team
  = reintroduces the ruled-out Entra dependency.)
- **The Administrator field is an admin pointer, not a privilege grant** — it names who manages the
  team's membership; it does *not* assign the role to that person or make them a member. Joe as
  administrator of the Bookers team is **not** thereby a Booker. This is the delegable handle: point
  it at a non-technical department lead later so they can run onboarding without any other access.
- Onboarding = add the user to the team (role rides along). Offboarding = remove from the team (kills
  data access); App User row stays disabled-not-deleted to preserve history.

> **Other teams visible in the Teams list (don't touch / cleanup):** the `orgdaa34530` Owner team is
> the environment's auto-created **default team** — leave it. The `Message Board T…` Owner team is the
> leftover from the June 24 throwaway message-board app — harmless, deletable whenever that test
> table/app is cleaned up (outside the `sfsures` namespace). The SYSTEM-administered teams are
> platform-internal.

---

## Learnings / clarifications this session

- **Binary vs. tiered access is a function of record ownership.** Org-owned → binary (can/can't).
  User/team-owned → tiered (None/User/BU/Org). This is *the* reason Path B was necessary and the
  reason the two reservation tables are the lone ownership exceptions.
- **Ownership type is fixed at table creation** — confirmed; changing it means recreating the table
  (the only supported route; an unsupported XML hack exists but isn't for a production-bound system).
- **Append vs. Append To** (constantly confused, and backwards from first read):
  - **Append** = privilege on the record *holding* the lookup (the "many"/child side, the record doing
    the pointing).
  - **Append To** = privilege on the record being *pointed at* (the "one"/parent side, the lookup
    target — "can something be appended *to* me").
  - A link checks **both** simultaneously, one on each table. E.g. a Booker creating an Occurrence that
    references a Resource needs **Append on Occurrence** *and* **Append To on Resource**. Reading an
    existing lookup needs neither — only Read on both tables (hence Viewer has both at None).
  - Note: Booker's **Append To @ User on Reservation Occurrence** is currently unexercised surplus
    (nothing points *at* an occurrence yet — the audit log is frozen text with no nav-lookup). It's
    User-scoped so grants zero extra reach; left for symmetry in case the optional audit→occurrence
    nav-lookup is added later. Series's Append To @ User *is* used (occurrences point at series).
- **Assign and Share are owner-record privileges** — they only mean something on User/team-owned
  tables (Assign = change a record's owner; Share = grant record-level access). On Org-owned tables the
  cell value is **inert** regardless of setting. The reservation tables are the *only* place in the
  schema where these are live — which is why Joe spotted them as orphans there. **Assign @ Org on a
  non-admin is a real escalation** (reassign a peer's row to self → then edit under User-level write);
  None for Booker/Viewer closes it.
- **A new role from "+ New role" is not blank** — it carries the App Opener minimum privileges (the
  bits that let someone open the app). Keep them; add table privileges on top. The org-level Process
  (flows) read in that baseline can be lowered to User later if pen-testing flags it — left alone for
  now to avoid a load failure.
- **Permission Settings column labels:** "Reference" = the built-in Read-only preset; "Full Access" =
  the all-Org preset; "Custom" = a bespoke combination (Read+AppendTo, or the audit-log
  Create-without-Read, or Admin's audit-log carve-out) that matches no preset. Informational only.
- **The team list view doesn't show assigned roles** — must verify per team via checkbox → Manage
  security roles. (Same gotcha as viewing role assignments generally.)

---

## Still open (carry forward)

1. **Booker User-level inheritance test — DEFERRED, still must-do before go-live.** On real
   reservation rows: a Booker editing their **own** occurrence → 200; a *different* Booker editing
   that **peer's** occurrence → 403. **Wrinkle:** Joe's System Administrator role masks the 403 (every
   call succeeds as sysadmin), so the test needs a **non-admin identity** for at least one Booker
   (Scott is the natural fit). Run via the Web API directly (no app needed — and the API is the
   attacker's path anyway). This is the live proof Path B + the inheritance toggle actually enforce
   own-records-only at the platform.
2. **Mid-session revocation test** — does removing someone from a team cut access immediately or only
   on next launch? (June 24 access only updated after a clean reload.) Membership-driven; runs
   alongside the inheritance test.
3. **Segregated purge role** for audit-log retention deletes — not yet built; assigned to no one by
   default; explicitly *not* part of standard Admin.
4. **Custom role creation in the ITS-governed PROD environment** — confirmed in dev only.
5. **System Administrator on the (future) PROD environment** — the grant that unlocks team creation;
   folds into the one-time env-provisioning ask. Joe still can't create environments.
6. **First-admin + active-theme + three-Owner-teams seed at deploy** — concrete steps so a fresh
   instance is usable without an app-layer privilege land-grab.
7. **≥2 co-owners + ITS reassignment backstop** per instance — ownership/continuity, not yet seated.

---

## Doc-hygiene loose ends (do on the next docs pass)

- **Build sheet Booker row:** already regenerated to include the ownership change and Booking Owner
  rename; confirm it also states **Assign = Share = None on both reservation tables** (the orphan-cell
  fix) and that **Admin's Assign/Share @ Org is correct-for-Admin**, so replication doesn't
  relitigate them.
- **`sfsu_schema_build_complete_addendum.md` carries stale facts** ("all 14 tables Organization-owned,"
  "Owner" on reservation tables). Add a **superseded header** pointing to this addendum + the June 26
  build sheet, so a future pass (or Claude Code session) doesn't surface the wrong ownership facts.
  Retain the file for its decision rationale; only the ownership/naming facts are stale.

---

## Immediate next steps

1. **Run the pre-publish verification checklist** in the build sheet — most items are now satisfied
   (ownership split ✓, Booking Owner rename ✓, three roles ✓, three Owner teams ✓). Confirm the
   remaining schema items (typed Value columns, three junctions, SF State ID alternate key, Occurrence
   denormalized + optional Series, Blackout Reason required, theme single active row, audit-log
   frozen-text + append-only).
2. **Seat ≥2 co-owners + confirm the ITS reassignment process** (ownership/continuity).
3. **Publish.**
4. **After publish:** `npx power-apps init` → `add-data-source` per table → **build the calendar
   screen first** (FullCalendar, occurrences as N blocks, blackout windows as non-bookable background
   events).
5. **Before go-live, run the pen-testing roadmap:** the deferred Booker inheritance test (own→200,
   peer→403), mid-session revocation, Viewer raw-API booking attempt (must 403), silent-empty read
   handling, audit-log tamper-resistance, delegation-ceiling tests on conflict detection + reports,
   atomic-recurrence edge cases, permission-leak across both group-access junctions.

---

## How to resume

Open next session with: **"Enforcement layer is built — three roles + three Owner teams exist, tables
10/11 are User/team-owned. Pick up at the pre-publish checklist (or run the deferred Booker
inheritance test if a non-admin identity is ready)."** `sfsu_dataverse_build_sheet.md` (June 26) +
this addendum are the live source of truth for the schema and enforcement layer. `CLAUDE.md` was not
regenerated this session — fold these directives in when the VS Code / app-build phase begins.
