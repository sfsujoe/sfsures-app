# SFSU Reservation System -- Runbook Addendum: White Labeling and Reservable Hours

**Date:** 2026-07-31
**Phase:** Initial-rollout feature build
**Scope:** Documents the App Settings title/logo changes, Resource Type and Resource scoped reservable-hours schema, admin UI, calendar visibility, booking enforcement, and next approval-flow discussion.

## Headline Outcomes

- Non-admin Booker testing looked good in the published app: the test Booker could log in, create/delete their own single and recurring reservations, and could not delete a reservation owned by someone else. Viewer-only testing is still pending.
- The calendar heading is now white-label configurable from App Settings. The default remains `SFSU Resource Reservations`.
- App Settings now uses a Dataverse Image column and cropper for the app logo instead of a logo URL. The old URL column can remain as an unused orphaned column.
- Resource Type and Resource scoped reservable hours are implemented across schema, admin configuration, calendar display, booking validation, and admin override messaging.
- The next required initial-rollout topic is reservation approval flows.

## What Changed

App Settings now treats the primary name column (`sfsures_name`) as the admin-configurable App Name. The calendar header reads that value through the theme/settings path and falls back to `SFSU Resource Reservations` when the setting is blank or unavailable.

Logo configuration moved from a URL field to a Dataverse Image column named `sfsures_applogo`. The App Settings screen shows the current logo preview next to an Upload New Logo action and uses the same cropper pattern as Resource photos. The Border Radius option was removed, and app logic no longer offers or depends on a logo URL contingency.

Reservable hours are modeled with local choice columns and a dedicated child table:

- Resource Type `sfsures_reservablehoursmode`: Any Time, Monday-Friday 8-5, or Custom.
- Resource `sfsures_reservablehoursmode`: Inherit from Resource Type, Any Time, Monday-Friday 8-5, or Custom.
- Reservable Hour Window table (`sfsures_reservablehourwindow`) with primary name `sfsures_name`, `sfsures_dayofweek`, `sfsures_startminute`, `sfsures_endminute`, `sfsures_displayorder`, `sfsures_recordstatus`, and optional lookups to Resource Type or Resource.

The Resource Types admin detail area now has a Reservable Hours button. The Resources admin detail area now has its own Reservable Hours button under the resource edit actions. Both open the same modal pattern: radio choices for the mode, and when Custom is selected, admins can add one or more day/time windows. Multiple windows per day are supported, including split shifts such as 8:00-noon and 1:00-5:00.

The calendar now uses reservable hours as visible context instead of forcing users to discover availability by trial and error. Selecting a specific resource in View Resource filters the calendar to that resource's reservations, flips the Resource Type dropdown to the resource's parent type, keeps the View Resource dropdown centered, and reveals a Show Info button to open the existing resource info modal. Week and Day views gray out non-reservable times for a selected resource, or for a selected Resource Type when no resource is selected. Month view intentionally shows no gray overlay.

Booking validation now checks requested single and recurring occurrences against the effective reservable-hours mode. Non-admins are blocked outside the allowed windows. Admins may override, but they receive an explicit confirmation before the reservation is accepted. When a resource has custom availability, the New/Edit Reservation modal shows a compact hint under the start/end pickers: "This resource has custom availability. Show on calendar." The link closes the modal, selects the resource on the calendar, switches Month to Week when needed, and jumps to the relevant date.

## Decisions / Rationale

The App Name reused the App Settings primary name because there is only one settings row and the primary name is already a human-facing label. That avoided a redundant title column.

The App Logo needed a new image column because storing binary/cropped image data in Dataverse is materially different from storing a URL. Keeping the old URL column orphaned is acceptable because it was never used for real data and removing columns from Dataverse solutions can be more disruptive than leaving a harmless unused field.

Reservable hours use a child table instead of one column per day because Custom must support multiple windows per day and future extensions. Minute-of-day integers avoid time-zone ambiguity for weekly operating hours.

Resource-level settings inherit from Resource Type by default. That preserves low-effort department setup while still allowing special cases such as one instrument, room, or lab with narrower hours.

The calendar overlay is limited to Week and Day views because Month view lacks enough vertical precision to show hour-level availability without misleading users.

The user-facing term is "custom availability", not "limited availability", because "limited" can imply scarcity or exclusivity rather than an operating-hours rule.

## Current Status

The local app source has been updated and validated during the session with `npm run build` and `npm run lint`. The Vite large-chunk warning remains the existing baseline warning, not a new blocker. A local Vite server was started successfully at `http://127.0.0.1:5173` after the latest resource-scoped Reservable Hours work.

Dataverse schema was updated and published by the admin before implementation. Generated Code App data sources and models were refreshed for App Settings, Resource Types, Resources, and Reservable Hour Windows.

## Still Open / Carry Forward

- Test Viewer-only permissions in the published app.
- Verify the App Settings App Name and uploaded logo behavior in the published Power Apps runtime.
- Verify Resource Type and Resource scoped Reservable Hours in the published runtime, including multiple windows per day, non-admin blocking, admin override confirmation, and the Show on calendar handoff from New/Edit Reservation.
- Consider server-side plug-in hardening for reservable-hours checks along with the already planned reservation conflict, blackout, ownership, and recurrence guards.
- Design and implement reservation approval flows before initial rollout.

## How to Resume

Start the next session by discussing approval-flow options as an initial-rollout requirement. Key decisions to make before schema work: whether approval is opt-in per Resource Type/Resource, whether approvals create Pending reservations that hold time, who can approve, how recurring requests are reviewed, what requester/admin notifications are required, and how approval status interacts with non-admin edit/delete permissions.
