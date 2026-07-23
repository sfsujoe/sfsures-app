# SFSU Reservation System Documentation

This folder is the local reference library for the SFSU Resource Reservation System, a Power Apps Code App built with React, TypeScript, Vite, FullCalendar, Office365Users, and Microsoft Dataverse. The app is intended to replace LabArchives Scheduler for SFSU resource booking, with a Dataverse-backed model for resources, reservations, blackout windows, group-scoped access, theming, audit logging, and per-department managed-solution replication.

Last indexed: 2026-07-23.

## Next Session: Dataverse Plug-in Hardening Plan

Reports viewer polish and the first Visualization mode are implemented locally. The direct Dataverse API bypass discussion selected synchronous Dataverse plug-ins as the preferred server-side hardening route. Next session, start with [Dataverse Plug-in Hardening Decision Addendum](sfsu_dataverse_plugin_hardening_addendum.md), then draft the plug-in step matrix for Reservation Occurrence, Reservation Series, and Reservation Attribute Value.

## Quick Project Shape

- `src/` contains the app source: `AccessGate`, `UserContext`, `CalendarScreen`, `BookingModal`, accessibility helpers, theme context, and generated Dataverse/Office365 service/model files.
- `.power/` contains generated Power Apps schema metadata for Dataverse and Office365Users.
- `power.config.json` binds this local Code App to the Power Apps environment and lists the 16 custom Dataverse tables plus the built-in System User data source.
- `dist/` is the built app output; `public/` currently only holds the Vite asset.
- `docs/` contains historical runbooks, schema references, security notes, and current implementation addenda.

## Recommended Reading Order

