# SFSU Resource Reservation System — Progress Runbook

**Last updated:** June 4, 2026
**Phase:** Power Apps vibe coding — planning stage (pre-schema, pre-publish)

---

## Where things stand right now

The compacted initial prompt was created and pasted into the Power Apps vibe experience (vibe.powerapps.com). The tool ran its four planning questions, generated a plan, and that plan was iteratively refined three times into a version we approved. The tool then began erroring intermittently ("Something went wrong"), including once during plan creation.

**Current blocker:** Repeated "Something went wrong" errors in the vibe tool. This is consistent with the feature's early-preview maturity, not a problem with the inputs. The approved plan, the compacted prompt, and the refinement prompt are all saved externally as portable text (Word docs), so no design work is at risk — a session loss costs only a re-paste and re-run.

**Next action when resuming:** Re-feed the refinement prompt and regenerate the plan once the tool is stable. Before re-running, check the Dataverse environment for orphaned/partial draft tables from interrupted generations and clear them, so a re-run doesn't create duplicates (e.g. `Resources_1`).

---

## Artifacts (saved externally by Joe, in Word docs)

1. **Compacted initial prompt** — 3,965 characters, fits the vibe tool's 4,000-char limit. Full reservation spec plus embedded SFSU hex palette values (primary + secondary).
2. **Approved/final plan** — the version incorporating all three refinements below.
3. **Plan refinement prompt** — the three-change directive used to refine the tool's first plan draft.

Also saved in this Project's outputs: `sfsu_reservation_system_compact_prompt.txt` (the compacted prompt as plain text).

---

## The four planning decisions (and why)

### 1. Resource modeling → Metadata-driven, typed value storage
Admins must be able to create new resource types **and** new attributes on demand, entirely through the app UI, with nobody touching Dataverse tables directly. This rules out both "dedicated subtype tables" and "hybrid core + extensions" — both require a schema change (a new column/table) for a new type or attribute, which means either editing tables directly or granting makers schema-modify privileges (an anti-pattern).

**Chosen:** metadata-driven model — resource types and attributes are stored as *data* (rows), so new ones are created with zero schema changes.

