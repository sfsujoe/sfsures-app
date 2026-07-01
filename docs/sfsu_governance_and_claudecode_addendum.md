# SFSU Reservation System — Runbook Addendum: Claude Code + Governance/Architecture

**Date:** June 13, 2026
**Phase:** Workspace + governance. The VS Code build path was already proven (June 9 addendum);
this session stands up the real workspace, makes it context-aware via Claude Code, retires the Vibe
tool, and locks the schema-authoring, multi-instance, access-layer, and ownership decisions that
shape the Dataverse build.

Addendum to `sfsu_reservation_system_progress.md` and `sfsu_codeapp_vscode_runbook_addendum.md`.
Where this conflicts with the older runbooks' "next steps," **this file and `CLAUDE.md` win.**

---

## Headline outcomes

1. **Claude Code (VS Code extension) is installed and context-aware.** It loads a self-contained
   `CLAUDE.md` at session start and answers project questions from it — the context bridge works.
2. **Vibe is retired** — not used for the app and not used for the schema.
3. **Schema will be hand-built in the make.powerapps.com designer**, reviewed via screenshots.
4. **Replication strategy locked:** separate per-department instances, stable system-scoped prefix,
   solution-based deployment.
5. **Access architecture clarified into three layers**, with Dataverse security roles as the real
   enforcement boundary — not UI gating.
6. **Ownership/continuity plan set** so instances never orphan when a maker leaves.
7. **Deliverables produced:** self-contained `CLAUDE.md` and `sfsu_dataverse_build_sheet.md`.

---

## Decisions this session (and why)

### 1. Claude Code as the VS Code AI pair; context via a self-contained CLAUDE.md
- The claude.ai Project memory and uploaded files do **not** flow into Claude Code automatically —
  separate products. Claude Code reads context from the **filesystem** (`CLAUDE.md` + `docs/`).
- `@`-imports load the referenced file's full content at **session start** — same context cost as
  inlining. So "import vs inline" doesn't save context; importing *everything* just bloats every
  session with background docs and dilutes the rules.
- **Chosen:** a single, self-contained `CLAUDE.md` that **inlines the always-on build rules**,
  carries an authoritative "current direction," and **demotes the docs/ runbooks to on-demand
  historical reference** (no `@`-imports). This fixed the real problem behind the first smoke-test
  "hiccup": Claude Code surfaced `progress.md`'s **stale, Vibe-era next steps**. Stale content, not
  the import mechanism — inlining stale text would just relocate it.
- Session loop now points at `CLAUDE.md`: regenerate it at session end, swap it in, auto-loads next
  session. (Same habit as the old runbook swap.)

### 2. Separate per-department instances over one campus-wide app
- A single campus app forces a two-tier admin model (Campus Admin over Unit Admins) **and**
  row-level unit scoping on every admin action — the exact "passes the demo, leaks in production"
  surface to avoid before Oct 1, and the hardest thing to pen-test.
- Separate instances keep the **flat Admin/User/Viewer model** unchanged, give **hard data
  isolation**, and make white-label branding native.
- **Cost accepted (eyes open):** N instances = N upgrade targets. Mitigation: ship downstream as a
  **managed solution** (import the new version into each env). Single-digit instances are easily
  managed. True isolation means an **environment per department** — and environments are the thing
  Joe can't provision, so each new department = an ITS environment request.

### 3. Stable, system-scoped publisher prefix `sfsures`
- A Dataverse prefix is **permanently fused** into every logical name and cannot be renamed.
- A department-scoped prefix (e.g. `cose_`) would force a rebuild per department — the opposite of
  trivial replication.
- **Chosen:** one stable, app-scoped prefix (`sfsures`) identical across all instances. Identical
  logical names → identical generated `*Service.ts`/`*Model.ts` → **zero per-department app code
  change**. Everything that varies between departments lives in **data** (theme, catalog, groups,
  users), never in schema or code. *(Confirm the exact prefix before building — it's the one
  irreversible choice.)*

### 4. Schema hand-built in the designer (Vibe retired for schema too)
- Vibe was doing two jobs: generating the app *and* authoring tables. VS Code replaces only the app
  job — `add-data-source` **consumes** a published schema, it doesn't author one.
- **Chosen:** hand-build the ~13 tables in the make.powerapps.com table designer (GUI-first, fully
  owned, immune to Vibe instability). The whole schema is already designed in prose across the
  runbooks, so this is careful transcription, not design-from-scratch. Claude Code can't provision
  Dataverse; table authoring happens in the browser, reviewed here via **screenshots**.