1. [Dataverse Plug-in Hardening Decision Addendum](sfsu_dataverse_plugin_hardening_addendum.md) for the selected synchronous plug-in hardening path, portability rationale, proposed guard boundary, and limitations.
2. [Security Roles and Teams Addendum](sfsu_security_roles_and_teams_addendum.md) for the current enforcement model; it supersedes older role/team next steps.
3. [Threat Model Addendum](sfsu_threat_model_addendum.md) for platform-enforced vs app-enforced rules, direct Dataverse API bypass risks, and accepted residuals.
4. [Reports Viewer Polish and Visualizations Addendum](sfsu_reports_viewer_visualizations_addendum.md) for the current Reports viewer polish, Comments-column behavior, left-rail mode switch, SVG visualization mode, and remaining Reports follow-up.
5. [Reports Screen and Saved Reports Addendum](sfsu_reports_screen_and_saved_reports_addendum.md) for the standalone Reports entry point, first reservation report screen, Saved Report table/data source, and original Reports implementation rationale.
6. [Calendar Resource Filters and Admin IA Split Addendum](sfsu_calendar_resource_filters_and_admin_ia_split_addendum.md) for the current calendar Resource Type/View Resource filters, Resource Info modal, reserve handoff, BookingModal selector behavior, logo focus fix, and Admin Resource Types/Resources split.
7. [Admin Blackouts Addendum](sfsu_admin_blackouts_addendum.md) for the implemented Admin Blackouts screen, blackout conflict/calendar terminology fixes, removal flow, and earlier Admin rail follow-up.
8. [Help Site and Calendar Header Addendum](sfsu_help_site_and_calendar_header_addendum.md) for verified Custom Field display, Help/Gateway header polish, the standalone end-user help route, and the previous Blackouts handoff.
9. [Dataverse Build Sheet](sfsu_dataverse_build_sheet.md) for the canonical base schema and the Blackout Window table; read newer addenda for the Reservation Attribute Value and Saved Report extensions. Note: this file currently has copied project/export noise before the actual build-sheet heading; search for `Dataverse Build Sheet` if needed.
10. [Generated Dataverse Name Fields Addendum](sfsu_generated_dataverse_name_fields_addendum.md) for the durable rule against selecting generated phantom custom `*name` fields.
11. [Resource Attributes and Custom Fields Addendum](sfsu_resource_attributes_and_custom_fields_addendum.md) for Resource Attributes vs Custom Fields terminology, inheritance behavior, reservation answer persistence, and calendar detail display.
12. [Group Permissions and Reservation Custom Fields Addendum](sfsu_group_permissions_and_reservation_custom_fields_addendum.md) for group-only permission behavior and the reservation-answer schema/data-source extension; its "not yet implemented" UI status is superseded by the newer addendum above.
13. [UI Build Kickoff Addendum](sfsu_ui_build_kickoff_addendum.md) for the published base schema, generated service names, and Code App scaffold facts.
14. [Booking Modal and Layout Fix Addendum](sfsu_booking_modal_and_layout_fix_addendum.md) for the current end-to-end booking MVP and Dataverse lookup conventions.
15. [UI Branding and Booking Confirmation Polish Addendum](sfsu_ui_branding_and_booking_confirmation_addendum.md) for the current modal confirmation behavior, bundled SFSU logo/font defaults, and calendar visual polish.
16. [Reservation Details, Comments, and Limits Addendum](sfsu_ui_reservation_details_comments_and_limits_addendum.md) for the current header/profile polish, reservation detail modal, comments, and App Settings-backed reservation limits.
17. [Recurrence, App Permissions, and Calendar Actions Addendum](sfsu_recurrence_permissions_calendar_addendum.md) for current recurring reservation workflows, app-level group permissions, edit/delete reservation actions, and calendar-layout decisions.
18. [Admin Theme, Users, Groups, and Audit Logging Addendum](sfsu_admin_theme_users_groups_audit_addendum.md) for the lazy admin shell, SFSU preset theming, resource calendar colors, and the earlier Users/Groups/audit implementation.
19. [App User Dataverse Mapping and Safer Onboarding Addendum](sfsu_appuser_dataverse_mapping_and_onboarding_addendum.md) for the App User-to-System User lookup, fail-closed onboarding, and Add User confirmation.
20. [Admin Resources Catalog and Photos Addendum](sfsu_admin_resources_catalog_addendum.md) for the earlier combined Resources admin screen, Resource Photo image upload/preview, inactive Resource Type reservability, and Resource data-source refresh notes.
21. [Accessibility Tier 1 Addendum](sfsu_accessibility_tier1_addendum.md) for completed accessibility fixes and queued DPRC/WCAG work.
22. [Environment and Demo Planning Addendum](sfsu_environment_and_demo_planning_addendum.md) for sandbox/production environment strategy and demo plan.
23. Older planning and exploration docs are useful for rationale, but treat newer addenda above as current when they conflict.

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
| [sfsu_admin_blackouts_addendum.md](sfsu_admin_blackouts_addendum.md) | Documents the implemented Admin Blackouts screen, blackout overlap reporting, app-native removal modal, calendar/booking terminology fixes, and Admin rail follow-up reminders. |
| [sfsu_admin_resources_catalog_addendum.md](sfsu_admin_resources_catalog_addendum.md) | Documents the active Resources admin screen, Resource Type inherited reservability, Resource Photo image upload/preview, and Resource data-source refresh lesson. |
| [sfsu_admin_theme_users_groups_audit_addendum.md](sfsu_admin_theme_users_groups_audit_addendum.md) | Documents the lazy admin shell, SFSU preset theming, resource calendar colors, Users/Groups admin screens, and first group audit-log writes. |
| [sfsu_appuser_dataverse_mapping_and_onboarding_addendum.md](sfsu_appuser_dataverse_mapping_and_onboarding_addendum.md) | Documents App User-to-System User mapping, fail-closed onboarding, Add User confirmation friction, and the next reservation-owner/custom-attribute work. |
| [sfsu_booking_modal_and_layout_fix_addendum.md](sfsu_booking_modal_and_layout_fix_addendum.md) | Documents the working published booking loop, AccessGate identity fix, full-width layout fix, lookup read/write conventions, and remaining UI gaps. |
| [sfsu_calendar_resource_filters_and_admin_ia_split_addendum.md](sfsu_calendar_resource_filters_and_admin_ia_split_addendum.md) | Documents the Admin Resource Types/Resources rail split, calendar Resource Type/View Resource filters, Resource Info modal/photo preview, reserve handoff, BookingModal filter/locked edit fields, and logo focus-area polish. |
| [sfsu_codeapp_vscode_runbook_addendum.md](sfsu_codeapp_vscode_runbook_addendum.md) | Validates the VS Code + `npx power-apps` Code App path, generated Dataverse service use, and delegation-safe query pattern. |
| [sfsu_dataverse_build_sheet.md](sfsu_dataverse_build_sheet.md) | Canonical reference for the original 14-table schema, ownership model, roles, and pre-publish checks; use the group-permissions/custom-fields addendum for the fifteenth-table extension. |
| [sfsu_dataverse_plugin_hardening_addendum.md](sfsu_dataverse_plugin_hardening_addendum.md) | Documents the decision to use synchronous Dataverse plug-ins for reservation write hardening, including rationale, portability, proposed guards, and limitations. |
| [sfsu_docs_workflow_and_skills_addendum.md](sfsu_docs_workflow_and_skills_addendum.md) | Records the docs index strategy and the personal Codex skills for starting and closing SFSURES sessions. |
| [sfsu_environment_and_demo_planning_addendum.md](sfsu_environment_and_demo_planning_addendum.md) | Captures environment inventory, sandbox/production ask, demo strategy, DoS/flooding analysis, and recovery controls. |
| [sfsu_generated_dataverse_name_fields_addendum.md](sfsu_generated_dataverse_name_fields_addendum.md) | Documents the reservation-info Custom Fields bug and the durable rule against selecting generated phantom custom `*name` fields. |
| [sfsu_governance_and_claudecode_addendum.md](sfsu_governance_and_claudecode_addendum.md) | Explains governance decisions: VS Code workflow, separate per-department instances, stable `sfsures` prefix, hand-built schema, and ownership continuity. |
| [sfsu_group_permissions_and_reservation_custom_fields_addendum.md](sfsu_group_permissions_and_reservation_custom_fields_addendum.md) | Records group-only Resource Type permissions, protected system groups, Admin booking exceptions, early Resource custom fields, and the reservation-answer schema/data sources. |
| [sfsu_help_site_and_calendar_header_addendum.md](sfsu_help_site_and_calendar_header_addendum.md) | Documents the calendar Help/Gateway header polish, first end-user help route, published Custom Field verification, and next-session Blackouts handoff. |
| [sfsu_learning_app_runbook.md](sfsu_learning_app_runbook.md) | Step-by-step throwaway one-table app used to learn and re-test Dataverse read/write behavior in a Code App. |
| [sfsu_onboarding_and_access_exploration.md](sfsu_onboarding_and_access_exploration.md) | Historical exploration of first-admin onboarding, Entra/AD limitations, Dataverse teams, and unresolved access forks at that time. |
| [sfsu_reservation_system_chat_summary.md](sfsu_reservation_system_chat_summary.md) | Early full-chat summary of product scope, permissions, SF State ID identity, no-approval workflow, and vibe-coding expectations. |
| [sfsu_reservation_system_progress.md](sfsu_reservation_system_progress.md) | Early planning runbook covering metadata-driven resources, materialized recurrence occurrences, FullCalendar direction, and delegation risk. |
| [sfsu_reservation_system_summary.md](sfsu_reservation_system_summary.md) | Early structured product summary for the intended reservation system and AI prompt context. |
| [sfsu_recurrence_permissions_calendar_addendum.md](sfsu_recurrence_permissions_calendar_addendum.md) | Documents recurring reservation create/edit/delete workflows, seeded app-permission groups, reservation-info actions, and calendar layout decisions. |
| [sfsu_reports_viewer_visualizations_addendum.md](sfsu_reports_viewer_visualizations_addendum.md) | Documents Reports viewer polish, Title-column removal, bounded Comments display, left-rail mode switch, SVG visualization mode, and remaining Reports follow-up. |
| [sfsu_reports_screen_and_saved_reports_addendum.md](sfsu_reports_screen_and_saved_reports_addendum.md) | Documents the standalone Reports entry point, first reservation report screen, CSV/browser-grid behavior, Saved Report table/data source, and next report polish items. |
| [sfsu_resource_attributes_and_custom_fields_addendum.md](sfsu_resource_attributes_and_custom_fields_addendum.md) | Documents Resource Attributes vs Custom Fields, Resource Type/Resource scoped inheritance, booking answer persistence, deletion behavior, and calendar detail display. |
| [sfsu_schema_build_complete_addendum.md](sfsu_schema_build_complete_addendum.md) | Historical schema-build completion note; still useful for rationale, but some ownership/naming facts were superseded by the security roles/teams addendum. |
| [sfsu_security_roles_and_teams_addendum.md](sfsu_security_roles_and_teams_addendum.md) | Current source for security roles, Owner teams, reservation-table ownership, privilege inheritance, and enforcement-layer open tests. |
| [sfsu_threat_model_addendum.md](sfsu_threat_model_addendum.md) | Current source for known vulnerabilities, API-bypass risks, metadata discoverability, audit-log limitations, and detective controls. |
| [sfsu_ui_branding_and_booking_confirmation_addendum.md](sfsu_ui_branding_and_booking_confirmation_addendum.md) | Documents the centered booking confirmation modal, bundled SFSU logo and Source Sans 3 defaults, header/date-header polish, and deferred scrollbar-arrow issue. |
| [sfsu_ui_build_kickoff_addendum.md](sfsu_ui_build_kickoff_addendum.md) | Records schema publication, all generated service/model filenames, build status, and first UI-build instructions. |
| [sfsu_ui_reservation_details_comments_and_limits_addendum.md](sfsu_ui_reservation_details_comments_and_limits_addendum.md) | Documents clickable/header profile polish, reservation owner details, plain-text comments, App Settings-backed limits, and chunk-size carry-forward guidance. |
| [sfsu_vibe_coding_session_notes.md](sfsu_vibe_coding_session_notes.md) | Earliest vibe-coding preparation notes; useful mostly as historical context for why Vibe was later retired. |

