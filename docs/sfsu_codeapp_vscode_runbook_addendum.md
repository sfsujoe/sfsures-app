# SFSU Reservation System — Progress Runbook Addendum

## Session: VS Code code-app path validated end-to-end with Dataverse

**Date:** June 9, 2026
**Phase:** Build-path validation complete. The Power Apps **code-app route via VS Code + the npm CLI** is proven on a clean machine, from empty toolchain to a typed Dataverse query rendering real rows in the browser and a published app live in the tenant.

This is an addendum to `sfsu_reservation_system_progress.md`. It records what's new and machine/version-specific from this session; it does not restate the schema-verification, calendar, or pen-testing threads already captured in the main runbook — those are referenced where they connect.

---

## Headline outcomes

1. **The VS Code code-app path works, end to end.** Scaffold → init → sign-in → environment → dev → build → publish → live in Power Apps, then `add-data-source` → typed service → `getAll` → `.data` → React render, with real rows on screen. The technical *and* maintainability risk on this route is largely retired.
2. **Code apps are enabled in our environment.** `init`, `push`, and `add-data-source` all succeeded with no "environment doesn't support code apps" error. **The Power Platform admin-access uncertainty does not block this path.** We can build the real system in VS Code without waiting on an admin toggle request.
3. **The delegation-safe read shape is rehearsed.** The `getAll({ select, filter, orderBy, top })` pattern used in the test is exactly the server-side-delegating shape the real conflict-detection and reports queries must use — directly addressing the main runbook's #1 production risk.

---

## Strategic decisions made this session (and why)

### Build surface: VS Code code app, not the Vibe web tool (for the real build)
The Vibe web experience and the VS Code route produce the **same artifact** — a Vite + React + TypeScript app wired to Dataverse through the Power Apps SDK. The difference is *who holds the pen*:

- **VS Code wins on maintainability** — you own the repo from line one (readable, git-able, debuggable). This is the direct antidote to the "AI-generated TypeScript becomes unsupportable" risk flagged earlier for an October-1 production system.
- It **escapes Vibe's stochastic instability** ("Something went wrong").
- **FullCalendar stops being a question** — it's just `npm install @fullcalendar/react`.
- **Cost, eyes open:** no AI scaffolds the whole app; you (with Claude) hand-build and wire screens. More moving parts. It's more code-forward than the GUI-first workflow.

Hybrid remains open: Vibe can scaffold; whether its output can be pulled into VS Code and continued is still unverified — check before assuming.

### CLI: the npm CLI (`npx power-apps`), not the deprecated `pac code` CLI
- Microsoft is **deprecating the `pac code` commands; the npm-based CLI is the replacement.** Standing a maintained system on the tool that's on its way out would just buy a future migration.
- The npm CLI **reduces prerequisites** — no separate `pac`/.NET install. The toolchain shrinks to roughly **Node + git + VS Code**.
- **Tradeoff:** newer, so fewer community blog posts/threads to lean on. Both CLIs build the identical app; the durable artifact (React/TS + generated Dataverse services) is the same either way.

### The Copilot sidebar is not Vibe
The VS Code "Describe what to build" sidebar is **GitHub Copilot** (general-purpose coding agent), not a Power-Platform builder. It writes/edits code in a repo you own; it does **not** provision Dataverse or know the code-apps SDK reliably. Do **not** expect it to scaffold a Dataverse-wired code app from a prompt — it'll build a generic React app with mock data. Correct division of labor: **CLI does the platform plumbing; the agent builds screens inside the scaffolded project.**

---

## Environment of record

- **Org (Dataverse) URL:** `https://orgdaa34530.crm.dynamics.com` (use **no trailing slash** on the CLI — see gotchas)
- **Environment ID:** recorded in the project's `power.config.json` (written at `init`).
- This is the **code-apps-enabled** environment — the same one Vibe has been using. Always target this one; pulling from the wrong environment "works" but isn't where the real app lives.
- **Note for pen-testing:** the published play URL embeds tenant, environment, and app IDs. Fine to share with someone who'd authenticate anyway (it's gated behind tenant sign-in), but **not** for public tickets or forums.

