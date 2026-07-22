# SFSU Reservation System -- Runbook Addendum: Reports Screen and Saved Reports

**Date:** 2026-07-22
**Phase:** First-pass Reports screen implemented
**Scope:** Documents the calendar-level Reports entry point, standalone Reports screen, Saved Report table/data source, reservation report filters, CSV export, in-browser sortable grid, and carry-forward polish items.

## Headline Outcomes

- Reports moved out of the Admin left rail and now has a calendar-header entry point shown to App Admins and Report Viewers.
- Non-admin Report Viewers no longer need access to the Admin shell to reach Reports.
- A new Dataverse `Saved Report` table was created, security roles were updated, and the Code App data source was generated.
- The Reports screen now has a first useful reservation report flow with report scope, date range, status filtering, CSV download, browser viewing, summary metrics, and sortable columns.

## What Changed

### Calendar and app routing

- `src/App.tsx` now includes a standalone lazy-loaded Reports route guarded by `currentUser.canViewReports`.
- `src/calendar/CalendarScreen.tsx` accepts `onOpenReports` and shows a `Reports` button between Help and Admin when the current user is an App Admin or Report Viewer.
- `src/admin/AdminApp.tsx` no longer includes Reports in the Admin left rail.

### Saved Report table and generated source

New table:

- Display name: `Saved Report`
- Logical name: `sfsures_savedreport`
- Entity set: `sfsures_savedreports`
- Ownership: User/team-owned

Generated files:

- `src/generated/services/Sfsures_savedreportsService.ts`
- `src/generated/models/Sfsures_savedreportsModel.ts`
- `.power/schemas/dataverse/savedreports.Schema.json`

Key generated values:

- Saved Report `Record Status`: Active `997330000`, Disabled `997330001`
- Saved Report `Report Type`: Reservations `997330000`, Utilization `997330001`, Cancellations `997330002`, Resource Usage `997330003`, User Activity `997330004`, Audit Log `997330005`, Blackouts `997330006`, Custom Field Responses `997330007`
- `sfsures_filterjson` is required and now has `maxLength: 32000`.

### Reports screen first pass

`src/reports/ReportsScreen.tsx` now loads report reference data once:

- Resources
- Resource Types
- App Users
- Groups
- User Group Assignments

The initial reservation report supports:

- Pull report by Resource, Resource Type, User, or Group.
- Target selection for a specific Resource/Resource Type/User/Group, or all of the selected scope.
- Date ranges: Today, Current Week, Current Month, Year to Date, All Time, or Custom Range with date pickers.
- Reservation status filter: Active only, Cancelled only, or Active and Cancelled.
- `View in Browser`, which queries Reservation Occurrence rows and renders a sortable grid.
- `Download CSV`, which exports the same report rows in the browser.
- Summary cards for reservation count, total hours, resource count, user count, and cancelled count.

## Decisions / Rationale

- Reports should be a peer app surface, not part of Admin, because Report Viewers may need reporting without app-management privileges.
- The first reporting data source is Reservation Occurrence because it is already materialized, date-range friendly, and contains the resource/owner/status fields needed for fast reports.
- Reference data is loaded once and joined in memory for display labels, which keeps report runs fast at the current data scale.
- Normal reservation deletion remains reportable because user-facing delete/cancel flows set `sfsures_recordstatus = Cancelled` rather than hard-deleting rows. Hard deletes still occur only in partial-create cleanup paths and are not reportable after cleanup.
- CSV export is browser-generated for the MVP. If embedded Power Apps download behavior is unreliable in the published runtime, use a Power Automate/SharePoint link flow later.
- Saved Report persistence was intentionally not wired into the first screen pass. The current filter state shape is ready to serialize into `sfsures_filterjson` in a follow-up.

## Current Status

- Local `npm run lint` passed.
- Local `npm run build` passed with the existing Vite large-chunk warning.
- Local Vite dev server was started at `http://127.0.0.1:3000/` during implementation.
- Reports UI is implemented locally but still needs published Power Apps runtime verification.
- Saved Report table exists and generated source is available, but save/load/edit/delete saved report workflows are not yet implemented in the Reports UI.

## Still Open / Carry Forward

- Up next: fix quirks in the Title column for in-browser report viewing and related quirks in the generated CSV.
- Add an SF State ID column to the CSV immediately to the right of Owner Email.
- Decide whether the in-browser grid should also show SF State ID near Owner Email.
- Wire saved-report persistence using the `Saved Report` table:
  - Save current filters as a named report.
  - Load saved reports for the signed-in user.
  - Update, disable/delete, and optionally reorder saved reports.
  - Update `Last Run On` and `Last Exported On` when useful.
- Verify report queries and CSV download behavior in the published Power Apps runtime, not only local dev.
- Add paging or continuation handling before relying on Reports for more than the current `top: 5000` occurrence query.
- Consider virtualization if in-browser report results grow beyond low-thousands of rows.
- Consider report-specific visuals after the tabular MVP stabilizes.

## How to Resume

1. Start with `src/reports/ReportsScreen.tsx` and `src/reports/ReportsScreen.module.css`.
2. Fix the Title column and CSV formatting quirks first.
3. Add SF State ID to the CSV immediately after Owner Email.
4. Then wire Saved Report persistence against `Sfsures_savedreportsService` using the existing `ReportFilters` shape as the serialized filter payload.