## Dataverse Schema Documentation

Start with [sfsu_dataverse_build_sheet.md](sfsu_dataverse_build_sheet.md) for the original dependency-first build order, then read [sfsu_group_permissions_and_reservation_custom_fields_addendum.md](sfsu_group_permissions_and_reservation_custom_fields_addendum.md) for the reservation-answer extension, [sfsu_resource_attributes_and_custom_fields_addendum.md](sfsu_resource_attributes_and_custom_fields_addendum.md) for the current Resource Attribute/Custom Field implementation, and [sfsu_reports_screen_and_saved_reports_addendum.md](sfsu_reports_screen_and_saved_reports_addendum.md) for the Saved Report extension. The current solution has 16 custom tables:

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
12. Reservation Attribute Value
13. Blackout Window
14. App Settings
15. Audit Log
16. Saved Report

Schema rules to preserve:

- Publisher prefix is `sfsures` and must remain stable across department instances.
- Reservation Series, Reservation Occurrence, and Reservation Attribute Value are User/team-owned; the other 12 tables are Organization-owned.
- `sfsures_BookingOwner` is business data and is distinct from Dataverse system `OwnerId`.
- Reservation Series and Reservation Occurrence both include optional plain-text `sfsures_comments`; generated occurrence rows should carry comments for fast calendar/detail reads.
- Resource includes palette-only `Calendar Color` for reservation event colors; current choices are the SFSU primary/secondary palette colors except Bridge.
- Resource includes optional Dataverse Image column `Resource Photo` (`sfsures_resourcephoto`); generated metadata also exposes lowercase `sfsures_resourcephoto_url`, timestamp, id, and image upload/download helpers.
- Attribute Definition includes required `Applies To`: Resource `997330000` or Reservation `997330001`.
- Attribute Definition can be scoped to a Resource Type or a specific Resource. Resource scoped definitions are managed in Resource-specific modals; Resource Type scoped definitions are inherited.
- Resource Attributes use five typed value columns in Resource Attribute Value, not JSON. They are admin-entered Resource facts, not reservation questions.
- Custom Fields are reservation questions shown in New/Edit Reservation and answered into Reservation Attribute Value.
- Reservation answers use the same five typed value shapes in the separate Reservation Attribute Value table. Each answer references Attribute Definition and exactly one of Reservation Series or Reservation Occurrence; active alternate keys prevent duplicates per parent/definition pair.
- Group resource-type access and group resource access are two separate explicit junction tables.
- App User is keyed by write-once SF State ID and has an optional `Dataverse User` lookup to the built-in System User table for future reservation `OwnerId` assignment.
- Group includes stable `Group Key` and `Is System Group` fields. App logic keys off system group keys such as `APP_ADMINS` and `REPORT_VIEWERS`, not mutable group display names. Group Key should stay hidden from normal app UI.
- Audit Log is append-only, denormalized on purpose, and should not use live lookup relationships for historical context. It now includes generic `Target Key` plus split group action types for group creation/editing and membership add/remove.
- Saved Report is User/team-owned and stores named report filter definitions. `Filter JSON` (`sfsures_filterjson`) is required with a 32,000-character limit. Saved Report `Report Type` currently includes Reservations, Utilization, Cancellations, Resource Usage, User Activity, Audit Log, Blackouts, and Custom Field Responses.

