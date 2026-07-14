# SFSU Reservation System -- Runbook Addendum: Group Permissions and Reservation Custom Fields

**Date:** 2026-07-14  
**Phase:** Group-only Resource Type permissions and Resource metadata fields implemented; reservation custom-field schema and generated data sources ready; reservation-field UI not yet implemented.  
**Scope:** Groups UI, permission enforcement decisions, admin booking exceptions, Resource custom fields, and the Dataverse extension for reservation-specific answers.

## Headline Outcomes

1. Resource visibility and booking permissions now flow only through Group-to-Resource-Type access. The older Group Resource Access table remains in the schema for possible future use but is intentionally ignored at runtime.
2. The Groups screen now keeps the group list/detail layout and opens separate accessible **View/Edit Permissions** and **View/Edit Members** dialogs. It no longer displays an embedded user list.
3. `APP_ADMINS` and `REPORT_VIEWERS` are protected from Resource Type permission editing. The permission button is hidden for both, and the runtime permission resolver ignores grants attached to either group.
4. App Admins can see every Resource and reserve any Resource for themselves without belonging to a permission-bearing group. When booking for another person, that selected owner must still have `Book` access to the Resource Type.
5. Resource metadata custom fields are implemented in the Resources admin screen and Resource create/edit dialogs for Text and fixed-option Choice fields, including required fields, display order, typed persistence, and defensive validation.
6. Dataverse now has the schema needed for reservation-specific questions: Attribute Definition gained `Applies To`, and a new user/team-owned Reservation Attribute Value table stores typed answers against a Series or Occurrence.
7. Attribute Definition was refreshed and Reservation Attribute Value was added to the Code App. Generated models/services compile successfully; no reservation-question UI or persistence code has been written yet.

## What Changed

### Group-only Resource Type permissions

- The selected Group detail pane exposes two actions:
  - **View/Edit Permissions** opens a searchable Resource Type list with `No access`, `View`, and `Book` choices.
  - **View/Edit Members** opens a searchable App User membership checklist.
- Both dialogs use modal semantics and the existing focus-management pattern.
- `View` permits calendar visibility. `Book` includes visibility and reservation creation.
- [`../src/auth/resourceTypePermissions.ts`](../src/auth/resourceTypePermissions.ts) is the shared runtime resolver used by the calendar and booking flow.
- Direct per-Resource permission rows are not consulted. All end-user Resource permissions are group-based and Resource-Type-scoped.
- System Group Keys, not editable display names, determine special handling:
  - `APP_ADMINS`: application administration plus implicit visibility/booking exceptions.
  - `REPORT_VIEWERS`: report capability only; not a Resource permission-bearing group.
- Existing permission rows attached to either protected group are ignored by the runtime resolver. This makes the rule resilient to stale or API-created rows, not only to the hidden UI button.

### Admin reservation behavior

- App Admins implicitly see all active Resource Types and Resources.
- App Admins may create a reservation on their own behalf for any reservable Resource even if they are not in an ordinary permission-bearing group.
- Booking on another user's behalf remains constrained: the selected owner must have group-derived `Book` access to that Resource Type.
- The earlier calendar regression in which reservations disappeared for Admins was corrected by applying the implicit Admin visibility rule consistently.

### Resource metadata custom fields

- A Resource Type's **Custom Fields** dialog currently manages Attribute Definition rows.
- Implemented field types are Text and Choice. Unsupported existing schema types remain non-editable rather than being silently corrupted.
- Choice options are stored one per line and presented as dropdowns in Resource create/edit.
- Required fields are validated before a Resource is saved.
- Safety checks prevent duplicate field names per Resource Type, changing an existing definition's type, removing a Choice option already in use, and making a field required while existing Resources lack a value.
- Values continue to use Resource Attribute Value's typed columns rather than JSON.

### Reservation-specific Dataverse extension

Attribute Definition now includes:

| Column | Logical name | Values |
|---|---|---|
| Applies To | `sfsures_appliesto` | Resource `997330000`; Reservation `997330001` |

`Applies To` is required in the generated model. Existing definitions were intended to be backfilled as Resource definitions before making the column required.

New table: **Reservation Attribute Value** (`sfsures_reservationattributevalue`)

- Ownership: User/team-owned.
- Required lookup: Attribute Definition.
- Optional lookups: Reservation Series and Reservation Occurrence.
- Typed answer columns: Value Text, Value Number, Value Date Time, Value Boolean, and Value Choice.
- Active alternate keys:
  - Attribute Definition + Reservation Series.
  - Attribute Definition + Reservation Occurrence.
- Application invariant: an answer row references either a Series or an Occurrence, never both. The alternate keys do not enforce this exclusive-or rule, so application logic must.
- Relationship intent is Referential, Restrict Delete so referenced definitions/reservations cannot be removed while answers depend on them. Generated metadata does not prove cascade configuration; verify this in Dataverse if behavior is ever in doubt.

### Security-role extension

For the Booker role, lookup association is directional:

| Table | Append | Append To |
|---|---:|---:|
| Reservation Attribute Value | User | None |
| Attribute Definition | None | Organization |
| Reservation Series | User | User |
| Reservation Occurrence | User | User |

Attribute Definition is Organization-owned, so its applicable depth is Organization/None rather than User. Bookers need Organization-level Read and Append To so an answer can reference any visible active definition; they do not receive create/write privileges on definitions.

