# SFSU Reservation System -- Runbook Addendum: App User Dataverse Mapping and Safer Onboarding

**Date:** 2026-07-11
**Phase:** Admin identity mapping and reservation-owner groundwork
**Scope:** App User-to-Dataverse User mapping, System User data-source generation, safer Add User confirmation, validation lessons, and the next reservation-owner/custom-attribute work queue.

## Headline Outcomes

- App User now has a `Dataverse User` lookup to the built-in Dataverse `systemuser` table. This supplies the system-user GUID required when an admin eventually assigns the backend owner of reservation Series and Occurrence rows to another person.
- The Code App now includes the generated System User data source and refreshed App User metadata.
- New App User onboarding resolves the selected Microsoft 365 identity to exactly one enabled human Dataverse user and writes the lookup. Missing mappings on existing App Users can be repaired through the same flow; conflicting mappings are never silently overwritten.
- Adding an App User now requires an explicit confirmation dialog. Clicking a directory result only stages the person and fills the search field; the irreversible write happens only after `Confirm Add User`.
- The confirmation dialog shows the selected person's profile photo, display name, email, and an irreversible-action warning, with focus trapping, Escape/Cancel/Close behavior, and an in-dialog error path.

## What Changed

### Dataverse and Generated Sources

- App User lookup:
  - Display name: `Dataverse User`
  - Schema name: `sfsures_DataverseUser`
  - Logical name: `sfsures_dataverseuser`
  - Related table: built-in User (`systemuser`)
  - Relationship: `sfsures_appuser_DataverseUser_systemuser`
- The relationship uses Referential behavior with Restrict Delete and no cascading assignment/deletion.
- The column was left optional during migration/backfill. Column auditing was enabled, but the environment reported that it will not take effect until organization-level auditing is enabled.
- Refreshing `sfsures_appuser` generated the write field `sfsures_DataverseUser@odata.bind` and read field `_sfsures_dataverseuser_value`.
- The built-in User table was added to `power.config.json`; generated code now includes `SystemusersModel.ts` and `SystemusersService.ts`.

### App User Onboarding

- `src/admin/UsersScreen.tsx` carries the Office365Users directory object ID through search results.
- On confirmed onboarding, the app queries enabled, non-application Dataverse System Users. It prefers an exact Entra object-ID match and falls back to exact UPN/email matching.
- Zero matches block onboarding with guidance to add the person to the environment and appropriate Owner team. Multiple matches also block onboarding for manual review.
- New App Users receive the Dataverse User lookup at creation.
- If the SF State ID already exists and its Dataverse User lookup is blank, the flow fills the missing lookup. If it points to a different System User, the app stops instead of overwriting it.
- The App User detail pane reports `Mapped` or `Not mapped` from the lookup GUID.

### Add User Confirmation Friction

- Clicking a directory search result no longer creates an App User.
- The selected person's display name and email populate the Add User search field.
- Clicking `Add User` opens a small confirmation dialog; only `Confirm Add User` invokes the App User create/update path.
- The dialog includes the Office365Users profile photo with initials fallback, identity details, a prominent “This action cannot be undone” warning, keyboard focus containment/restoration, and safe dismissal before the write starts.

### Lookup Read Regression and Fix

- Generated App User metadata exposed `sfsures_dataverseusername`, which looked selectable but behaved as formatted lookup metadata in the runtime.
- Adding it to `$select` caused the entire Users request to fail and made the screen look empty. No App User rows were deleted.
- The selectable `_sfsures_dataverseuser_value` GUID is now the only lookup field used by the Users list. Keep formatted lookup names out of `$select` unless the runtime behavior is explicitly verified.

## Decisions / Rationale

