# SFSU Reservation System — Runbook Addendum: Access Validation + Logging

**Date:** June 24, 2026
**Phase:** Hands-on validation. Built a tiny single-table code app end-to-end, used it to **prove the
write path** and **demonstrate the full access model live with a colleague**, **resolved the access
mechanism fork** that was left open on June 18, and **locked the in-app audit-logging design**.

Addendum to `sfsu_reservation_system_progress.md`, `sfsu_codeapp_vscode_runbook_addendum.md`,
`sfsu_governance_and_claudecode_addendum.md`, and `sfsu_onboarding_and_access_exploration.md`.
**Where this conflicts with earlier "open forks," this file wins** — several are now resolved.

---

## Headline outcomes

1. **The write path works in a code app.** June 9 proved reads; this session proved **`create`** end
   to end (local *and* published), with a read-back-refresh showing the row as Dataverse stored it.
2. **Custom security role creation + privilege editing confirmed** in this environment. The exact
   capability the real Admin/Booker/Viewer roles need. *(Still unconfirmed in the future
   ITS-governed PROD environment — see open items.)*
3. **The two-grant model was demonstrated live** with a colleague (Scott): app-share grants app
   access; only a **security role** grants data access. Share-without-role = a working shell over
   locked data.
4. **Access mechanism fork RESOLVED → Dataverse-native Owner team.** Built one, hung the role on it,
   added the colleague, removed all direct grants, and confirmed access flows from **team membership
   alone** after a clean session reload. Committed to the team route.
5. **In-app audit-logging design LOCKED** (a 14th table, spec below). Session-open logging and action
   logging kept distinct; logged "role" = **in-app group membership snapshot**, not the security role.

---

## The learning app — what was built (reproducible / re-runnable as a health check)

A one-table app: lists the table's rows, text box + **Submit**, writes the text as a new row, then
**re-reads** the table so the screen reflects the source of truth.

**Concrete values (this throwaway):**

- **Environment:** `orgdaa34530.crm.dynamics.com` — a **Developer Plan sandbox** (the Share dialog
  says so out loud: "This is a developer environment… not for production"). PROD is still the
  one-time ITS environment-provisioning ask.
- **Table logical name:** `crdbc_joetestmessages` (throwaway auto-prefix `crdbc_`, **deliberately
  NOT `sfsures`** — the real prefix stays reserved for the real tables).
- **Primary column logical name:** `crdbc_newcolumn` (the message text lives here).
- **Generated files:** `Crdbc_joetestmessagesesService.ts` / `Crdbc_joetestmessagesesModel.ts`.
  Note the double-**"es"** pluralization (see findings).
- **Published play URL (base):**
  `https://apps.powerapps.com/play/e/d07aac37-af2f-edd1-967f-a1c94a38461d/app/06d4077b-3de2-4cdb-8661-468317e03fcf`
  *(the full URL embeds tenant/env/app IDs — fine to send to someone who'd authenticate anyway, NOT
  for public tickets/forums.)*

**The working `App.tsx` (read + write + refresh):**

