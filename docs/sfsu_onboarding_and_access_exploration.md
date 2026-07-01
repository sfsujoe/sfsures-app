# SFSU Reservation System — Runbook Addendum: Onboarding & Access Model (Exploration)

**Date:** June 18, 2026
**Phase:** Access/onboarding design exploration. **No decisions locked this session** — this file
captures the questions worked through, the product facts verified, the dead ends ruled out, and the
open forks, so the thread can resume without re-deriving any of it.

Addendum to `sfsu_reservation_system_progress.md`, `sfsu_codeapp_vscode_runbook_addendum.md`, and
`sfsu_governance_and_claudecode_addendum.md`.

> **What changed vs. prior runbooks:** the earlier addendums leaned toward an **Entra-group-team**
> as the access mechanism (onboarding = add to an Entra security group). This session surfaced that
> the specific group Joe can self-provision — an **on-prem AD security group from his delegated
> OU** — likely does **not** work for Power Platform access. The access mechanism is therefore
> **re-opened as a fork**, not settled. The leading replacement is a **Dataverse-native team**.

---

## Where this started: the OOBE / first-admin cold-start problem

Joe raised a real gap: if we never touch Dataverse tables directly, who has permission to do
anything the first time a fresh instance launches? Proposed a first-run onboarding that asks who
should be admin.

**Reframed:** the thing that makes someone a *real* admin is the **Dataverse security role**, and
the app **cannot grant that**. An app row that says "Joe = admin" only toggles UI — the exact
"`Visible=false` still executes" trap. So an OOBE that writes admin into the App User table grants
no actual data power.

**The real cold-start symptoms (narrow and fixable):**
- On a fresh instance the **App User table is empty**, so the startup access gate bounces *everyone*
  — including the legitimately-provisioned first admin.
- There is **no active App Settings / Theme row** yet (spec requires exactly one active row).

**The danger to avoid:** SSO authenticates the *entire university*. A rule like "table empty →
first launcher claims admin" is a **privilege land-grab** — the first random person to hit the URL
owns the instance. This is precisely what pen-testing exists to catch.

**Direction (not yet locked):** designate the first admin **out of band** (at deploy), and **seed
the first admin's App User row + the active theme row** as part of instance setup. Keep "who is an
admin" entirely out of app-writable logic. A *light* OOBE may still handle config convenience (theme
row, first groups, first batch of users) — never privilege.

---

## The Dataverse permission reality (the key correction)

**Sharing the app + adding someone to an in-app group does NOT grant data access.** Once an
environment has a Dataverse database, app access and data access are separate grants. Without a
**security role**, every Dataverse query returns 403 and the app is a blank shell — including for
the first admin. *(Verified via search, June 2026.)*

**Joe's instinct — "the app holds table permissions, no human does" — is a real pattern, but not
available here.** That's the **service principal / application user**: a non-human identity that
carries security roles. It is **server-side only** (reachable via SDK/API, not interactively). To
use it, the code app could no longer touch Dataverse directly — every read/write would route through
a **service-principal-backed flow or hosted API**, dragging in an app registration + client secret,
premium/hosted infrastructure (service-principal-owned flows ≈ **$150/flow/month**), and a backend
to maintain. **More** ITS dependency and fragility — rejected. *(Verified via search.)*

**The relief — roles are set once, not per user:**
- **Security roles are the only authorization mechanism in Dataverse.** Unavoidable. *(Verified.)*
- But you **don't** assign roles per individual. You set table privileges **once** on a role, hang
  that role on a **team**, and then onboarding = **add the person to the team**. No per-user table
  editing ever again.

---

## Terminology untangled (this caused most of the confusion)

### "Team" — two unrelated things that share a word
- **What we mean by "team":** a **Dataverse security team / group team** — a bucket of users *inside
  the environment* that a security role hangs on. Nothing to do with the chat app.
- **Microsoft Teams** (chat) and **Dataverse for Teams** (a product) are separate.

### Dataverse for Teams (DVFT) — ruled OUT
The doc Joe found (`dataverse-for-teams-table-permissions`) is about DVFT, a stripped-down Dataverse
that lives inside a Microsoft Team. It's a **dead end** for this architecture: *(all verified via
search)*
- **Can't run the code app** — DVFT only works inside the Teams client; using it outside requires
  upgrading to full Dataverse. A code app opens at a browser play URL = "outside Teams." Also no
  direct API access, canvas-only, no code components.
- **Coarser permissions** — table access is preset by Team role (Owner/Member/Guest); doesn't map to
  the Admin/Booker/Viewer design.
- **Data dies with the Team** — deleting the Team deletes the environment and all data. Unacceptable
  for a production system holding reservation history.

### "Environment" — one container, several names
"Power Apps environment" = "Power Platform environment" = "Dataverse environment" — the **same
container**. The only variable is whether a Dataverse database is switched on inside it. Joe's
(`orgdaa34530.crm.dynamics.com`) has one, so the environment *is* where Dataverse lives. Everything
— tables, security roles, security teams — sits **inside** that one box.

---

## The two grouping systems (NOT redundant — two different jobs)

| | **Entra security group** (→ group team → role) | **In-app group** (`sfsures_group` + junctions) |
|---|---|---|
| Job | **Can you touch the data at all?** | **Which resources can you book?** |
| Nickname | the door key | the allow-list |
| Lives | in the directory / surfaced into the env | a row in your Dataverse tables (business data) |
| Seen by Dataverse's permission engine? | **Yes** (via the role it carries) | **No** — it's just data |