---

## Verified toolchain (this machine)

- **Node.js** v24.16.0 (any LTS v20+ is fine) — gives `npm` and `npx`
- **git** 2.54.0
- **VS Code**
- That's the whole stack on the npm CLI path. No separate `pac`/.NET needed.

---

## The reproducible command sequence (npm CLI)

```bash
# 1. Scaffold from Microsoft's official template (SDK pre-wired, no git history)
npx degit github:microsoft/PowerAppsCodeApps/templates/vite <app-name>
cd <app-name>

# 2. Install dependencies (warn lines = noise; only `npm error` matters)
npm install

# 3. Register the app to the environment.
#    Opens a browser sign-in (use the MICROSOFT / SFSU account, NOT GitHub),
#    then prompts for environment (pick the code-apps-enabled one) and a display name.
#    Writes power.config.json (the link between this local project and the environment).
npx power-apps init

# 4. Run locally. Open the URL labeled "Local Play" (NOT the plain localhost Vite link),
#    in the same browser profile signed into the tenant. Allow the localhost permission if prompted.
npm run dev

# 5. Build (clean green = a free correctness check), then publish. Push returns the live play URL.
npm run build
npx power-apps push
```

Folder/package name must be **lowercase** or `npm install` fails. PATH updates only in **new** terminals — reopen VS Code after installing Node/git.

---

## Connecting a Dataverse table (proven pattern)

```bash
# npm CLI syntax: --api-id dataverse --resource-name <table-logical-name>
# (NOT pac's "-a dataverse -t". connection-id/dataset/solution flags are for SQL/SharePoint only.)
# No separate connection needed — Dataverse rides on the environment sign-in.
# It may prompt for the org URL; supply it with NO trailing slash.
npx power-apps add-data-source --api-id dataverse --resource-name account --org-url https://orgdaa34530.crm.dynamics.com
```

- Generates typed files: `src/generated/models/<Plural>Model.ts` and `src/generated/services/<Plural>Service.ts`. **Singular logical name in → pluralized files out** (e.g. `account` → `AccountsModel.ts` / `AccountsService.ts`). These are autogenerated — **don't edit** them.
- **For the real tables later:** find a table's logical name in make.powerapps.com → the table → **Tools → Copy logical name**. Custom tables carry the publisher prefix (e.g. `cr123_resourcetype`).
- The generated **typed services will enforce the typed-column schema at compile time** — this is what catches a column that drifted from its intended type, the exact regression the main runbook's verification checklist watches for.

---

## The read pattern (compile-correct, proven)

Service methods generated per table: `create`, `get`, `getAll`, `update`, `delete` (plus `upload` / `downloadImage` / `deleteFileOrImage` for file/image columns). `getAll` returns a result whose **`.data`** holds the row array.

Minimal working `App.tsx` (this is the shape that compiled and ran):

```tsx
import { useEffect, useState } from 'react'
import { AccountsService } from './generated/services/AccountsService'
import type { Accounts } from './generated/models/AccountsModel'
import './App.css'

function App() {
  const [accounts, setAccounts] = useState<Accounts[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const result = await AccountsService.getAll({
          select: ['name', 'accountnumber'], // always limit columns
          top: 25,
        })
        setAccounts(result.data ?? [])
        setStatus('ready')
      } catch (err) {
        console.error('Failed to load accounts:', err)
        setErrorMessage(err instanceof Error ? err.message : String(err))
        setStatus('error')
      }
    }
    load()
  }, [])
  // ...render loading / error / list of accounts
}
```

### Delegation-safe options (the part that matters for the real app)
`IGetAllOptions`: `select`, `filter`, `orderBy`, `top`, `maxPageSize`, `skip`, `skipToken`. **`select`, `filter`, `orderBy`, and `top` delegate to the Dataverse server.** Always limit columns with `select`. This is the shape conflict-detection and reports must use so they run server-side instead of pulling a capped local batch. Example (the humans-only `systemuser` query from the test):

