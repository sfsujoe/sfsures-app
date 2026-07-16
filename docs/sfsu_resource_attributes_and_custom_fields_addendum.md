# SFSU Reservation System -- Runbook Addendum: Resource Attributes and Custom Fields

**Date:** 2026-07-15  
**Phase:** Resource Attributes and reservation Custom Fields implemented for the admin and booking MVP.  
**Scope:** Attribute Definition scoping, inherited Resource Type fields, Resource-specific overrides, booking modal answer persistence, calendar detail display, and remaining verification items.

## Headline Outcomes

1. The product language is now split into two clear concepts:
   - **Resource Attributes** are read-only details about a Resource, entered by admins.
   - **Custom Fields** are reservation questions answered by users in New/Edit Reservation.
2. Attribute Definition now supports both Resource Type and Resource scope through the existing Resource Type lookup plus the newly generated Resource lookup.
3. Resource Attribute administration exists in both Resource Type and Resource scoped modals, with Resource-specific value entry in the Resource modal only.
4. Custom Field administration exists in both Resource Type and Resource scoped modals, and inherited Resource Type fields now appear read-only in Resource-specific modals.
5. New/Edit Reservation loads applicable inherited plus Resource-specific Custom Fields, validates required fields, and persists answers to Reservation Attribute Value.
6. The calendar reservation-info modal now displays saved Resource Attribute values and Custom Field answers.

## What Changed

### Schema and generated source

- Attribute Definition was refreshed after adding the Resource lookup. Generated metadata now includes `sfsures_resource`, `_sfsures_resource_value`, and `sfsures_resourcename`.
- Attribute Definition continues to use `sfsures_appliesto` to separate Resource Attributes from reservation Custom Fields.
- Reservation Attribute Value remains the answer table for Custom Fields. It stores typed answer values against either a Reservation Occurrence or Reservation Series.

### Resources admin screen

- Resource Type cards and Resource cards now expose separate admin actions:
  - **Resource Attributes**
  - **Custom Fields**
- Resource Type scoped definitions are inherited by Resources.
- Resource scoped definitions apply only to that Resource.
- Inherited rows are shown in Resource-specific modals with the note `Inherited from Resource Type`.
- Inherited rows cannot be deleted from the Resource-specific modal; they must be managed at their owner scope.
- Resource Attributes no longer show a Required checkbox because admins supply those values, not reservation users.
- Resource Attribute values are edited only in the Resource-specific Resource Attributes modal, keeping the Resource edit modal simpler.
- Admins can delete Resource Attributes and Custom Fields from the scope that owns them.
- Browser-native `confirm()` deletion was replaced with an in-app confirmation dialog with friendlier copy.
- Deleting a Resource Attribute deletes its saved Resource Attribute Value rows first.
- Deleting a Custom Field deletes saved Reservation Attribute Value answer rows first.

### Booking modal

- New/Edit Reservation loads active Custom Field definitions where:
  - `Applies To = Reservation`, and
  - the definition is scoped to the selected Resource Type or selected Resource.
- Initially supported input types remain Text and Choice.
- Required Custom Fields are validated before save.
- Single reservations save answers against the Reservation Occurrence.
- Recurring reservations save answers against the Reservation Series, and the create/edit flow writes occurrence answer rows as needed for generated occurrences.
- Editing one occurrence saves occurrence-specific answers.
- Editing a whole series saves series answers and replacement occurrence answers.

### Calendar reservation-info modal

- The reservation detail popover now loads:
  - Resource Attribute values for the reserved Resource.
  - Custom Field answers for the selected occurrence, with series answers as fallback.
- The lookup includes a defensive broad-read fallback for Custom Field answers when a targeted occurrence/series lookup returns no rows in the embedded runtime.
- Values are shown as compact read-only definition lists under `Resource Attributes` and `Custom Fields`.
- Empty values are hidden so the modal stays compact.

## Decisions / Rationale

### Keep value editing out of Resource edit

Admins need a way to set Resource Attribute values, but putting every attribute value inside the general Resource edit modal made that modal heavier. The Resource-specific Resource Attributes modal is now the single place to manage those values.

### Resource Type inheritance is visible, not editable

Inherited fields are displayed inside Resource-specific modals because hidden inheritance was confusing during testing. The Resource-specific modal now makes the inheritance visible while keeping ownership clear.

### Required applies only to Custom Fields

`Required` is meaningful for reservation questions because the end user must answer them before booking. It is not meaningful for Resource Attributes because admins control those values outside the reservation workflow.

### Calendar detail display is read-only

The calendar reservation-info modal is a review surface, not an edit surface. It shows saved answers and Resource facts without introducing additional edit paths.

## Current Status

- Resource Type scoped Resource Attributes: implemented.
- Resource scoped Resource Attributes: implemented.
- Resource Type scoped Custom Fields: implemented.
- Resource scoped Custom Fields: implemented.
- Inheritance visibility in Resource-specific modals: implemented for both concepts.
- Resource Attribute value entry: implemented in Resource-specific Resource Attributes modal.
- Custom Field rendering and persistence in New/Edit Reservation: implemented for Text and Choice.
- Delete flow for Resource Attributes and Custom Fields: implemented with in-app confirmation.
- Calendar reservation-info display for attributes and answers: implemented.
- `npm run lint` and `npm run build`: passed after the calendar-detail work. The existing Vite large-chunk warning remains informational.

## Still Open / Carry Forward

- Verify Custom Field answer display in the published embedded Power Apps runtime after the defensive calendar lookup fallback.
- Verify Resource Attribute values and Custom Field answers with a non-admin Booker identity, not only Joe's admin identity.
- Confirm the generated occurrence answer copy behavior is sufficient for reporting. If series-level answers are enough for recurring reporting, occurrence copies could later be simplified.
- Extend Custom Field input support beyond Text and Choice only when a real workflow needs Number, Date/Time, or Boolean.
- Decide whether definition and answer changes need audit-log coverage.
- Confirm delete behavior against real relationship settings after solution movement; the app deletes dependent values first, but Dataverse relationship restrictions should still be checked.

## How to Resume

Start by testing the published app flow end to end:

1. Create a Resource Type scoped Custom Field and a Resource scoped Custom Field.
2. Create a reservation and answer both fields.
3. Open the calendar reservation-info modal and confirm the answers appear.
4. Add Resource Attribute values for the Resource and confirm they appear in the same modal.
5. Repeat as a non-admin Booker to verify privileges and own-record behavior.

If the calendar modal still omits Custom Field answers, inspect Reservation Attribute Value rows for the clicked occurrence/series IDs and compare them with the parent IDs carried by `CalendarScreen`.
