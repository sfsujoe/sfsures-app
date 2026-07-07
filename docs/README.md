# SFSU Reservation System Documentation

This folder is the local reference library for the SFSU Resource Reservation System, a Power Apps Code App built with React, TypeScript, Vite, FullCalendar, Office365Users, and Microsoft Dataverse. The app is intended to replace LabArchives Scheduler for SFSU resource booking, with a Dataverse-backed model for resources, reservations, blackout windows, group-scoped access, theming, audit logging, and per-department managed-solution replication.

Last indexed: 2026-07-07.

## Quick Project Shape

- `src/` contains the app source: `AccessGate`, `UserContext`, `CalendarScreen`, `BookingModal`, accessibility helpers, theme context, and generated Dataverse/Office365 service/model files.
- `.power/` contains generated Power Apps schema metadata for Dataverse and Office365Users.
- `power.config.json` binds this local Code App to the Power Apps environment and lists all 14 Dataverse data sources.
- `dist/` is the built app output; `public/` currently only holds the Vite asset.
- `docs/` contains historical runbooks, schema references, security notes, and current implementation addenda.

## Recommended Reading Order

1. [Dataverse Build Sheet](sfsu_dataverse_build_sheet.md) for the canonical 14-table schema and replication spec. Note: this file currently has copied project/export noise before the actual build-sheet heading; search for `Dataverse Build Sheet` if needed.
2. [Security Roles and Teams Addendum](sfsu_security_roles_and_teams_addendum.md) for the current enforcement model; it supersedes older role/team next steps.
3. [Threat Model Addendum](sfsu_threat_model_addendum.md) for platform-enforced vs app-enforced rules and accepted residual risks.
4. [UI Build Kickoff Addendum](sfsu_ui_build_kickoff_addendum.md) for the published schema, generated service names, and Code App scaffold facts.
5. [Booking Modal and Layout Fix Addendum](sfsu_booking_modal_and_layout_fix_addendum.md) for the current end-to-end booking MVP and Dataverse lookup conventions.
6. [UI Branding and Booking Confirmation Polish Addendum](sfsu_ui_branding_and_booking_confirmation_addendum.md) for the current modal confirmation behavior, bundled SFSU logo/font defaults, and calendar visual polish.
7. [Reservation Details, Comments, and Limits Addendum](sfsu_ui_reservation_details_comments_and_limits_addendum.md) for the current header/profile polish, reservation detail modal, comments, and App Settings-backed reservation limits.
8. [Recurrence, App Permissions, and Calendar Actions Addendum](sfsu_recurrence_permissions_calendar_addendum.md) for current recurring reservation workflows, app-level group permissions, edit/delete reservation actions, and calendar-layout decisions.
9. [Accessibility Tier 1 Addendum](sfsu_accessibility_tier1_addendum.md) for completed accessibility fixes and queued DPRC/WCAG work.
10. [Environment and Demo Planning Addendum](sfsu_environment_and_demo_planning_addendum.md) for sandbox/production environment strategy and demo plan.
11. Older planning and exploration docs are useful for rationale, but treat newer addenda above as current when they conflict.

## Session Workflow

- Start a new SFSURES chat with `$sfsures-start-chat go` to load `docs/README.md`, canonical project context, current status, and likely next steps.
- End a work session with `$sfsures-docs-closeout go` to create a new addendum, update this README only where needed, and check local Markdown links.
- The skill setup and rationale are documented in [sfsu_docs_workflow_and_skills_addendum.md](sfsu_docs_workflow_and_skills_addendum.md).

## Documentation Index