```ts
const result = await SystemusersService.getAll({
  select: ['fullname', 'internalemailaddress'],
  filter: 'isdisabled eq false and applicationid eq null', // real people only
  orderBy: ['fullname asc'],
  top: 25,
})
```

---

## SDK initialization finding (important, version-specific)

- **This template auto-initializes the SDK at startup** — the `templates/vite` scaffold ships **no `PowerProvider.tsx`**; init happens before React renders. App code does **not** need to call `initialize()`.
- **Do NOT add** `import { initialize } from '@microsoft/power-apps/app'`. That appears in Microsoft's *docs* example but is **not exported** in this template's pinned SDK version — it throws `Module '"@microsoft/power-apps/app"' has no exported member 'initialize'`.
- If a future SDK version requires explicit init, the place to look is `src/main.tsx` (or the `@microsoft/power-apps-vite` plugin), not a PowerProvider that doesn't exist here.

---

## Gotchas (consolidated)

- **`npm warn` (yellow) = noise; only `npm error` (red) matters.** Don't run `npm audit fix` on the preview template — it can shuffle versions and break things.
- **PATH** updates only in new terminals — reopen VS Code after installing Node/git.
- **Folder/package name must be lowercase.**
- **Local Play URL ≠ the plain localhost Vite URL.** Open Local Play, in the tenant-signed-in browser profile.
- **Chrome/Edge block localhost** (local network access) by default since Dec 2025 — allow the permission if prompted; suspect this first if a local app hangs on a loading spinner.
- **Org URL: no trailing slash.** `...dynamics.com/` (with slash) coincided with a `fetch failed`. `fetch failed` is also a known intermittent — copy the exact URL that worked, retry once or twice, then add `--json` for a rawer error.
- **Published-app flakiness (preview):** a blank code app can intermittently fail one refresh and work the next — refresh a few times before worrying. A `fetching your app` / `App timed out` hang usually means a skipped `npm run build` or a `PowerProvider.tsx` problem (N/A here).
- **`systemuser` contains application/service users** (leading `#`, `@onmicrosoft.com`, `applicationid != null`) alongside real people. Filter `applicationid eq null and isdisabled eq false` to get humans.

---

## Immediate next steps

1. **Real Dataverse connection waits on the published schema.** This loops back to the Vibe schema-verification thread in the main runbook: re-feed the refinement prompt, regenerate the plan, run the verification checklist, and **inspect the two group-access junctions + the typed attribute-value columns before publishing**.
2. **Once the schema is published:** run `npx power-apps add-data-source --api-id dataverse --resource-name <table> --org-url https://orgdaa34530.crm.dynamics.com` per real table (Resources, Resource attribute values, Reservations/Occurrences, the group-access junctions, Users, Blackout windows). Let the generated typed services enforce the schema at compile time.
3. **Build the calendar screen first** (highest-value, most logic-dense): `npm install @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid`, render from the **occurrences** table (recurrence shows as N distinct blocks), blackout windows as **non-bookable background events**. See the calendar directive in the main runbook.
4. **Centralized theming** (SFSU Core Purple `#442C8B`, Core Gold `#DCAE27`) as a build-time directive, not a retrofit.
5. **Carry the pen-testing roadmap forward** unchanged: delegation-ceiling tests on conflict detection + reports, access-gate verification (bypass attempts; `Visible=false` vs. real role-check), atomic recurrence edge cases, permission-leak across both group-access junctions; ITS for formal security testing.
6. **Open decision for next session:** commit to building the real app in VS Code (own the repo) vs. continuing in Vibe. Recommendation leans **VS Code for maintainability**, now that the path is proven.

---

## How to resume

Open the next session with the goal plus a pointer to this addendum's **Immediate next steps**. The reproducible command sequences above mean a fresh `account`/`systemuser`-style test can be re-run any time to confirm the environment is still healthy before deeper work.