- The in-app groups **cannot** grant data access — the permission engine never reads them.
- The in-app groups are **not removable** — they're how "the Biology group shares the microscopes"
  works (the two-junction design in the build sheet). That layer stays.
- The **access layer** (the group-that-carries-a-role) is the part still in flux (see forks).

### Entra ID vs Active Directory
- **Entra ID** = the **cloud** directory (renamed Azure AD, 2023).
- **Active Directory** (unqualified) usually = **on-prem** AD (Windows Server directory).
- Often **synced** (hybrid): an on-prem AD group can sync *up* into Entra. Any given group is either
  **cloud-native** or **synced-from-on-prem**.
- Membership of a **synced** group is managed **on-prem**; only a **cloud-native** group's membership
  is delegable to an owner in Entra.

---

## The OU-group path: attempted, hit a wall

**Plan tested:** Joe can create AD security groups in his **delegated OU** → sync to Entra → use as a
group team. Attractive because it needs no ITS for the group.

**Verified along the way (search, June 2026):**
- **Group scope → use `Universal`.** All three scopes (Universal/Global/Domain Local) *can* sync, but
  Universal has no caveats and is the scope Cloud Sync / writeback require. Single-domain forest makes
  Global vs Universal otherwise academic; Universal avoids nesting headaches.
- **Verifying sync without Entra admin:**
  - **My Groups portal:** `myaccount.microsoft.com/groups` — any signed-in user can see groups they
    *belong to* (add yourself first; can view but not edit synced-group membership there).
  - **Power Apps share picker:** type the group name in an app's Share dialog (directory search; no
    membership needed).
  - **Graph Explorer:** `developer.microsoft.com/graph/graph-explorer` → `GET /me/memberOf` (may hit
    a consent wall for non-admins).

**Result that stopped this path:** the new group — **and none of Joe's existing AD groups** — appear
in the Power Apps picker.

**Likely cause (verified via search):** Power Platform's environment/access guidance says to use a
**cloud Entra security group** and explicitly states **on-premises Windows AD security groups aren't
supported** for controlling access. An OU group is on-prem-originated, so even if it syncs to Entra,
Power Platform may not accept it here — consistent with the symptom.

**Still worth one confirming check (to distinguish the two failure modes):** open
`myaccount.microsoft.com/groups` or Graph `GET /me/memberOf` and see whether **any** AD group Joe is
*already* a member of on-prem shows up.
- If yes → groups reach Entra, but on-prem-origin makes them unusable for access (use a different
  mechanism).
- If no → the OU isn't in Entra Connect sync scope at all (a config item owned by whoever runs Entra
  Connect).
Either way, the OU-group plan doesn't survive cleanly.

---

## Leading alternative (NOT decided): Dataverse-native team

Sidesteps every issue above — no Entra group, no AD sync, no Entra admin.

- Create the **team inside Dataverse** (in the environment, with **System Administrator** there).
- **Attach the security role** to the team.
- **Add members directly** in the Power Platform admin center.
- Onboarding = "add the user to the team"; membership management can be **delegated to an app admin**
  via a security-role privilege.

**Tradeoff (eyes open):** membership lives in the **Power Platform admin center**, not managed by
owning a group, and not an in-app experience — a little less slick, but fully self-contained and
immune to the AD/Entra tangle.

**Dependency it implies:** Joe needs **System Administrator on the environment** to create teams —
this is the "environment-birth" grant discussed earlier (one-time, folds into the env-provisioning
ask). Provisioning the environment itself remains the one unavoidable ITS action (Joe can't create
environments).

---

## Open forks (carry into next session — none resolved)

1. **Access mechanism:** Dataverse-native team (leading) vs. a **cloud-native Entra security group**
   (cleaner/supported, but Joe can't self-create one without Entra rights) vs. abandoning the
   on-prem OU-group idea (effectively done).
2. **Role granularity:** one access group ("can use app," with Admin/Booker/Viewer decided by app
   logic — softer boundary) vs. two (Users + Admins hard-enforced) vs. three (one per role).
3. **First-admin + theme seed** at deploy: the concrete steps that make a fresh instance usable
   without a land-grab.
4. **System Admin on the environment** for Joe — confirm this is the grant that unlocks the
   Dataverse-team route.
5. **Code-app preview verification** still outstanding: confirm share/role/team behavior on a
   throwaway app before building governance on it.

---

## Immediate next steps

1. Run the one-line Entra check (`myaccount.microsoft.com/groups` or Graph `GET /me/memberOf`) against
   a **known existing** on-prem AD membership to learn whether the OU even syncs — closes out the
   OU-group question definitively.
2. Decide the access mechanism (likely **Dataverse-native team**), then the role granularity.
3. Pin down the **App User write privileges per role** (the build sheet's security-role table doesn't
   yet say who can write App User — Admin needs CRUD; Booker/Viewer Read-or-None). This is what makes
   any guarded first-run safe.
4. Specify the **deploy-time seed** (first admin App User row + active theme row).
5. Then return to the schema build and the rest of the build-sheet pre-publish checklist.

---

## How to resume

Open next session with: "Resuming the access/onboarding model — pick up at the open forks." Run the
sync check first if not already done. This file + the build sheet are the source of truth; nothing
here is locked.
