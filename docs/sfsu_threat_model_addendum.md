# SFSU Reservation System — Runbook Addendum: Threat Model & Known Vulnerabilities

**Date:** June 26, 2026
**Phase:** Design/enforcement review. No build work this session — this addendum captures the
security threat model analysis conducted after the enforcement layer (roles + teams) was built,
including a precise characterization of what the platform enforces vs. what the app enforces,
the actual threat population, and a consolidated Known Vulnerabilities inventory for use during
final documentation.

Addendum to all prior runbooks. Nothing here changes the build; it contextualizes what was
already built and flags what to write up at documentation time.

---

## What the platform enforces vs. what the app enforces

The three-team + User/team-ownership design closes specific, well-defined holes at the platform
layer:

- A **Viewer** cannot create reservations — no Create privilege means a raw POST returns 403.
- A **Booker** cannot edit or delete a peer's reservation — Write/Delete @ User means a raw
  PATCH/DELETE against a row the Booker doesn't own returns 403.
- Any **unboarded user** (no role, no team membership) cannot reach the API meaningfully at all —
  no role means no privileges, and the environment boundary refuses them before they touch any data.

Everything else is **app-enforced only**. A complete list of business rules that live exclusively
in app logic and carry no platform backing:

- Resource scope (group membership check — which resources a Booker is permitted to book)
- Blackout period enforcement
- Double-booking / conflict detection
- Atomic all-or-nothing recurrence validation
- Write-once SF State ID
- Disable-not-delete on App User
- Single active theme row constraint

These all share the same root cause: Dataverse has no pre-write trigger or server-side stored
procedure mechanism. A raw API call that bypasses the app bypasses all of them simultaneously.
This is the structural constraint the whole architecture operates under — not unique to this
design, but worth stating plainly.

---

## The actual threat population

"Any authenticated user" overstates the exposure. The realistic threat population is:

**Onboarded users carrying a role** (members of one of the three Owner teams). These are people
who have been deliberately vetted and added to the system. They can reach the Web API, read the
schema, and — if carrying the Booker role — create out-of-scope reservations. All API calls are
authenticated under their SF State ID; nothing is anonymous.

**The general campus population** (SFSU Entra ID holders who have never been onboarded) cannot
meaningfully reach the environment. Just having an SFSU account does not place someone in the
Dataverse environment. No role = no privileges = 403 or empty response at the environment
boundary. The startup access gate is defense-in-depth against this population; the environment
itself is the real outer wall.

**One deployment caveat:** if the app is ever shared more broadly than the three Owner teams —
even just to let someone see a "you don't have access" modal — that share may grant enough
environment presence to reach the API. App share scope and team membership must be kept
coextensive. Sharing wider than the teams, even read-only, potentially expands the
API-accessible population beyond the intended threat model.

---

## Schema discoverability

The Dataverse Web API exposes a metadata endpoint:

```
GET https://orgdaa34530.crm.dynamics.com/api/data/v9.2/$metadata
```

This returns a complete OData service document — every table, column, relationship, and option
set value in the environment, including all `sfsures_` custom tables. Any user carrying a role
can call this endpoint regardless of their data privileges. Data privileges gate row access;
they do not gate schema introspection. This is by design in Dataverse and cannot be disabled
or restricted at the platform layer.

Practical consequence: a Booker can obtain full schema knowledge in ~20 minutes using only
publicly documented OData tooling, without any insider knowledge. The schema-familiarity
assumption in the vulnerability descriptions below is therefore weak — treat all onboarded
Bookers as schema-aware for threat modeling purposes.

The Booker role also grants Read @ Org on both group-access junction tables
(`sfsures_groupresourcetypeaccess`, `sfsures_groupresourceaccess`), which the app needs to
evaluate their own permissions. This means a Booker can also read the full access control
list — which resources each group can book — making resource enumeration trivial alongside
schema enumeration.

There is no available mechanism to block the metadata endpoint while leaving the data
endpoints open. Network-layer controls (IP allowlisting, conditional access) operate at the
identity layer and do not gate API-endpoint access for authenticated users. The platform
does not expose firewall rules at this granularity.

---

## Known Vulnerabilities inventory (for final documentation)

These are accepted residuals and architectural constraints, not build errors. Compile into
a "Known Vulnerabilities" section at final documentation time.

### 1. Resource-scope bypass via Web API (app-layer enforcement only)
A Booker can POST a reservation occurrence for any resource in the environment by constructing
a valid OData request directly against `sfsures_reservationoccurrences`. The group-based
resource permission check exists only in app logic and is not evaluated by the platform on
raw API calls. Schema knowledge required for this attack is freely available via the OData
metadata endpoint (see above).