For generated TypeScript names, use [sfsu_ui_build_kickoff_addendum.md](sfsu_ui_build_kickoff_addendum.md). The CLI pluralizes some names unexpectedly, including `appsettingses` and `reservationserieses`. Also read [sfsu_generated_dataverse_name_fields_addendum.md](sfsu_generated_dataverse_name_fields_addendum.md) before adding new `$select` fields: generated custom `sfsures_*name` properties may be phantom display-name fields unless live Dataverse metadata proves they are real columns.

## Architecture and Decision History

Current architecture:

- Code App built in VS Code, not Vibe, using React/TypeScript/Vite and the Power Apps npm CLI.
- Dataverse is the backend, with generated service/model files under `src/generated/`.
- Synchronous Dataverse plug-ins are the selected server-side hardening path for reservation write enforcement; they should be packaged with the managed solution as assembly and step components when implemented.
- Generated TypeScript models are helpful but not a complete `$select` contract; custom `sfsures_*name` fields that exist only on expanded interfaces must be verified or replaced with real table lookups.
- Office365Users supplies the signed-in user's UPN; the app extracts the first 9 characters as SF State ID.
- FullCalendar renders reservation occurrences and blackout windows.
- App-level group membership drives UI visibility for app-admin/report-view capabilities and group-only Resource Type `View`/`Book` access; Dataverse roles still define the backend table-access boundary.
- Individual Group Resource Access rows are retained but intentionally ignored at runtime. The shared permission resolver uses only Group Resource Type Access and excludes the protected `APP_ADMINS` and `REPORT_VIEWERS` groups.
- App Admins have implicit visibility to every Resource Type and may book any Resource for themselves. Booking for another user still requires that selected owner to have ordinary group-derived `Book` access.
- App User onboarding maps the Office365Users identity to exactly one enabled human Dataverse System User before creation; this keeps application identity/history separate from the security principal used by `OwnerId`.
- Admin screens live behind a lazy-loaded left-rail shell so the calendar-first experience stays light. Settings, Resource Types, Resources, Users, Groups, and Blackouts are active. Reports is a standalone route opened from the calendar header for App Admins and Report Viewers, not an Admin rail destination. Groups uses separate permission/member dialogs, and the Resource Types/Resources screens manage Resource Attributes and reservation Custom Fields at Resource Type and Resource scope.
- SFSU theme choices are preset-only; Source Sans 3 is fixed and arbitrary color/font selection is intentionally excluded from admin UI.
- Resource reservation event colors use a palette-only Resource `Calendar Color` choice plus dynamic black/white event text for contrast.
- Per-department instances are preferred over one campus-wide app; managed-solution export/import is the replication path.
- Environment-level Dataverse security roles are the real authorization boundary; in-app role checks are presentation logic only.