| File | Purpose |
|---|---|
| [README.md](README.md) | This onboarding guide and index for future local reference sessions. |
| [sfsu_access_validation_and_logging_addendum.md](sfsu_access_validation_and_logging_addendum.md) | Proves the write path, confirms the two-grant access model, selects Dataverse-native Owner teams, and locks the audit-log table concept. |
| [sfsu_accessibility_tier1_addendum.md](sfsu_accessibility_tier1_addendum.md) | Records Tier 1 accessibility and UI-polish work: focus traps, keyboard booking path, live regions, focus rings, and iframe/CSP findings. |
| [sfsu_booking_modal_and_layout_fix_addendum.md](sfsu_booking_modal_and_layout_fix_addendum.md) | Documents the working published booking loop, AccessGate identity fix, full-width layout fix, lookup read/write conventions, and remaining UI gaps. |
| [sfsu_codeapp_vscode_runbook_addendum.md](sfsu_codeapp_vscode_runbook_addendum.md) | Validates the VS Code + `npx power-apps` Code App path, generated Dataverse service use, and delegation-safe query pattern. |
| [sfsu_dataverse_build_sheet.md](sfsu_dataverse_build_sheet.md) | Canonical schema and replication reference for the 14 Dataverse tables, ownership model, security-role plan, and pre-publish checks. |
| [sfsu_docs_workflow_and_skills_addendum.md](sfsu_docs_workflow_and_skills_addendum.md) | Records the docs index strategy and the personal Codex skills for starting and closing SFSURES sessions. |
| [sfsu_environment_and_demo_planning_addendum.md](sfsu_environment_and_demo_planning_addendum.md) | Captures environment inventory, sandbox/production ask, demo strategy, DoS/flooding analysis, and recovery controls. |
| [sfsu_governance_and_claudecode_addendum.md](sfsu_governance_and_claudecode_addendum.md) | Explains governance decisions: VS Code workflow, separate per-department instances, stable `sfsures` prefix, hand-built schema, and ownership continuity. |
| [sfsu_learning_app_runbook.md](sfsu_learning_app_runbook.md) | Step-by-step throwaway one-table app used to learn and re-test Dataverse read/write behavior in a Code App. |
| [sfsu_onboarding_and_access_exploration.md](sfsu_onboarding_and_access_exploration.md) | Historical exploration of first-admin onboarding, Entra/AD limitations, Dataverse teams, and unresolved access forks at that time. |
| [sfsu_reservation_system_chat_summary.md](sfsu_reservation_system_chat_summary.md) | Early full-chat summary of product scope, permissions, SF State ID identity, no-approval workflow, and vibe-coding expectations. |
| [sfsu_reservation_system_progress.md](sfsu_reservation_system_progress.md) | Early planning runbook covering metadata-driven resources, materialized recurrence occurrences, FullCalendar direction, and delegation risk. |
| [sfsu_reservation_system_summary.md](sfsu_reservation_system_summary.md) | Early structured product summary for the intended reservation system and AI prompt context. |
| [sfsu_recurrence_permissions_calendar_addendum.md](sfsu_recurrence_permissions_calendar_addendum.md) | Documents recurring reservation create/edit/delete workflows, seeded app-permission groups, reservation-info actions, and calendar layout decisions. |
| [sfsu_schema_build_complete_addendum.md](sfsu_schema_build_complete_addendum.md) | Historical schema-build completion note; still useful for rationale, but some ownership/naming facts were superseded by the security roles/teams addendum. |
| [sfsu_security_roles_and_teams_addendum.md](sfsu_security_roles_and_teams_addendum.md) | Current source for security roles, Owner teams, reservation-table ownership, privilege inheritance, and enforcement-layer open tests. |
| [sfsu_threat_model_addendum.md](sfsu_threat_model_addendum.md) | Current source for known vulnerabilities, API-bypass risks, metadata discoverability, audit-log limitations, and detective controls. |
| [sfsu_ui_branding_and_booking_confirmation_addendum.md](sfsu_ui_branding_and_booking_confirmation_addendum.md) | Documents the centered booking confirmation modal, bundled SFSU logo and Source Sans 3 defaults, header/date-header polish, and deferred scrollbar-arrow issue. |
| [sfsu_ui_build_kickoff_addendum.md](sfsu_ui_build_kickoff_addendum.md) | Records schema publication, all generated service/model filenames, build status, and first UI-build instructions. |
| [sfsu_ui_reservation_details_comments_and_limits_addendum.md](sfsu_ui_reservation_details_comments_and_limits_addendum.md) | Documents clickable/header profile polish, reservation owner details, plain-text comments, App Settings-backed limits, and chunk-size carry-forward guidance. |
| [sfsu_vibe_coding_session_notes.md](sfsu_vibe_coding_session_notes.md) | Earliest vibe-coding preparation notes; useful mostly as historical context for why Vibe was later retired. |

## Dataverse Schema Documentation

Start with [sfsu_dataverse_build_sheet.md](sfsu_dataverse_build_sheet.md). It defines the dependency-first build order and all 14 tables:

1. Resource Type
2. Attribute Definition
3. Resource
4. Resource Attribute Value
5. App User
6. Group
7. User Group Assignment
8. Group Resource Type Access
9. Group Resource Access
10. Reservation Series
11. Reservation Occurrence
12. Blackout Window
13. App Settings
14. Audit Log