**Threat population:** onboarded Bookers only. All calls are authenticated under the actor's
SF State ID.
**Mitigations:** audit log captures actor + target resource on every create; reconciliation
report can surface unmatched reservations for human review. Attribution is strong even though
prevention is not.

### 2. Blackout period and conflict detection bypass
The same raw POST path bypasses blackout period enforcement and double-booking prevention.
Both controls are app-layer only; Dataverse accepts any well-formed row regardless of
overlapping reservations or active maintenance windows.

**Threat population:** same as #1.
**Mitigations:** same as #1 — audit log + reconciliation report as detective controls.

### 3. Audit log injection (fabrication, not editing)
Any user carrying Create on `sfsures_auditlog` can write rows directly via the API. The log
is tamper-resistant against edits and deletes (Write/Delete = None for all roles including
Admin) but not against injection of spurious entries.

Partial mitigations baked into the schema: Actor SF State ID is set by the app from the
authenticated context (not user input), and `createdon` is server-stamped and uneditable by
anyone. A fabricated row therefore still carries the real author's authenticated identity and
a real server timestamp — forgery is attributable even if not preventable. Large divergence
between the app-set Action timestamp and system `createdon` is a detectable tamper signal.

**Threat population:** any onboarded user (all three roles have Create on the audit log).
**Accepted residual:** documented at design time; no architectural fix available without a
service principal.

### 4. Booker User-level team inheritance (unverified — pending test)
The design assumes a Booker's PATCH against a peer's reservation occurrence returns 403 at
the platform layer. This has not been verified on the real tables with a non-admin identity.
Joe's System Administrator role masks 403s during testing, so verification requires a
non-admin Booker identity (Scott is the designated test user).

**Status:** must-do before go-live. Until the test runs with the correct identity, "own
records only" on the reservation tables is a design claim, not a confirmed behavior.

### 5. Mid-session revocation latency (unverified — pending test)
Removing a user from an Owner team may not cut their active session's access immediately.
Prior testing (June 24) showed access only updated after a clean session reload. The actual
revocation window is unknown.

**Status:** must-do before go-live. Offboarding procedure should account for whatever
latency is measured.

### 6. In-app role checks are cosmetic
Admin-only screens, hidden buttons, and Visible-property gating are UI conveniences, not
security boundaries. Every real lock is a security-role privilege on a Dataverse table. A
user who bypasses the app UI gets exactly what their role allows — no more, no less.
**This is the design intent, not a gap** — stated here so it reads as deliberate in the
final documentation rather than an oversight.

### 7. Silent-empty read failure
A missing Read privilege on any table returns empty `.data` from `getAll`, not a 403. A
permission failure is visually indistinguishable from "no data yet." The app must explicitly
distinguish these cases; any code path that omits that handling makes a permission failure
invisible to the user.

**Mitigations:** design intent established; implementation must be verified screen by screen
during build. Include in pen-testing checklist.

---

## Audit log reconciliation as a detective control

A periodic reconciliation query comparing live reservation occurrences against audit log
entries (matching on Target ID) can surface rows with no corresponding log entry — a signal
for human review. This is a sound detective control for naive or accidental abuse.

Limitations to state in documentation:
- A sophisticated actor can POST a fabricated audit entry before creating the rogue
  reservation, making the booking appear legitimate to the reconciliation query.
- The control depends on logging discipline across every create path in the app. A bulk-import
  admin feature, an exception handler that swallows the log write, or a future code path that
  omits logging silently generates false positives.
- Automated purging of unmatched rows is inadvisable — conflates "rogue booking" with
  "logging bug." Keep this as a flagging/alerting tool with human review before any deletion.

---

## Immediate next steps

No build actions from this session. Resume at the pre-publish verification checklist per the
June 26 security roles + teams addendum:

1. Run the pre-publish checklist.
2. Seat ≥2 co-owners + confirm ITS reassignment process.
3. Publish.
4. `npx power-apps init` → `add-data-source` per table → calendar screen first.
5. Before go-live: Booker inheritance test (Scott, non-admin identity, Web API directly),
   mid-session revocation test, full pen-testing roadmap.

---

## How to resume

This addendum is reference material for the final documentation pass. No decisions were opened
or closed here. The live source of truth for the schema and enforcement layer remains
`sfsu_dataverse_build_sheet.md` (June 26) and `sfsu_security_roles_and_teams_addendum.md`
(June 26). `CLAUDE.md` was not regenerated this session.