Decision-history docs:

- [sfsu_governance_and_claudecode_addendum.md](sfsu_governance_and_claudecode_addendum.md) explains the shift to VS Code, hand-built schema, stable prefix, and per-department instance model.
- [sfsu_codeapp_vscode_runbook_addendum.md](sfsu_codeapp_vscode_runbook_addendum.md) proves the Code App toolchain and data-source pattern.
- [sfsu_schema_build_complete_addendum.md](sfsu_schema_build_complete_addendum.md) captures schema-build rationale, but use newer docs for current ownership facts.
- [sfsu_reservation_system_progress.md](sfsu_reservation_system_progress.md), [sfsu_reservation_system_summary.md](sfsu_reservation_system_summary.md), [sfsu_reservation_system_chat_summary.md](sfsu_reservation_system_chat_summary.md), and [sfsu_vibe_coding_session_notes.md](sfsu_vibe_coding_session_notes.md) are historical product and prompt-design context.

## Security Notes and Known Risks

Read [sfsu_dataverse_plugin_hardening_addendum.md](sfsu_dataverse_plugin_hardening_addendum.md), [sfsu_security_roles_and_teams_addendum.md](sfsu_security_roles_and_teams_addendum.md), and [sfsu_threat_model_addendum.md](sfsu_threat_model_addendum.md) before changing access, booking, or audit behavior.