**Critical refinement (see refinement #1):** values are stored in a **Resource attribute values** table with one row per (resource, attribute definition), each value in a **typed column** matching the attribute's data type (ValueText / ValueNumber / ValueDateTime / ValueBoolean / ValueChoice) — **not** a single opaque JSON blob per resource. This preserves no-schema-change extensibility while keeping attributes filterable and reportable (e.g. "all rooms with capacity over 30").

### 2. Recurrence handling → Series + materialized occurrences
Each recurring booking is stored as a master **Series** row plus individual **Occurrence** child rows, each carrying its own typed start/end time. This makes conflict detection a clean, delegable overlap query against real rows, makes per-occurrence exceptions trivial (edit/cancel one child row), and makes reporting honest (aggregate real occurrence rows). Row volume is a non-issue at SFSU scale.

### 3. App shape → Unified, role-based
One app, not separate admin/user apps. Roles are enforced by the SF State ID lookup + group membership; the single app shows/hides capability by role. Simpler to theme, cache, and maintain. **Watch at build time:** admin-only capability must be gated on the role check itself, not merely hidden (`Visible=false` controls can still execute logic).

### 4. Reminder recipients → Configurable per resource type
Consistent with the spec's per-resource-type reminder lead time. **Keep bounded for v1:** owner by default, with an admin-settable option to also notify a resource owner or shared mailbox. Avoid building per-user notification preference management for v1.

---

## The three plan refinements (final state)

1. **Attribute value storage** — typed columns in a Resource attribute values table, not JSON blob (see decision #1). Attribute definitions table carries: owning resource type, attribute name, data type, required flag, choice options, display order.

2. **Permission relationships — explicit cardinality.** Users↔Groups is many-to-many via a User group assignments junction. Groups grant access at two distinct scopes, each its own many-to-many junction: **Group resource-type access** and **Group resource access**. Authorization path: signed-in SF State ID → user record → user's groups → permitted resource types and individual resources.

3. **Recurrence conflict behavior — atomic all-or-nothing.** On submit, validate every generated occurrence against active occurrences and blackout windows **before committing any row**. If *any* occurrence conflicts, the entire reservation fails and nothing is booked. Error message states: total conflict count, then up to the first three conflicts in chronological order (each with occurrence date/time and the conflicting reservation owner's display name), and "X more" if more exist. Blackout-caused conflicts (no owning user) are identified as blackout/maintenance windows instead of a user name.

---

## Verification checklist — when the regenerated plan / draft schema appears

Re-feeding the refinement prompt produces a *fresh* generation, so re-check rather than assume it matches the approved version:

- [ ] Resource attribute values stored in **typed columns** (tool may drift back toward JSON — this is the most likely regression).
- [ ] **Group resource-type access** and **Group resource access** present as **two separate junction tables**, each with two relationships — not collapsed into single lookups. *(A plan can describe a many-to-many in prose while the generated tables build a one-to-many. Re-verify at the actual schema stage, not just the plan stage.)*
- [ ] Atomic all-or-nothing conflict logic + three-conflict message survived intact.
- [ ] "What stays fixed" untouched: unified app, SF State ID as sole authoritative key, access gate before content, disable-not-delete, no approval workflow, no email/display-name authorization.

### The real point of no easy return
Moving from **plan → draft Dataverse tables → publish** is the costly-to-reverse step. Inspect the two group-access junctions and the attribute-value storage shape **before publishing**. Once published, schema changes underneath a built app are painful.

### Atomic booking — implementation watch
The all-or-nothing requirement is correct at the plan level; the risk is in implementation. Correct shape: "validate all occurrences, then commit all or none." Fragile shape to flag if generated: a loop that writes occurrence rows and tries to delete them on conflict. Only visible in the generated logic, not the plan.

---

## Calendar UI — decision and rationale

**Key product finding (verified via search, June 2026):** The Power Apps vibe experience generates **Code Apps** — full React/TypeScript web apps — not canvas apps. This materially changes the calendar options.

**Decision: use FullCalendar, but request it at the calendar-*screen* stage, not in the plan.**

- In a React code app, FullCalendar is just an npm package (`@fullcalendar/react`) — a first-class dependency, not a painful PCF/code-component build. It gives real day/week/month views, drag-to-create, and overlapping-event handling.
- The calendar is a *view* over the occurrences + blackout-windows tables, which are already locked in the plan. The rendering library is a one-screen implementation detail, so it doesn't belong in the data-model plan and shouldn't gate plan approval.
- **Directive to give when the calendar screen generates:** render with FullCalendar (`@fullcalendar/react`), day/week/month views, events sourced from the reservation **occurrences** table (so a recurrence shows as N distinct clickable blocks, not one), blackout windows rendered as visually distinct **non-bookable background events**.
- **Fallback:** if the generated calendar component misbehaves, an agenda/list view (bookings grouped by day) is the reliable, low-risk alternative and is often enough for a self-service booking tool.

**Calendar caveats:**
- The calendar is the most logic-dense screen and the lowest-fidelity on first pass — expect to hand-tune.
- FullCalendar core is open-source (MIT); some premium views (e.g. resource-timeline) are paid. Free views are sufficient for v1.

---

## Cross-cutting risk: code-app maturity & maintainability

Verified via search (June 2026): practitioners describe the vibe/code-app path as **early preview, explicitly not recommended for production yet**, with a real maintainability concern — AI-generated TypeScript that works in a demo can become unsupportable "deferred technical debt" for teams without a developer who can read it.

**Relevance to this project:** This replaces a production system (LabArchives Scheduler) on an **October 1 deadline**, with structured pen-testing required before go-live. The thing to protect is not feasibility (the build is feasible) but **maintainability** — being able to understand and support what gets generated, especially the calendar component.

**Two environment items to confirm (Joe does not have Power Platform admin access):**
- Confirm the tool is producing a **code app** (vs a canvas fallback) — everything about the FullCalendar approach depends on it. The fact that vibe is generating output suggests code apps are enabled in the environment, but verify.
- Confirm the required environment toggles (code apps / external models) are actually enabled; if blocked, the specific error makes the admin request concrete.

---

## Key concepts established this session

- **Delegation:** whether a query runs on the Dataverse server (delegable, correct at any scale) or pulls a capped local batch (default 500 rows, max 2,000) and filters in-app (non-delegable — silently works on an incomplete subset, the dangerous failure mode). Filters/comparisons on typed columns delegate; anything needing parsing, computation, or in-memory expansion tends not to. The Power Apps formula editor flags non-delegable expressions with a blue underline — treat that warning on anything touching bookings/resources as "look closer."
- **Mental model:** keep everything you'll search, sort, or report on as a real typed column, and let the server do that work. Every schema recommendation traces back to this.

---

## Immediate next steps

1. Wait out / retry the vibe tool error (reload tab; reopen the existing project rather than starting fresh; clear orphaned partial tables before re-running).
2. Re-feed the refinement prompt, regenerate the plan.
3. Run the verification checklist against the regenerated plan.
4. Once a good plan is produced, **save the approved version externally again** (it reverted once already — make saving deliberate after each accepted state).
5. Proceed to draft schema; inspect group-access junctions + attribute-value storage **before publishing**.
6. At the calendar-screen stage, request FullCalendar per the directive above; scrutinize the generated component for maintainability, not just appearance.
