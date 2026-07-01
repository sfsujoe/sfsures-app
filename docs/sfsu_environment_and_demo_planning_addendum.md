# SFSU Reservation System — Runbook Addendum: Environment Discovery + Demo Planning

**Date:** June 27, 2026
**Phase:** Environment discovery + threat model follow-up + demo strategy. No build work this
session. Covers the flooding/DoS threat analysis, backup strategy, the dynamic-table-provisioning
dead end, and the environment inventory findings that gate the demo path forward.

Addendum to all prior runbooks. Nothing here changes the schema or enforcement layer — both are
complete per the June 26 addendums. This session sets up the next phase: UI build toward a
live demo.

---

## Headline outcomes

1. **Flooding/DoS threat analyzed.** Defense is attribution + recoverability, not technical
   prevention. Three concrete mitigations identified; backup strategy locked.
2. **Dynamic table provisioning ruled out** — not a platform capability. The resource-scope
   enforcement gap is confirmed as an accepted architectural residual, not a solvable problem
   within the current model.
3. **Audit log gap clarified.** API-injected reservations produce no app-written log entry.
   Rows are still attributable via system columns but the rich snapshot is absent. A Dataverse
   plugin is the correct fix; deferred to phase two.
4. **Demo strategy locked: Path B** — live app connected to real Dataverse data, not a mock UI.
   A separate sandbox environment is the target.
5. **Environment inventory completed.** Two environments visible: one Developer (the build
   environment), one Microsoft Teams (Dataverse for Teams — wrong type, ruled out). No
   ITS-provisioned environments exist yet. This is first-time territory for ITS.
6. **Dataverse for Teams upgrade banner** encountered on the Teams environment — ruled out.
   The upgrade is irreversible, disruptive to the existing team, and does not produce a clean
   environment suitable for this architecture.
7. **"Enable Dynamics 365 apps" toggle** evaluated — confirmed as wrong choice for this project.
   Adds hundreds of system tables, modifies security role behavior, and is irreversible.

---

## Flooding / DoS threat analysis

**The attack:** a motivated onboarded Booker uses the Web API to POST thousands of 15-minute
reservation occurrences for a target resource, poisoning the calendar and blocking legitimate
bookings during the attack window.

**Why technical prevention is not feasible at this layer:** Dataverse has no built-in per-user
rate limiting on row creation. The app-layer conflict and scope checks are bypassed by direct
API calls. The platform cannot distinguish legitimate high-volume creates from an attack without
a server-side plugin (phase two).

**Three concrete mitigations (defense-in-depth, not prevention):**

1. **Built-in system backups (already in place, no configuration needed).** Microsoft
   automatically backs up every Dataverse environment continuously, with point-in-time restore
   back 7 days (28 days for production). Admin-restorable via PPAC; inaccessible to any
   authenticated user. Covers catastrophic flooding: restore to 5 minutes before the attack.
   Limitation: restore is environment-wide (all-or-nothing), not surgical.