Current security model:

- Three Owner teams exist: `sfsures Admins`, `sfsures Bookers`, and `sfsures Viewers`.
- Each team carries exactly one role: Admin, Booker, or Viewer.
- Viewer can read calendar/catalog data but cannot create reservations.
- Booker can create reservations and read all reservations for calendar/conflict checks, but should only edit/delete own reservation rows through User-level privileges.
- Admin has broad management rights, but Audit Log write/delete remain blocked even for Admin.
- In-app app-admin/report-view privileges are currently represented by seeded Group rows keyed as `APP_ADMINS` and `REPORT_VIEWERS`.
- `APP_ADMINS` and `REPORT_VIEWERS` cannot have Resource Type permissions edited in the UI, and the runtime permission resolver ignores any permission rows attached to them.
- Ordinary Resource visibility/booking permissions are group-based and Resource-Type-scoped; there is no active direct-user or direct-Resource permission path.
- App sharing and Dataverse role/team membership must stay aligned; sharing wider than the teams may expand the API-accessible population.
- Synchronous Dataverse plug-ins are now the chosen hardening direction for preventing invalid reservation writes made outside the app UI.

Known risks and accepted residuals:

- Until plug-ins are implemented and registered, resource-scope checks, blackout enforcement, conflict detection, recurrence atomicity, write-once SF State ID, disable-not-delete, and single-active-theme remain app-enforced only.
- Until plug-ins are implemented and registered, onboarded Bookers can discover schema metadata and may bypass app-layer resource checks through raw Dataverse API calls.
- Audit logs are tamper-resistant against edits/deletes but not injection-proof; reconciliation must compare system columns against app-written actor fields.
- Missing read privileges can return empty `.data`, which can look like "no rows" unless screens handle it explicitly.
- Booker own-record enforcement and mid-session revocation still require non-admin testing.

## Current MVP Status vs Future Production Work

Current MVP, based on the docs and source tree:

- React/Vite Code App scaffold exists and is bound to the Power Apps environment in `power.config.json`.
- All 16 custom Dataverse service/model files are generated, including Reservation Attribute Value and Saved Report; the built-in System User source is also generated.
- `AccessGate` validates the signed-in user through Office365Users and App User rows before rendering content, then loads active app group memberships for UI permission flags.
- `CalendarScreen` loads occurrences, blackout windows, active resource calendar colors, permitted Resource Types/Resources, Attribute Definition labels, Resource Attribute values, and Custom Field answers with delegation-safe query shapes and renders them with FullCalendar, including centered header branding, signed-in user profile/Gateway link, Help menu, Resource Type event filtering, the `View Resource` dropdown and Resource Info modal, theme-driven date headers, 24-hour Week/Day views, resource-colored reservation events with contrast-aware text, and a reservation detail dialog with owner profile, comments, Resource Attribute values, Custom Field answers, and edit/delete actions.
- The `#/help` route is a standalone, searchable end-user help site with stable topic IDs for future contextual help links; it intentionally excludes Admin help.
- `BookingModal` creates and updates single reservations and recurring reservation series against real Dataverse data, including Resource Type filtering above the Resource selector, Resource/Resource Type pre-selection from calendar context, disabled Resource/Resource Type selectors in edit modes, optional Comments, Admin owner selection, and Text/Choice Custom Field answers, then shows a centered confirmation state with `Edit Reservation` and focused `OK`.
- Recurring reservation create/edit supports daily, weekly, and monthly patterns with count/until end modes and generated occurrence rows.
- Conflict detection against active occurrences and blackout windows is implemented for single bookings and recurring occurrence generation.
- Theme values load through `ThemeContext` from `sfsures_appsettings`, with portable bundled SFSU logo and fixed Source Sans 3 defaults as fallback.
- Reservation limits are loaded from `sfsures_appsettings` with code hard caps: max 50 generated occurrences and max 18 weeks per reservation/series span. App Admins may configure more restrictive values only.
- Admin shell is implemented with a left rail and lazy-loaded admin sections. Settings, Users, Groups, Resources, and Blackouts are enabled; Reports is intentionally outside Admin.
- Reports screen is implemented as a standalone calendar-header route for App Admins and Report Viewers. The `Reservation Data Viewer` can filter by Resource, Resource Type, User, or Group; use Today, Current Week, Current Month, Year to Date, All Time, or Custom Range; include Active and/or Cancelled rows; render sortable browser results with summary metrics and bounded expandable Comments; download CSV without the internal Title/primary-name field; switch to a sibling Visualization mode; and download SVG chart images for Reservations over Time, Hours by Resource, Reservations by Resource Type, and Top Users.
- App Settings screen is implemented with SFSU preset themes, logo URL, border radius, and reservation limits. It intentionally excludes arbitrary colors, font selection, and settings row-name editing.
- Users screen is implemented with Office365Users directory search/typeahead, explicit Add User confirmation, App User-to-System User mapping, selected-user profile photo, disable/reactivate behavior, and per-user group membership checkboxes.
- Groups screen is implemented with group search, custom group creation, selected-group details, separate accessible View/Edit Permissions and View/Edit Members dialogs, Resource Type `No access`/`View`/`Book` controls, protected App Admins/Report Viewers behavior, hidden auto-generated group keys, and membership count/type details.
- Calendar visibility and the booking picker use group-derived Resource Type permissions. App Admins receive the explicit all-Resource visibility and self-booking exception; delegated booking still checks the selected owner's `Book` access.
- Separate Resource Types and Resources admin rail destinations are implemented through shared catalog logic, with search/list/detail panes, modal create/edit flows, active/inactive and disabled/reactivated status controls, inherited non-reservable status for inactive Resource Types, `Show Resources` modal table, palette-only calendar color selection, Resource Photo upload/crop/thumbnail display, full-photo preview, Resource Attributes, and reservation Custom Fields backed by Attribute Definition plus the relevant value tables.
- Attribute Definition now exposes `Applies To` and Resource scope. Reservation Attribute Value is used by New/Edit Reservation Custom Fields and displayed in the calendar reservation-info modal.
- Group creation and group membership changes write Audit Log rows using `GroupCreated`, `GroupMemberAdded`, and `GroupMemberRemoved`, including hidden group key in `Target Key`.
- Resource catalog create/edit/status/photo changes write `ResourceCatalogEdited` Audit Log rows.
- Tier 1 accessibility work is partly implemented: focus trap helper, dialog semantics, visible focus ring, keyboard booking path, and live regions.

Future production work:

- Add Logs and Admin Help to the Admin left rail.
- Verify the new calendar Resource Type filter, `View Resource` dropdown, Resource Info modal, full-size Resource photo preview, and `Reserve This Resource` handoff in the published Power Apps runtime.
- Verify Resource Attribute values and Custom Field answers with a non-admin Booker identity, including role privileges and own-record behavior.
- Extend custom-field input support beyond the currently implemented Text and fixed-option Choice types to Number/DateTime/Boolean when product needs justify them.
- Admin screens for logs/help.
- Group editing/deactivation workflow, if admins need to rename or retire custom groups; use `GroupEdited` audit rows if this is added.
- Broader audit-log coverage for session-open, reservation create/edit/cancel, user create/disable/edit, blackout edits, and settings/theme changes.
- Custom app-owned calendar toolbar so the date range can stay truly centered while Resource Type, view controls, and other controls grow around it.
- Recurring reservation "cancel future events" workflow.
- Transactional/server-side hardening for series create/edit/delete if the MVP's sequential Dataverse writes prove too fragile.
- Keep future resource, blackout, report, and export screens lazy-loaded so the calendar bundle stays lean; the current Vite large chunk warning is a baseline metric, not a blocker.
- Continue Reports work: add SF State ID export polish, saved report persistence, published-runtime CSV/SVG download verification, possible PNG export if SVG is insufficient, and Excel/SharePoint outputs.
- Full DPRC/WCAG verification, including screen-reader testing and Tier 2/Tier 3 accessibility work.
- Optional calendar layout follow-up if native scrollbar arrow buttons remain distracting in the Power Apps/browser host.
- Production and sandbox environment provisioning, managed-solution import/export, and production role creation confirmation.
- Booker inheritance test with a non-admin identity, mid-session revocation test, and broader pen-testing roadmap.
- Synchronous Dataverse plug-in hardening for reservation writes, including a same-repo C# plug-in project, registered solution-packaged steps, and non-admin direct Web API tests.
- Nightly export flow, anomaly-alert flow, audit-log purge role, co-owner/ITS reassignment backstop, and Application Insights.