### 5. Access model = three distinct layers (the key correction)
App-level sharing does **not** obviate the access work; it collapses three layers that are actually
separate:
- **App access** (who can open the app) — handled by sharing, ideally to an **Entra security
  group**. This *can* replace the startup access-gate's gatekeeping role.
- **In-app role gating** (Admin vs User once inside) — sharing is binary and does **not** touch
  this. This is where the "`Visible=false` still executes" risk lives.
- **Data access** (can the rows be read/written by *any* client) — **Dataverse security roles** are
  the only real boundary. Hiding data in the UI is not protection if the table is reachable.
- **Net design:** access flows from membership in a per-instance Entra security group that carries
  **both** the app share **and** the Dataverse security role; onboarding = add to group (delegable
  to a group owner, no Power Platform admin needed). The startup lookup stays for identity/role
  resolution + disable/history. The access-gate is demoted to **defense-in-depth**. Real
  enforcement = three custom security roles (see build sheet).

### 6. Ownership & continuity (no orphaning on separation)
- A co-owner can use/edit/**share** an app (grant others access) and **cannot delete** it; if the
  owner's account is removed, co-owners keep working and the app isn't deleted.
- "Grant access" splits: a co-owner can grant **app** access, but assigning the **security role**
  (data access) is **System Administrator–tier** — hence the group-carries-both design above.
- **Robust setup:** built in a solution + **2–3 named co-owners** + **ITS admin reassignment
  backstop** (works even on a fully orphaned app). Group co-ownership of a *solution* app needs
  PowerShell (ITS). A service/owner account is optional and an ITS call (some shops avoid it for
  audit reasons).

---

## Gotchas / caveats established this session

- **Code-app sharing/ownership is preview-era** and only documented for canvas/model-driven apps —
  verify the actual code-app co-owner/share/role behavior on a throwaway app before building
  governance policy on it.
- **Solution apps** can't be co-owned with a security group via the share GUI (greyed out) — group
  co-ownership needs a PowerShell cmdlet.
- **Security-role assignment** needs System Administrator privileges; plain app co-ownership does
  not include it.
- **`@`-imports in CLAUDE.md load at session start** (not lazily) — keep the file lean.
- **Repo is under a OneDrive-synced path** — if installs slow or files lock, exclude `node_modules`
  from OneDrive sync or move the repo out of the synced folder.
- **`/memory` in the VS Code extension** is an edit/manage command that hands off to the terminal
  ("Continue in Terminal"), not a quick read-only readout. Verify context loading with a smoke-test
  question instead.

---

## Artifacts produced this session

1. **`CLAUDE.md`** — self-contained project context for Claude Code (build rules + current
   direction + toolchain facts; docs/ demoted to historical reference). Lives at repo root.
2. **`sfsu_dataverse_build_sheet.md`** — table-by-table designer build spec in dependency order,
   with the typed-columns + two-junctions checks baked in, plus the security-role plan, the
   ownership/continuity setup, and a pre-publish verification checklist.

---

## Immediate next steps

1. **Confirm the `sfsures` prefix** (or choose another) — irreversible once tables exist.
2. **Step 0:** create the publisher + an unmanaged solution; build everything inside it.
3. **Hand-build the ~13 tables** per the build sheet, in dependency order; **screenshot each table +
   relationship** for review before publishing. Watch the two flagged risks: typed value columns
   (not JSON) and the two separate group-access junctions.
4. **Create the three security roles** (Admin / Booker / Viewer) per the build sheet; assign to the
   per-instance Entra security group.
5. **Seat 2–3 co-owners**; confirm the ITS admin-reassignment process.
6. **Run the pre-publish checklist**, then publish.
7. **After publish:** `npx power-apps init` → `add-data-source` per table → **build the calendar
   screen first** (FullCalendar, occurrences as N blocks, blackout windows as background events).
8. **Carry forward** the pen-testing roadmap: delegation-ceiling tests on conflict detection +
   reports, access-gate + security-role bypass attempts, atomic-recurrence edge cases,
   permission-leak across both junctions; ITS for formal security testing.

---

## How to resume

Open the next session with the goal + a pointer to "Immediate next steps" above. The schema build
happens in the browser (make.powerapps.com) with screenshots reviewed in chat; the app build
happens in VS Code with Claude Code, which already loads `CLAUDE.md`. Keep `CLAUDE.md` as the live
source of truth and regenerate it at session end.
