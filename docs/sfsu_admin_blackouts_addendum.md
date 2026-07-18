# SFSU Reservation System -- Runbook Addendum: Admin Blackouts

**Date:** 2026-07-17
**Phase:** Admin Blackouts implemented; admin left-rail follow-up queued
**Scope:** Documents the Admin Blackouts screen, calendar/booking blackout terminology fixes, overlap reporting, blackout removal behavior, and next-session admin navigation reminders.

## Headline Outcomes

- The Admin left rail now includes an active Blackouts section instead of a placeholder.
- Admins can create, search, sort, inspect, and remove blackout windows from the app.
- Booking conflicts and calendar blackout labels now use Blackout terminology consistently.
- The next session should revisit Admin left-rail IA: add Logs and Admin Help, and discuss whether Resources and Resource Types should be split into separate rail entries.

## What Changed

- `src/admin/BlackoutsScreen.tsx` was added as a lazy-loaded Admin section.
- `src/admin/AdminApp.tsx` now enables Blackouts in the Admin rail.
- `src/admin/AdminApp.module.css` now includes Blackouts list, controls, date-grid, action, detail, warning, and modal styling.
- `src/audit/auditLog.ts` now includes Blackout Window audit target/action constants.
- `src/booking/BookingModal.tsx` now reports blackout conflicts as `Blackout: <time> - <reason>` rather than Maintenance wording, and filters only active blackout rows.
- `src/calendar/CalendarScreen.tsx` now renders blackout labels as `🚫Blackout: <resource> Until <end date time>`, resolves resource names from loaded Resource rows when lookup formatted values are absent, and filters only active blackout rows.

## Decisions / Rationale

- Blackout notes use only the term Reason. Comments terminology remains for reservations, not blackout windows.
- The blackout list shows current blackouts first, then respects the selected sort mode: Newest First, Oldest First, or Resource.
- Creating a blackout does not fail when it overlaps existing reservations. Instead, the blackout is created and the admin sees an overlap report.
- Removing a blackout is a soft removal: the row is marked inactive with `statecode: 1` and `statuscode: 2`. This preserves history and keeps inactive rows out of calendar rendering and booking conflict checks.
- Removal uses an app-native confirmation modal instead of `window.confirm`, avoiding browser-host warning dialogs in the embedded Power Apps runtime.
- The generated `createdbyname` field is not selected from Dataverse. The screen selects `_createdby_value` and reads its formatted value when available, following the rule in [Generated Dataverse Name Fields Addendum](sfsu_generated_dataverse_name_fields_addendum.md).

## Current Status

- Admin Blackouts is usable for the MVP: create, list, search, sort, details, overlap reporting, and remove flows are implemented.
- The detail modal shows Resource, date/time range, entered-by display value when Dataverse returns it, entered-on timestamp, and Reason.
- Calendar blackouts and booking conflict checks now ignore inactive blackout rows.
- The latest local verification during this session used `npm run lint` and `npm run build`; both passed, with only the existing Vite large chunk warning.

## Still Open / Carry Forward

- Add Logs to the Admin left rail so admins can browse Audit Log records in-app.
- Add Admin Help to the Admin left rail, separate from the end-user Help route.
- Discuss whether Resources and Resource Types should be split into separate Admin rail entries instead of sharing the current Resources section.
- Decide whether blackout removal should also be available from the More Info modal footer, not only from the list row.
- Verify the Blackouts screen in the published Power Apps runtime with a non-admin Booker for read-only behavior and with an Admin for create/remove behavior.
- Audit coverage still needs broader product decisions: reservation create/edit/cancel, user edit/disable, settings/theme changes, and an eventual Logs screen.

## How to Resume

1. Start with this addendum and the Admin shell section in `src/admin/AdminApp.tsx`.
2. For the next UI planning pass, add or design left-rail entries for Logs and Admin Help.
3. Discuss whether Resource Types deserve their own rail destination before expanding the current Resources admin screen further.
4. If changing Dataverse selects, re-check [Generated Dataverse Name Fields Addendum](sfsu_generated_dataverse_name_fields_addendum.md) before selecting generated display-name fields.
