# SFSU Reservation System -- Runbook Addendum: Recurrence, App Permissions, and Calendar Actions

**Date:** 2026-07-07
**Phase:** Calendar MVP hardening and recurrence workflow expansion
**Scope:** App-level group permissions, recurring reservation workflows, reservation-info actions, and near-term calendar layout decisions.

## Headline Outcomes

- The app now has a separate app-level group permission layer on top of Dataverse roles.
- Recurring reservation creation is implemented for daily, weekly, and monthly patterns with count/until end modes.
- Reservation info actions now distinguish occurrence-level and series-level workflows.
- Calendar Week/Day views now expose the full 24-hour range and initially scroll to 8:00 AM.
- Future Admin and Resource Type controls should be added without allowing adjacent controls to visually push centered titles off-center.

## What Changed

- `Group` now includes `Group Key` and `Is System Group`; the generated group model/schema include `sfsures_groupkey` and `sfsures_issystemgroup`.
- The seeded system groups are `APP_ADMINS` and `REPORT_VIEWERS`; group key uniqueness is enforced with a Dataverse alternate key.
- `AccessGate` loads active group assignments and exposes `groups`, `groupKeys`, `isAppAdmin`, and `canViewReports` through `CurrentUser`.
- Reservation management UI now checks app-admin group membership rather than relying on Dataverse admin assumptions.
- `BookingModal` supports recurrence generation, recurrence limits, recurrence field reset after successful create, and edit-series mode.
- `CalendarScreen` supports edit reservation, delete reservation/occurrence, edit series, and delete series from the reservation info modal.
- Delete/cancel behavior is status-based: rows are marked `Cancelled` instead of hard-deleted from Dataverse.
- FullCalendar Week/Day views use `slotMinTime="00:00:00"`, `slotMaxTime="24:00:00"`, and `scrollTime="08:00:00"`.

## Decisions / Rationale

- App permissions should be group-based, using the existing `Group` and `User Group Assignment` tables. A separate group-permission table is not needed for the current MVP because `APP_ADMINS` and `REPORT_VIEWERS` are the only app-wide special permissions currently identified.
- Group display names can change; stable app logic should key off `Group Key`, not the visible name.
- Admins must be able to create ordinary resource-access groups later. System groups should be protected by convention/UI, not by preventing the table from containing normal custom groups.
- Series edits use a replace-active-occurrences model: create the revised active occurrences linked to the existing series, update the series metadata, then cancel the old active occurrences.
- Series and occurrence deletion use the app's `Record Status = Cancelled` semantics. Hard deletes remain reserved for cleanup after failed partial creates.
- Owner/app-admin checks are duplicated in action handlers even when buttons are hidden, so UI visibility is not the only guard.
- The current app-level permission layer is still presentation and workflow enforcement. Dataverse roles remain the real backend access boundary for this MVP.

## Current Status

- `npm run build` passed after the recurrence, edit/delete, group-key, and calendar-time-window changes. The known Vite large chunk warning remains.
- Recurring reservation creation and full-series edit/delete are functional in the UI.
- Single-occurrence edit/delete and recurring occurrence delete are functional in the UI.
- App-admin detection is based on membership in the `APP_ADMINS` system group.
- Report-view permission is represented by membership in `REPORT_VIEWERS`, but report screens are not built yet.
- Week/Day views expose all 24 hours, initially scrolled to 8:00 AM.

## Still Open / Carry Forward

- Resource Type filtering still needs to be built from group/resource access tables.
- Admin screens are still pending: users, groups, resources, blackout windows, app settings, and theme/settings management.
- Report screens are still pending; `canViewReports` is available for gating when those screens exist.
- The User Profile screen should eventually list the app groups a user belongs to.
- The reservation info modal still needs a future-events cancel option for recurring series.
- Series edit/delete flows are not transactionally atomic. A future custom API, plugin, or app-only backend could harden this.
- Non-admin Booker testing is still required for own-row edit/delete and peer-row denial.
- Button colors are partially theme-driven: primary buttons use app theme color, while secondary and destructive colors remain hard-coded semantic CSS.
- Header title and calendar date-range centering should be handled before adding Admin and Resource Type controls. Recommended placement: Admin/global settings in the header right action area; Resource Type dropdown in a custom calendar toolbar.

## How to Resume

1. For access work, start with `AccessGate`, `UserContext`, and the Group/User Group Assignment tables.
2. For recurrence work, start with `BookingModal` and `CalendarScreen` handlers for edit/delete occurrence vs series.
3. For the next UI-layout pass, replace or wrap FullCalendar's built-in toolbar with an app-owned toolbar so the date range can remain truly centered while the Resource Type dropdown and view controls grow around it.
4. For admin/report work, use `currentUser.isAppAdmin` and `currentUser.canViewReports` as the UI gates, while preserving Dataverse role assumptions and accepted MVP API-bypass risk.