## Gaps, TODOs, and Questions

- Avoid future `$select` usage of generated custom `sfsures_*name` fields unless they are confirmed real Dataverse columns via metadata or exist in the generated `*Base` interface.
- Publish and verify the Help menu/new-tab help route in the embedded Power Apps runtime if the latest local build has not yet been deployed.
- Verify Resource Attribute values, Custom Field creation, Custom Field deletion, and answer persistence as a non-admin Booker with real Dataverse privileges.
- Reservation Attribute Value is now used by app source. Continue to keep the exclusive Series-or-Occurrence parent invariant visible when adding new create/edit paths or future field types.
- Verify the new Reservation Attribute Value role privileges and lookup relationship behaviors with a real non-admin Booker; generated metadata confirms columns/ownership but does not prove security-role depth or cascade configuration.
- `sfsu_dataverse_build_sheet.md` appears to include copied Claude/project UI text before the actual build-sheet content; clean that in a future docs pass.
- `sfsu_schema_build_complete_addendum.md` contains superseded ownership/naming facts; add a superseded notice or revise it later.
- Several older docs mention Vibe or Claude browser-extension workflows that have since been retired; keep them historical unless explicitly reviving that path.
- Decide later whether a repo-local `AGENTS.md` or `CLAUDE.md` is still needed; for now, personal skills plus this README cover startup and closeout.
- Native scrollbar arrow buttons can still appear inside the calendar host; earlier CSS attempts were ineffective and should stay deferred unless layout changes make them easier to remove.
- Continue calendar screen polish around top filter spacing, modal ergonomics, and date-range centering now that Resource Type and `View Resource` controls exist.
- Add SF State ID to report CSV output immediately to the right of Owner Email.
- Decide whether the in-browser Reports grid should also show SF State ID near Owner Email.
- Verify Reports CSV download, SVG image download, Visualization mode rendering, Comments expansion, and Clear Selections behavior in the published Power Apps runtime.
- Wire Saved Report persistence in the Reports UI using the generated `Sfsures_savedreportsService`.
- Add paging/continuation handling before relying on Reports for more than the current first `top: 5000` Reservation Occurrence rows.
- Verify the New Reservation Resource Type/Resource pre-selection path and Edit Reservation disabled Resource Type/Resource controls in the published Power Apps runtime.
- Secondary and destructive button colors are currently hard-coded semantic CSS; only primary/action branding is consistently theme-driven.
- Series edit/delete currently uses sequential Dataverse writes, not a true transaction. Keep this accepted MVP limitation visible until a custom API/plugin/app-only backend is in scope.
- Add a recurring-series "cancel future events" workflow in addition to the implemented occurrence and whole-series actions.
- Verify group audit writes end-to-end in the published Power Apps runtime with the real Audit Log security role settings.
- Verify Resource photo upload, thumbnail display, full-size preview, and replacement in the published Power Apps runtime against real Dataverse image rows.
- Audit writes currently cover group creation, group membership changes, and resource catalog changes only, and failures are surfaced but not queued/retried.
- Verify every active App User has the correct Dataverse User mapping and confirm the published app can read the minimum required System User fields before enabling delegated reservation ownership.
- Organization-level auditing is currently off, so the Dataverse User lookup's column-level audit setting does not yet produce audit history.
- Validate Office365Users profile-photo lookup in the published app, especially for users whose stored App User email differs from UPN.
- Verify `cose-res-demo-sandbox` code-app support and Joe's System Administrator rights there.
- Confirm production environment custom role creation and System Administrator grant.
- Run the non-admin Booker test: own reservation write/delete succeeds, peer reservation write/delete returns 403.
- Measure mid-session revocation behavior after removing a user from an Owner team.
- Draft the synchronous Dataverse plug-in step matrix for Reservation Occurrence, Reservation Series, and Reservation Attribute Value.
- Decide whether plug-in hardening is required before first non-pilot replication or can ship as SFSURES v2.0.
- Add reconciliation/export flows as recovery and forensics layers; do not treat them as replacements for plug-in enforcement.