Schema rules to preserve:

- Publisher prefix is `sfsures` and must remain stable across department instances.
- Reservation Series and Reservation Occurrence are User/team-owned; the other 12 tables are Organization-owned.
- `sfsures_BookingOwner` is business data and is distinct from Dataverse system `OwnerId`.
- Reservation Series and Reservation Occurrence both include optional plain-text `sfsures_comments`; generated occurrence rows should carry comments for fast calendar/detail reads.
- Resource attributes use five typed value columns, not JSON.
- Group resource-type access and group resource access are two separate explicit junction tables.
- App User is keyed by write-once SF State ID.
- Group includes stable `Group Key` and `Is System Group` fields. App logic keys off system group keys such as `APP_ADMINS` and `REPORT_VIEWERS`, not mutable group display names.
- Audit Log is append-only, denormalized on purpose, and should not use live lookup relationships for historical context.

For generated TypeScript names, use [sfsu_ui_build_kickoff_addendum.md](sfsu_ui_build_kickoff_addendum.md). The CLI pluralizes some names unexpectedly, including `appsettingses` and `reservationserieses`.

## Architecture and Decision History

Current architecture:

- Code App built in VS Code, not Vibe, using React/TypeScript/Vite and the Power Apps npm CLI.
- Dataverse is the backend, with generated service/model files under `src/generated/`.
- Office365Users supplies the signed-in user's UPN; the app extracts the first 9 characters as SF State ID.
- FullCalendar renders reservation occurrences and blackout windows.
- App-level group membership drives UI visibility for app-admin and report-view capabilities; Dataverse roles still define the backend access boundary.
- Per-department instances are preferred over one campus-wide app; managed-solution export/import is the replication path.
- Environment-level Dataverse security roles are the real authorization boundary; in-app role checks are presentation logic only.

Decision-history docs:

- [sfsu_governance_and_claudecode_addendum.md](sfsu_governance_and_claudecode_addendum.md) explains the shift to VS Code, hand-built schema, stable prefix, and per-department instance model.
- [sfsu_codeapp_vscode_runbook_addendum.md](sfsu_codeapp_vscode_runbook_addendum.md) proves the Code App toolchain and data-source pattern.
- [sfsu_schema_build_complete_addendum.md](sfsu_schema_build_complete_addendum.md) captures schema-build rationale, but use newer docs for current ownership facts.
- [sfsu_reservation_system_progress.md](sfsu_reservation_system_progress.md), [sfsu_reservation_system_summary.md](sfsu_reservation_system_summary.md), [sfsu_reservation_system_chat_summary.md](sfsu_reservation_system_chat_summary.md), and [sfsu_vibe_coding_session_notes.md](sfsu_vibe_coding_session_notes.md) are historical product and prompt-design context.

## Security Notes and Known Risks

Read [sfsu_security_roles_and_teams_addendum.md](sfsu_security_roles_and_teams_addendum.md) and [sfsu_threat_model_addendum.md](sfsu_threat_model_addendum.md) before changing access, booking, or audit behavior.

Current security model:

- Three Owner teams exist: `sfsures Admins`, `sfsures Bookers`, and `sfsures Viewers`.
- Each team carries exactly one role: Admin, Booker, or Viewer.
- Viewer can read calendar/catalog data but cannot create reservations.
- Booker can create reservations and read all reservations for calendar/conflict checks, but should only edit/delete own reservation rows through User-level privileges.
- Admin has broad management rights, but Audit Log write/delete remain blocked even for Admin.
- In-app app-admin/report-view privileges are currently represented by seeded Group rows keyed as `APP_ADMINS` and `REPORT_VIEWERS`.
- App sharing and Dataverse role/team membership must stay aligned; sharing wider than the teams may expand the API-accessible population.

Known risks and accepted residuals:

- Resource-scope checks, blackout enforcement, conflict detection, recurrence atomicity, write-once SF State ID, disable-not-delete, and single-active-theme are app-enforced only.
- Onboarded Bookers can discover schema metadata and may bypass app-layer resource checks through raw Dataverse API calls.
- Audit logs are tamper-resistant against edits/deletes but not injection-proof; reconciliation must compare system columns against app-written actor fields.
- Missing read privileges can return empty `.data`, which can look like "no rows" unless screens handle it explicitly.
- Booker own-record enforcement and mid-session revocation still require non-admin testing.

## Current MVP Status vs Future Production Work

Current MVP, based on the docs and source tree:

- React/Vite Code App scaffold exists and is bound to the Power Apps environment in `power.config.json`.
- All 14 Dataverse service/model files are generated.
- `AccessGate` validates the signed-in user through Office365Users and App User rows before rendering content, then loads active app group memberships for UI permission flags.
- `CalendarScreen` loads occurrences and blackout windows with delegation-safe query shapes and renders them with FullCalendar, including centered header branding, signed-in user profile photo, yellow date headers, 24-hour Week/Day views, and a reservation detail dialog with owner profile, comments, and edit/delete actions.
- `BookingModal` creates and updates single reservations and recurring reservation series against real Dataverse data, including optional Comments, then shows a centered confirmation state with `Edit Reservation` and focused `OK`.
- Recurring reservation create/edit supports daily, weekly, and monthly patterns with count/until end modes and generated occurrence rows.
- Conflict detection against active occurrences and blackout windows is implemented for single bookings and recurring occurrence generation.
- Theme values load through `ThemeContext` from `sfsures_appsettings`, with portable bundled SFSU logo and Source Sans 3 defaults as fallback.
- Reservation limits are loaded from `sfsures_appsettings` with code hard caps: max 50 generated occurrences and max 18 weeks per reservation/series span. App Admins may configure more restrictive values only.
- Tier 1 accessibility work is partly implemented: focus trap helper, dialog semantics, visible focus ring, keyboard booking path, and live regions.

Future production work:

- Resource Type dropdown and group-scoped calendar filtering.
- Resource group-scoping in the booking picker and related UI.
- Admin screens for resource catalog, users, groups, blackout windows, and app settings/theme picker. The App Settings screen must show the hard maximum beside each configurable reservation limit.
- Custom app-owned calendar toolbar so the date range can stay truly centered while Resource Type, view controls, and other controls grow around it.
- Recurring reservation "cancel future events" workflow.
- Transactional/server-side hardening for series create/edit/delete if the MVP's sequential Dataverse writes prove too fragile.
- Lazy-load future admin/settings/report screens once navigation arrives so the calendar bundle stays lean; the current Vite large chunk warning is a baseline metric, not a blocker.
- Reports/export screens and Excel/SharePoint outputs.
- Full DPRC/WCAG verification, including screen-reader testing and Tier 2/Tier 3 accessibility work.
- Optional calendar layout follow-up if native scrollbar arrow buttons remain distracting in the Power Apps/browser host.
- Production and sandbox environment provisioning, managed-solution import/export, and production role creation confirmation.
- Booker inheritance test with a non-admin identity, mid-session revocation test, and broader pen-testing roadmap.
- Nightly export flow, anomaly-alert flow, audit-log purge role, co-owner/ITS reassignment backstop, Application Insights, and possible Dataverse plugin hardening.

## Gaps, TODOs, and Questions

- `sfsu_dataverse_build_sheet.md` appears to include copied Claude/project UI text before the actual build-sheet content; clean that in a future docs pass.
- `sfsu_schema_build_complete_addendum.md` contains superseded ownership/naming facts; add a superseded notice or revise it later.
- Several older docs mention Vibe or Claude browser-extension workflows that have since been retired; keep them historical unless explicitly reviving that path.
- Decide later whether a repo-local `AGENTS.md` or `CLAUDE.md` is still needed; for now, personal skills plus this README cover startup and closeout.
- Native scrollbar arrow buttons can still appear inside the calendar host; earlier CSS attempts were ineffective and should stay deferred unless layout changes make them easier to remove.
- Header title and calendar date-range centering should be revisited before adding Admin and Resource Type controls. Admin/global settings belong in the header's right action area; Resource Type belongs in an app-owned calendar toolbar.
- Secondary and destructive button colors are currently hard-coded semantic CSS; only primary/action branding is consistently theme-driven.
- Series edit/delete currently uses sequential Dataverse writes, not a true transaction. Keep this accepted MVP limitation visible until a custom API/plugin/app-only backend is in scope.
- Add a recurring-series "cancel future events" workflow in addition to the implemented occurrence and whole-series actions.
- Verify `cose-res-demo-sandbox` code-app support and Joe's System Administrator rights there.
- Confirm production environment custom role creation and System Administrator grant.
- Run the non-admin Booker test: own reservation write/delete succeeds, peer reservation write/delete returns 403.
- Measure mid-session revocation behavior after removing a user from an Owner team.
- Decide when to build server-side hardening: Dataverse plugin, Application Insights, anomaly flow, and reconciliation reports.