```tsx
import { useEffect, useState } from 'react'
import { Crdbc_joetestmessagesesService } from './generated/services/Crdbc_joetestmessagesesService'
import type { Crdbc_joetestmessageses } from './generated/models/Crdbc_joetestmessagesesModel'
import './App.css'

function App() {
  const [rows, setRows] = useState<Crdbc_joetestmessageses[]>([])
  const [text, setText] = useState('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  // READ — select + orderBy + top all delegate to the Dataverse server.
  const loadRows = async () => {
    const result = await Crdbc_joetestmessagesesService.getAll({
      select: ['crdbc_newcolumn', 'createdon'],
      orderBy: ['createdon desc'],
      top: 50,
    })
    setRows(result.data ?? [])
  }

  useEffect(() => {
    const init = async () => {
      try {
        await loadRows()
        setStatus('ready')
      } catch (err) {
        console.error('Load failed:', err)
        setErrorMessage(err instanceof Error ? err.message : String(err))
        setStatus('error')
      }
    }
    init()
  }, [])

  // WRITE then RE-READ (source-of-truth refresh).
  const handleSubmit = async () => {
    const trimmed = text.trim()
    if (!trimmed) return
    setSaving(true)
    setErrorMessage('')
    try {
      // Cast satisfies the over-strict generated input type (see findings).
      await Crdbc_joetestmessagesesService.create(
        { crdbc_newcolumn: trimmed } as Parameters<typeof Crdbc_joetestmessagesesService.create>[0]
      )
      setText('')
      await loadRows()
    } catch (err) {
      console.error('Save failed:', err)
      setErrorMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  if (status === 'loading') return <p>Loading…</p>
  if (status === 'error') return <p>Couldn't load: {errorMessage}</p>

  return (
    <div style={{ maxWidth: 480, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <h1>Message board (learning app)</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input value={text} onChange={(e) => setText(e.target.value)}
               placeholder="Type a short message…" style={{ flex: 1, padding: 8 }} />
        <button onClick={handleSubmit} disabled={saving || !text.trim()}>
          {saving ? 'Saving…' : 'Submit'}
        </button>
      </div>
      {errorMessage && <p style={{ color: 'crimson' }}>{errorMessage}</p>}
      <ul>
        {rows.map((row) => (
          <li key={row.crdbc_joetestmessagesid}>{row.crdbc_newcolumn ?? '(empty)'}</li>
        ))}
      </ul>
    </div>
  )
}

export default App
```

> Keep this as a 5-minute environment health check, or delete the table + app when done — the
> throwaway prefix means nothing in the real `sfsures` namespace is touched either way.

---

## New technical findings this session

- **`add-data-source` 404 right after table creation.** A freshly created table 404s on the metadata
  API (`EntityDefinitions`) for a short propagation window. **Retry succeeds.** Expect this on the
  real tables too. *(A column you just added but haven't **saved** also 404s — save in the designer
  first.)*
- **Tool pluralization is naive.** `joetestmessages` → `joetestmessages**es**` (it appends "es" to a
  word already ending in "s"). **Never guess generated names — read `src/generated/models/` and
  `src/generated/services/` for the real filenames** and use them verbatim.
- **`create()` input type is over-strict.** Signature is
  `create(record: Omit<…Base, 'crdbc_joetestmessagesid'>)`, and the Base type marks system-defaulted
  fields (`ownerid`, `owneridtype`, `statecode`) as **required** even though Dataverse fills them in
  automatically at create time. Clean fix that keeps real type-checking on your own columns:
  `create({ … } as Parameters<typeof XService.create>[0])`. **This will recur on all ~13 real
  tables** — worth a small typed create-helper when we build them, rather than scattering the cast.
- **Silent-empty permission failure — CONFIRMED live, and the mechanism is now clear.** With app
  access but **no read role**, `getAll` does **not** throw a 403 — it returns an **empty `.data`**.
  The colleague saw: app opens, empty list, no error banner, Submit greyed (by our own
  `!text.trim()` validation, not by the permission system). **A missing read role is
  indistinguishable from "no data yet."** The real app MUST distinguish "empty because no bookings"
  from "empty because you can't read the table" — explicit UI handling, not an afterthought. *(A
  failed **write** would likely throw a real 403 into the console; reads fail silently.)*

---

## Access / permissions model — RESOLVED

### The two-grant model (demonstrated, not asserted)
- **App access** = app share (ideally to a group). Lets someone **open** the app.
- **Data access** = a **Dataverse security role**. The only thing that lets their queries touch rows.
- Share without role → working shell, silent-empty data. The **"Additional data access"** tab in the
  Share dialog spells this out, naming the `crdbc_joetestmessageses` Dataverse resource recipients
  need to connect to.

### The privilege grid (the actual security model, made concrete)
- Rows = tables, columns = privileges (Create/Read/Write/Delete/Append/Append to/Assign/Share), each
  cell an **access level** that fills in rungs: **None → User → Business Unit → Parent:Child →
  Organization**. Click a cell repeatedly to raise the level.
- **"Organization" = THIS environment, not all of SFSU.** In Dataverse, "organization" = one
  environment/instance; the top rung means "every row of this table **in this environment**,"
  regardless of owner. Roles don't even exist outside the environment they're created in.
- **Why this validates the per-department-instance choice:** because each department is its own
  environment, the broadest, simplest scope (**Org**) is automatically safe — a Biology admin with
  Org-level access still can't see one Chemistry row, because Chemistry is a different environment.
  No brittle business-unit row-scoping. This is exactly why the single campus-wide app was rejected.