- **Map App User to System User instead of conflating identities.** App User remains the stable application identity/history record; System User is the security principal needed for Dataverse `OwnerId` assignment.
- **Keep creator, booking owner, and security owner distinct.** Dataverse `Created By`/`Modified By` record the actor. `sfsures_BookingOwner` records whom the reservation is for. System `OwnerId` controls User-level write/delete access.
- **Fail closed on identity resolution.** A guessed or ambiguous System User mapping could give reservation control to the wrong person.
- **Require an explicit final confirmation.** App Users are disable-not-delete history records, so a directory-result click is too easy a trigger for an irreversible create.
- **Do not rely on generated display-name fields as selectable columns.** Lookup GUID fields are stable for queries; formatted names are annotations/runtime metadata.

## Current Status

- Existing App Users can be backfilled manually in Dataverse, and the app can fill a blank mapping when that person is selected through Add User again.
- Full lint and production build passed after the onboarding and confirmation changes.
- The known Vite main-chunk size warning remains informational.
- Published-runtime verification is still required for System User reads, lookup writes, photo display, and the complete confirmation flow.

## Still Open / Carry Forward

### Priority 1: Admin Reservation Ownership

- Add an owner selector for App Admins in both New Reservation and Edit Reservation.
- New Reservation must allow an admin to reserve on another App User's behalf.
- Edit Reservation must allow an admin to transfer ownership of a single Occurrence or a recurring Series, with the chosen scope made explicit.
- Eligible owners must be active App Users who are mapped to a Dataverse User and whose app-group access grants `Book` permission for the selected Resource through Resource Type and/or individual Resource access.
- On create/transfer, keep `sfsures_BookingOwner` synchronized across the Series and its Occurrences and assign the backend Dataverse owner (`OwnerId`) to the selected App User's mapped System User. Preserve the current sequential-write/transaction limitation until server-side hardening exists.
- Audit reservation creation and ownership changes with the authenticated admin as actor, the reservation owner as business subject, and before/after snapshots containing App User ID, SF State ID, display name, mapped System User ID, affected scope, and affected row IDs. Dataverse `Created By`/`Modified By` remain the authoritative platform actor columns.
- Non-admins should continue creating reservations only for themselves and must not see an owner selector.

### Priority 2: Resource Custom Attribute UI and Discovery

- Brainstorm a practical starter library of custom Resource fields by Resource Type. Candidates include capacity, room layout, accessibility notes, AV features, manufacturer/model, asset tag, training requirement, accessories, vehicle seating/fuel/license requirements, pickup instructions, and storage location.
- Build Attribute Definition administration and dynamic Resource create/edit fields using the existing schema rather than adding arbitrary columns to Resource.
- Support Text first, then fixed-option dropdowns using the existing `Choice` data type and newline-delimited `Choice options`. The schema already also supports Number, DateTime, and Boolean.
- Validate required fields, choice membership, display order, type changes, and inactive/retired definitions. Decide how existing values behave when an option is removed or a definition's type changes.
- Render useful custom attributes in Resource details and decide which, if any, belong in the booking picker or reservation detail view.

### Operational Follow-up

- Verify every active App User has the correct Dataverse User mapping before enabling reservation-owner delegation.
- Verify the app's roles can read the minimum required System User fields in the published runtime without broadening other privileges unnecessarily.
- Decide whether to enable organization-level auditing. The column-level Dataverse User audit setting remains dormant until then.
- Add audit writes for App User onboarding, mapping repairs, disable/reactivate operations, and future reservation-owner changes.

## How to Resume

1. Start with `src/admin/UsersScreen.tsx` for identity resolution, lookup binding, mapping status, and confirmation behavior.
2. Inspect `src/generated/models/Sfsures_appusersModel.ts`, `src/generated/models/SystemusersModel.ts`, and their services for exact generated field names.
3. For reservation-owner work, start in `src/booking/BookingModal.tsx`; preserve the distinction among authenticated actor, `sfsures_BookingOwner`, and `OwnerId`.
4. Before populating the owner selector, implement the Group → Resource Type/Resource `Book` eligibility calculation from the three access junction tables.
5. For custom Resource attributes, use the canonical Attribute Definition and Resource Attribute Value schema in [sfsu_dataverse_build_sheet.md](sfsu_dataverse_build_sheet.md); do not replace the five typed value columns with JSON.