The Admin role uses Organization-level Append and Append To on all four relevant tables. Viewer remains read-only for definitions/answers. Assign and Share remain unavailable to ordinary Bookers on user/team-owned reservation data.

### Generated Code App data sources

The following CLI operations succeeded against `https://orgdaa34530.crm.dynamics.com`:

```text
npx power-apps add-data-source --api-id dataverse --resource-name sfsures_attributedefinition --org-url https://orgdaa34530.crm.dynamics.com
npx power-apps add-data-source --api-id dataverse --resource-name sfsures_reservationattributevalue --org-url https://orgdaa34530.crm.dynamics.com
```

Generated metadata confirms:

- `sfsures_appliesto` and the intended numeric Choice values.
- Reservation Attribute Value is user/team-owned.
- Required Attribute Definition binding and optional Series/Occurrence bindings.
- All five typed value columns.
- Entity set `sfsures_reservationattributevalues` and generated service `Sfsures_reservationattributevaluesService`.

`npm run lint` and `npm run build` both passed after generation. The existing Vite large-chunk warning remains informational.

## Decisions / Rationale

### Resource metadata and reservation answers remain separate

Attribute Definition is shared because the label, type, options, required flag, order, and Resource Type scope are the same metadata concepts. Values are intentionally split:

- Resource Attribute Value describes the Resource itself.
- Reservation Attribute Value records the answer supplied for one reservation Series or Occurrence.

Reusing Resource Attribute Value for booking answers would blur ownership, lifecycle, keys, and reporting semantics.

### Recurrence answer model

The agreed implementation direction is:

- A recurring reservation stores the submitted answers on the Series and copies them to each generated Occurrence.
- Editing one Occurrence changes only that Occurrence's answers.
- Editing the whole Series updates the Series answers and the replacement Occurrences created by the series-edit workflow.
- A single, non-recurring reservation stores answers against its Occurrence.

This preserves fast calendar/detail reads while retaining a canonical Series-level record for recurring bookings.

### Keep the unused direct-Resource permission table

The Group Resource Access table and generated source remain intact in case a justified exception emerges later. Runtime authorization deliberately ignores it today, so retaining the table does not create a second active permission path.

## Current Status

- Group permission/member modals: implemented.
- Group-only Resource Type permission resolver: implemented.
- Protected App Admins/Report Viewers behavior: implemented in UI and runtime resolution.
- Admin self-booking and all-Resource visibility exceptions: implemented.
- Resource Text/Choice metadata fields and values: implemented.
- Attribute Definition `Applies To`: created, published, and generated.
- Reservation Attribute Value table, typed columns, lookups, and keys: created, published, and generated.
- Reservation custom-field administration: **not implemented**.
- Reservation create/edit modal questions and answer persistence: **not implemented**.
- Published-runtime verification of the new answer table and Booker privileges: **not run**.

## Still Open / Carry Forward

### Absolute next-session priority

**Before changing any UI or source code, ask Joe to convey his UI nomenclature comments.** Terminology must be agreed before deciding labels, section headings, admin controls, or whether users should see words such as “custom fields,” “questions,” “details,” or “attributes.”

After that conversation, the absolute #1 implementation priority is reservation custom-field administration plus create/edit reservation modal integration.

The implementation should then:

1. Update Attribute Definition administration so Resource and Reservation definitions are clearly separated using `sfsures_appliesto`.
2. Ensure the existing Resource forms load only `Applies To = Resource` definitions and explicitly set Resource on new Resource definitions.
3. Provide a simple admin workflow for defining Reservation questions per Resource Type, initially emphasizing Text and Choice to match the required Truck workflow.
4. Load active Reservation definitions for the selected Resource's Resource Type in New Reservation and Edit Reservation.
5. Mark required questions with visible `Required` text, native validation semantics, `aria-required`, inline errors, and a focused error summary rather than relying on an asterisk alone.
6. Save typed Reservation Attribute Value rows with exactly one parent lookup and enforce the agreed recurrence behavior.
7. Preserve current permission behavior, owner-selection rules, conflict checking, and accessible modal focus management.
8. Test as a non-admin Booker in the published app, including create, edit-own, read-calendar, required validation, Choice values, and forbidden peer edits.

### Important interim hazard

The existing Resources screen predates `sfsures_appliesto`. It currently loads definitions by Resource Type without filtering by Applies To and does not explicitly write Applies To when creating a definition. Do not create Reservation definitions through the current UI or manually seed them for production use until the screen is updated; otherwise reservation questions can appear as Resource metadata fields. A Dataverse default may keep new Resource definitions working, but the app should not rely on that implicit default.

### Verification still required

- Confirm the new security-role privileges with a real Booker identity; Joe's System Administrator role masks permission failures.
- Verify Referential, Restrict Delete behavior for all three Reservation Attribute Value lookups if it was not explicitly confirmed in classic relationship settings.
- Confirm alternate keys remain Active after solution movement to sandbox/production.
- Decide audit coverage for definition changes and reservation-answer changes.
- Keep the exclusive Series-or-Occurrence parent invariant in one shared persistence helper so every create/edit path applies it consistently.

## How to Resume

The first response next session should be:

> Before we implement reservation custom fields, please give me the UI nomenclature comments you wanted applied.

After terminology is locked, continue with reservation custom-field administration and reservation-modal rendering/persistence as the absolute #1 priority. Start from this addendum, then inspect the generated Attribute Definition and Reservation Attribute Value models before editing source.