- Real-role preview: **Viewer** = Read@Org, rest None. **Booker** = Read@Org (sees others' bookings
  for conflict checks) + Write/Delete@**User** (own records only). **Admin** = Org across the board.
  The User-vs-Org distinction is literally *how far you click the cell*.

### Custom role creation — CONFIRMED here
- Reached **+ New role**, filled it in, and edited the per-table privilege grid. The modern create
  form front-loads metadata fields; the ones that aren't obvious are **free-text notes** ("Applies
  To", "Summary of Core Table Privileges" — descriptive only, grant nothing). After save it drops
  into the **classic** privilege grid. **You can create and scope custom roles in this (dev)
  environment.** *(PROD still open.)*

### The Owner team route — PROVEN and COMMITTED
**Decision: onboarding/offboarding via a Dataverse-native Owner team carrying the security role.**
Entra security groups are **not required** at this scale (~50 users max), and direct-to-individual
was rejected — not on user count, but on **replication, delegation, and auditability**: "add the new
chem admin to the Admins team" is a clean, delegable handoff to a non-technical department owner;
direct assignment turns cohort changes and access audits into manual list-walking.

- **Team type MUST be "Owner."** Only an Owner team can carry a security role and have members
  inherit it, with membership managed **inside Dataverse** (no Entra, no AD sync).
  - **Access team** → can't hold a role (record-sharing only). Wrong tool.
  - **Entra ID / Office Group team** → reintroduces the Entra dependency we deliberately ruled out.
- Flow proven: create Owner team → **Manage security roles** on the *team* → tick the role → add the
  member → **member's "Direct Assigned Roles: None"** yet access works. Team membership alone
  delivered it.
- **Identity model confirmed in the wild:** the colleague's UPN is `917234310@sfsu.edu`; first 9
  chars = SF State ID `917234310` — the exact immutable key the access gate extracts. The platform
  carries the identifier we designed around.

### Onboarding / offboarding — keep two "disabled" states distinct
- **Onboarding** = add user to the team.
- **Offboarding** = remove from the team (kills **data access**). This is **separate** from the
  app-layer **disable-not-delete** on `sfsures_appuser` (which preserves **reservation history**).
  Don't conflate: removing the security user/team membership stops access; the App User row keeps a
  disabled person showing correctly as a past booking owner.

### Operational footnotes to test on the REAL app before go-live
- **Membership/role changes may need a fresh session.** Access worked only after a **clean reload**
  (close tab, reopen). A running session can hold a cached security context. **Test mid-session
  revocation**: does yanking someone cut them off immediately, or only on next launch? Matters for
  offboarding.
- **Team-inherited *User-level* privileges behave differently** from a direct grant (team-owned vs
  user-owned records). We only tested at **Org** level, which inherits cleanly. The real **Booker**
  role uses **User-level** write — **test that specific case deliberately** on the real tables.

