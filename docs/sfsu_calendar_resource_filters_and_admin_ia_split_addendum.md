# SFSU Reservation System -- Runbook Addendum: Calendar Resource Filters and Admin IA Split

**Date:** 2026-07-18
**Phase:** Calendar resource browsing polish and Admin resource IA split implemented
**Scope:** Documents the Admin Resource Types/Resources split, calendar Resource Type and View Resource filters, Resource Info modal/photo preview/reserve handoff, BookingModal Resource Type filter, edit-modal selector locking, and header-logo focus-area polish.

## Headline Outcomes

- Admin now has separate `Resource Types` and `Resources` left-rail destinations, while sharing one catalog implementation behind the scenes.
- Calendar now has a Resource Type dropdown above the date range, defaulting to `All Resource Types`.
- Calendar now has a second `View Resource` dropdown, defaulting to `Choose a Resource`, whose options are filtered by the selected Resource Type.
- Selecting a resource opens a Resource Info modal with Resource Type, photo, description/location when present, and all configured Resource Attributes.
- Resource Info photos are clickable and open a full-size preview using the same Dataverse image-download pattern as the Admin resource photo preview.
- `Reserve This Resource` opens the regular New Reservation modal with the Resource Type and Resource pre-selected.
- New Reservation now includes a Resource Type dropdown above the Resource selector, seeded from the calendar context.
- Edit Reservation still shows Resource Type and Resource, but both controls are disabled so existing reservations cannot be moved between resources in the edit flow.
- The header logo link now shrink-wraps the actual rendered logo instead of exposing a large clickable/focusable empty rectangle.

## What Changed

- `src/admin/AdminApp.tsx` lazy-loads a dedicated `ResourceTypesScreen` and adds `Resource Types` to the admin rail.
- `src/admin/ResourceCatalogScreen.tsx` holds the shared catalog behavior that used to live entirely in `ResourcesScreen`.
- `src/admin/ResourcesScreen.tsx` and `src/admin/ResourceTypesScreen.tsx` are thin mode wrappers around `ResourceCatalogScreen`.
- `src/calendar/CalendarScreen.tsx` loads viewable active Resource Types and Resources, maps Resource Type IDs onto reservations and blackouts, filters visible events, drives the `View Resource` dropdown, and renders Resource Info/photo preview modals.
- `src/calendar/CalendarScreen.module.css` adds the calendar filter bar, themed Resource Info buttons, resource photo preview styles, and the shrink-wrapped logo link rules.
- `src/booking/BookingModal.tsx` accepts `initialResourceTypeId` and `initialResourceId`, renders the Resource Type dropdown, filters Resource options, and locks Resource Type/Resource selectors outside create mode.
- `src/booking/BookingModal.module.css` adds disabled select styling so locked edit selectors read as visible but inactive.

## Decisions / Rationale

- The Admin split is intentionally a clean navigation split for admins, but the implementation remains shared to avoid duplicating Dataverse catalog, photo, attribute, and audit-log logic.
- Calendar Resource Type filtering uses view permission. The Resource Info modal is for browsing resources the user may see; booking still goes through the normal `BookingModal` resource list and owner access checks.
- The New Reservation Resource Type filter is seeded from the calendar filter, and the Resource selector updates the Resource Type filter if the user picks a specific resource.
- Edit Reservation does not allow changing Resource Type or Resource. Those fields identify the existing booking target, and moving a reservation to a different resource should be a separate future workflow if the product needs it.
- Resource Info attribute loading includes Resource Type-scoped and Resource-scoped Resource Attributes, then shows `Not provided` where a configured attribute lacks a value for the selected Resource.
- Full-size Resource photo preview first tries `downloadImage(..., true)` and falls back to the loaded thumbnail if Dataverse cannot return full-size bytes.
- New Dataverse reads avoid generated phantom custom `*name` selects; display names are built from real Resource Type/Resource rows and local maps.

## Current Status

- Local `npm run lint` passed.
- Local `npm run build` passed with the existing Vite large-chunk warning.
- The local dev server was run at `http://127.0.0.1:3000` for local access during implementation.
- The new calendar filter, Resource Info, photo preview, reserve handoff, BookingModal selector, and Admin rail split are implemented in the local source tree.

## Still Open / Carry Forward

- Continue calendar screen polish next, especially around filter placement, modal ergonomics, and demo-readiness.
- Verify the Resource Type filter, `View Resource` dropdown, Resource Info modal, full-size Resource photo preview, and `Reserve This Resource` handoff in the published Power Apps runtime.
- Verify the new Resource Type and Resource dropdown behavior with a non-admin Booker identity.
- Confirm the Resource Info attribute display against real demo data, including the `Not provided` text for empty Resource Attribute values.
- Add Logs and Admin Help to the Admin left rail in a later admin-focused pass.
- Reports/export screens remain future work.

## How to Resume

1. Read this addendum first, then inspect `src/calendar/CalendarScreen.tsx`, `src/calendar/CalendarScreen.module.css`, and `src/booking/BookingModal.tsx`.
2. Continue calendar polish with a demo mindset: top filter layout, date-range centering, Resource Info modal spacing, photo preview behavior, and the reserve handoff.
3. Re-test New Reservation from both a blank calendar selection and `Reserve This Resource`.
4. Re-test Edit Reservation and Edit Series to confirm Resource Type and Resource are visible, greyed out, and not clickable.
5. If adding more Dataverse selects, re-check [Generated Dataverse Name Fields Addendum](sfsu_generated_dataverse_name_fields_addendum.md).