2. **Nightly Power Automate export to SharePoint.** A scheduled flow reads all reservation
   tables and writes JSON/CSV snapshots to a separately-permissioned SharePoint document
   library (admin-only access, not the app's permission scope). Provides a selective recovery
   option without Azure infrastructure. Captures a daily snapshot — up to 24 hours of data
   could be lost between snapshots, recoverable via environment restore for that window.
   **Build this before go-live.**

3. **Anomaly-alert Power Automate flow.** A flow triggered on reservation occurrence creation
   that counts a single user's creates within a rolling hour and sends an admin email alert if
   the count exceeds a threshold (e.g. 20 occurrences/hour). This is the only near-real-time
   signal available without a plugin. **Build this before go-live.**

**The realistic response:** the attacker is an authenticated, attributed insider. Every row
carries their SF State ID in `createdby` (system-stamped, uneditable). The response is:
remove from team (kills data access immediately or on next session — latency still pending
test), then admin-delete the flood rows or restore from backup. Painful but recoverable.
Document this explicitly in the Known Vulnerabilities section alongside the other accepted
residuals.

---

## Audit log gap — clarified

**The gap:** the audit log is written by the app. A raw API POST that bypasses the app creates
a reservation occurrence row with no corresponding audit log entry. The reconciliation control
(compare occurrences against log entries, flag unmatched) detects this cleanly — a legitimate
app-created booking always has a log entry; an injected one never does.

**What Dataverse does capture regardless of client:** `createdby` (authenticated identity,
platform-stamped, uneditable) and `createdon` (server timestamp, uneditable) on the occurrence
row. Attribution is strong even without the app-written log entry.

**The sophistication escalation:** a Booker who knows the reconciliation logic can also inject
a fabricated audit log entry (all roles have Create on `sfsures_auditlog`). The fabricated
entry still carries the real `createdby` and `createdon` from the platform — cross-checking
the log row's `createdby` against the claimed `Actor SF State ID` field surfaces any forgery.
Build this cross-check into the reconciliation report.

**The honest characterization:** the audit log is a faithful record of app activity, not a
complete record of all Dataverse activity. State this plainly in the final documentation.

**The architectural fix:** a Dataverse plugin (C# code running in the platform's execution
pipeline, fires on every create/update/delete regardless of client). Correct pattern; requires
C# skills and System Administrator access for deployment. **Flag as phase two security
hardening.**

---

## Dynamic table provisioning — ruled out

**The idea:** Admin creates a resource → a new Dataverse table is automatically provisioned
from a template → permissions set dynamically based on group membership. This would push
resource-scope enforcement down to the platform layer.

**Why it doesn't work:**

- Table creation is a **schema operation**, not a data operation. It requires System Customizer
  or System Administrator privileges — not grantable to an app user context.
- The Power Apps SDK does not expose table creation. Generated `*Service.ts` files are
  compile-time artifacts against a known schema. A runtime-provisioned table has no service
  file, no model, and no type safety.
- Security role privilege grids are also schema objects. Granting a role access to a new table
  at runtime requires the same admin tier.
- Even if provisioning were possible, it would **destroy the replication model**: per-resource
  tables in the schema mean the managed solution carries Biology's microscopes into Chemistry's
  environment on import. Everything that varies between departments must live in data, not
  schema. These two requirements are irreconcilable.

**The one option that would work (and why it doesn't fit):** hand-build one table per resource
in the designer at deploy time, with corresponding security roles. New resource = developer
ships a schema update. Acceptable only if the resource catalog changes at most a few times per
year and a developer action is an acceptable workflow for that change. Ruled out for SFSU's use
case given the goal of admin-managed resource catalogs.

**Conclusion:** resource-scope enforcement is app-layer only. This is an accepted architectural
residual, correctly documented in the threat model. The per-department environment isolation
model and the managed-solution replication model are incompatible with platform-enforced
per-resource scoping. The decision is deliberate and reasoned, not a gap.

---

## Demo strategy — Path B locked

**Decision:** the demo will be a live app connected to real Dataverse data in a dedicated
sandbox environment. Not a mock UI with seed data.

**Rationale:** a mock UI (Path A) is vaporware — it over-promises and creates a credibility
risk if stakeholders later see a gap between the demo and the real product. A live demo that
undersells the finished product is the safer position. Stakeholders anxious about LabArchives
need to see a real system, not a prototype.

**The demo environment model:**
- A separate sandbox environment (not the dev environment `orgdaa34530`)
- Managed solution imported from the dev environment
- Three Owner teams recreated (teams don't travel in a solution)
- Realistic sample data seeded through the app itself as screens are built
- No real university data — sample data only, no privacy concerns
- Dev environment stays clean and untouched throughout the demo period

**Sample data to seed (tells a story for stakeholders):**
- 3–4 resources across 2 resource types (e.g. Confocal Microscope + Transmission EM as
  Equipment; Field Van + Research Vessel as Vehicles)
- A week of realistic-looking bookings spread across resources — enough that the calendar
  looks active
- One blackout window (maintenance) on one resource
- Two groups with different resource access, demonstrating scoping if asked

**UI build sequence for demo readiness (maximum wow per session):**
1. Calendar screen with FullCalendar (day/week/month toggle, SFSU purple/gold theme,
   reservations as colored blocks from real occurrence rows)
2. Click-slot booking modal (real write to Dataverse, row appears on calendar after submit)
3. Resource filter/sidebar (demonstrates multi-resource concept without explanation)

Admin screens, reporting, user management, and the access gate are real features but not
what moves a stakeholder audience. Build those after demo buy-in is secured.

---

## Environment inventory findings

**What is visible in PPAC (`admin.powerplatform.microsoft.com`):**

| Environment | Type | Dataverse | Notes |
|---|---|---|---|
| EOS Center All Team | Microsoft Teams | Yes (DVFT) | Wrong type — see below |
| Joseph Benjamin Agosto's Envi… | Developer | Yes | The current build environment (`orgdaa34530`) |

**Conclusions:**
- No ITS-provisioned production or sandbox environments exist. This is a first-time ask.
- PPAC access is confirmed (environments list is visible) — the inventory is likely complete,
  not a visibility gap.
- The ITS request is well-scoped and has concrete supporting evidence.

**Dataverse for Teams (DVFT) — why the Teams environment upgrade is wrong:**
- Code apps run at a browser play URL (outside Teams). DVFT only works inside the Teams client.
  The entire VS Code + npm CLI + FullCalendar architecture is unavailable in DVFT.
- Upgrading DVFT to full Dataverse is a one-way irreversible operation affecting all existing
  users of the EOS Center All Team — an inappropriate change to a live team's environment.
- Even post-upgrade, the environment would be shared with the existing team, violating the
  per-department data isolation model.
- The upgrade banner is not a solution — it's an ITS call in disguise, with more disruption
  than just asking ITS to provision a clean environment.

**"Enable Dynamics 365 apps" toggle — why to leave it off:**
- Provisions the full Dynamics 365 CRM/ERP suite (Sales, Customer Service, Field Service, etc.)
- Adds hundreds of system tables, modifies base security role behavior, can affect query
  performance, and creates solution import risk.
- Decision is **irreversible** — a Dynamics-enabled environment can never be made clean.
- Correct choice for this project: Dataverse database yes, Dynamics 365 apps no. Same type
  as the current dev environment.

---

## The ITS ask (now fully specified)

**What to request:**
- Two new environments: one Production, one Sandbox
- Both: full Dataverse database, code apps enabled, US region, Dynamics 365 apps OFF
- System Administrator grant for Joe on both environments
- Confirmation that custom security role creation is permitted in the Production environment
  (confirmed in dev only so far)

**Supporting evidence to bring:**
- Screenshot of the current environment list (two environments, neither suitable)
- October 1 go-live deadline
- Replacing LabArchives Scheduler (concrete business justification)
- Managed solution already built and ready to import (shows the work is real)

**What ITS does not need to do ongoing:** no babysitting, no flow management, no schema work.
One-time provisioning action only.

---

## Still open (carry forward)

1. **ITS environment provisioning** — the gating dependency for the demo path. Production +
   Sandbox, both with full Dataverse and code apps enabled.
2. **Managed solution export** — can be done now in the dev environment before ITS responds.
   Good to have in hand.
3. **Booker User-level inheritance test** — deferred from June 26; requires Scott (non-admin
   identity). Still must-do before go-live.
4. **Mid-session revocation test** — still pending.
5. **Nightly export flow + anomaly-alert flow** — build before go-live.
6. **Segregated purge role** for audit log retention deletes — not yet built.
7. **Pre-publish verification checklist** — most items satisfied; run the full checklist and
   publish once the checklist passes.
8. **≥2 co-owners + ITS reassignment backstop** — not yet seated.
9. **Dataverse plugin for server-side audit logging** — phase two security hardening.

---

## Immediate next steps

1. **Submit the ITS request** for two environments (Production + Sandbox). Bring the evidence
   listed above. This is the gating dependency for everything demo-related.
2. **Export the current solution as managed** from `orgdaa34530` — do this now, before ITS
   responds, so the import is ready to go the moment the sandbox exists.
3. **Run the pre-publish verification checklist** and publish the dev environment app.
4. **Start the UI build** — calendar screen first (FullCalendar, occurrences as N blocks,
   blackout windows as non-bookable background events, SFSU purple/gold theme). This work
   happens in VS Code against the dev environment and transfers to the sandbox via the managed
   solution.
5. **Read the frontend design skill** (`/mnt/skills/public/frontend-design/SKILL.md`) before
   writing any component code.

---

## How to resume

Open next session with: **"Environment provisioning is pending ITS. Pick up at the UI build —
calendar screen first. Dev environment is the build target until the sandbox exists."**
`sfsu_dataverse_build_sheet.md` (June 26) + `sfsu_security_roles_and_teams_addendum.md`
(June 26) + `sfsu_threat_model_addendum.md` (June 26) remain the live source of truth for
schema and enforcement. `CLAUDE.md` has not been regenerated since the schema build — fold
the directives from the June 26 and June 27 addendums into it at the start of the VS Code
build session.