### Diagnostic tool worth keeping
**App access checker** (`…/WebResources/msdyn_AppAccessChecker.html`): enter a user's email, get
**Visible / License / Security** per app, with the specific blocker named (it reported "missing
**Read Privilege** on App Module" for the colleague pre-role). This is the production triage tool for
"user X says the booking app is empty" — tells you in one screen whether it's licensing, sharing, or
a missing role.

---

## In-app audit logging — LOCKED

### Two needs, kept separate
- **Audit trail** = business data → a **Dataverse table you own**, written by the app. Answers
  "who did what to which reservation, when, in what context." **Build this.**
- **Diagnostics/telemetry** = transient technical breadcrumbs → **Application Insights** (code apps
  can wire in). For debugging, NOT business questions. **Phase two**; never mix into reservation
  tables.

### The audit-log table (a 14th table — to be drafted into the build sheet)
- **Append-only and security-role-protected against user tampering.** This is the one table where
  "Bookers write their own rows" is **wrong** — a tamperable audit log is worse than none. Writable
  by the app on the user's behalf; no user Write/Delete except a narrow admin path.
- **Session-open logging and action logging are DISTINCT records.** "Someone launched the app" ≠
  "someone did a thing." Capturing only one leaves you inferring (the exact ambiguity that started
  this — "did the colleague actually post, or am I seeing stale data?").

### Captured per action
- **Actor SF State ID** + **display-name snapshot** (names change; snapshot what was true then).
- **Timestamp.**
- **Action type:** create / modify / cancel(delete) — *cancel is the single most likely reason
  anyone ever reads the log* — plus **admin catalog actions** (user add/disable, blackout-window
  edits, theme changes), which are higher-privilege and arguably more important than routine
  bookings.
- **What was acted on:** reservation ID + resource (not merely "a reservation changed").
- **Before → after state on a modify** (old vs new start/end) — "modified" without "from what to
  what" answers nothing.
- **Failed / blocked attempts** (e.g. atomic-recurrence conflict rejections) — pattern signal a
  security review wants; invisible if you log only successes.
- **In-app group membership at time of action** — see the nuance below.
- *(Don't log routine reads/calendar views — noise that buries signal.)*

### The "role" logged = in-app group membership (Joe's correction — important)
- The logged context is **in-app group membership** (the `sfsures_group` rows via the
  `usergroupassignment` junction) at the moment of action — **read directly from the app, no
  inferring**, and **not** the Dataverse security role.
- **What it is evidence of:** the app's **resource-scoping** context ("was permitted to book X, Y per
  the allow-list") — the right business question for a booking dispute. **What it is NOT:** proof the
  *platform* authorized the write (that's the security-role layer the app can't read). In a
  misconfiguration the two could disagree; flag so nobody misreads "was in group X" as "was
  authorized at the security layer."
- **Snapshot it, don't reference live membership.** Memberships change by design over a user's
  lifecycle; a live pointer silently rewrites history. Freeze the group names/IDs onto the log row.
- **Denormalized text is the right shape here** (a delimited list, e.g. `Biology; Field Gear`) — a
  deliberate **exception** to the usual typed-column rule, because a log is an **immutable
  chronological narrative read sequentially**, not a live table queried relationally. Document the
  "why" so future-you doesn't "improve" it back into a relationship and reintroduce the
  history-rewriting problem.

---

## Still open (carry forward)

1. **Custom role creation in the ITS-governed PROD environment** — confirmed in dev only. The real
   question for go-live.
2. **System Administrator on the (future) PROD environment** — the grant that unlocks team creation;
   folds into the one-time env-provisioning ask. Joe still can't create environments.
3. **Role granularity** — leaning **one Owner team per role** (Admins / Bookers / Viewers), but not
   nailed. (One "can use the app" team with app-logic role decisions was the softer alternative;
   three hard-enforced roles is the safer, pen-test-friendly choice.)
4. **First-admin + active-theme seed at deploy** — concrete steps so a fresh instance is usable
   without an app-layer privilege land-grab.
5. **Booker User-level team-inheritance test** and **mid-session revocation test** (operational
   footnotes above).

---

## Immediate next steps

1. **Draft the audit-log table (14th) into `sfsu_dataverse_build_sheet.md`** — columns, types, the
   append-only/tamper-resistant security-role treatment, the denormalized group-snapshot column with
   its "frozen text, here's why" note, and the distinct session-open vs action-log records.
2. **Decide role granularity** (one team per role vs. fewer).
3. **Return to the schema build:** Step 0 publisher + **`sfsures`** solution (confirm the prefix —
   the one irreversible choice), hand-build the ~13 (now 14) tables in dependency order, screenshot
   each, run the pre-publish checklist (typed value columns, two separate group-access junctions),
   then publish.
4. **After publish:** `add-data-source` per table → build the calendar screen first (FullCalendar,
   occurrences as N blocks, blackout windows as background events).
5. **Carry the pen-testing roadmap forward**, now with concrete cases to add: silent-empty read
   handling, team-inherited User-level write, mid-session revocation, audit-log tamper-resistance.

---

## How to resume

Open next session with: "Checkpoint after access validation — draft the audit-log table into the
build sheet, then back to the schema build." The access model is settled (Owner team carrying a
security role; onboarding = add to team). `CLAUDE.md` + the build sheet remain the live source of
truth; regenerate `CLAUDE.md` to fold in the resolved access decision and the audit-log table before
the schema build.
