# SFSU Reservation System -- Runbook Addendum: Generated Dataverse Name Fields

**Date:** 2026-07-16  
**Phase:** Calendar reservation-info Custom Field display bug fixed and generated-field guardrail documented.  
**Scope:** Phantom generated `sfsures_*name` properties, reservation-info detail loading, and future `$select` safety.

## Headline Outcomes

1. The reservation-info modal Custom Fields bug was traced to an invalid Dataverse `$select`, not to missing Reservation Attribute Value rows.
2. Generated `sfsures_*name` properties that exist only on expanded TypeScript interfaces are not automatically real Dataverse columns.
3. `CalendarScreen` now labels Resource Attributes and Custom Fields by querying real Attribute Definition rows and mapping `sfsures_attributedefinitionid` to `sfsures_name`.
4. Reservation detail loading now uses independent result handling so one failed detail query does not blank unrelated detail sections.

## What Changed

### Reservation-info modal

- Removed `sfsures_attributedefinitionname` from Resource Attribute Value and Reservation Attribute Value `$select` lists.
- Added an Attribute Definition label lookup using the real columns `sfsures_attributedefinitionid` and `sfsures_name`.
- Resource Attributes and Custom Fields now display labels from that definition map.
- Occurrence-level answers still win over series-level answers for the same definition.
- The defensive broad-read fallback remains for answer lookup, with normalized GUID matching.
- Detail fetches now use settled results and log per-section warnings instead of letting one rejected request clear every section.

### Generated field rule

The generated models include useful TypeScript hints, but they are not a schema contract for `$select`.

Safe rule:

- A custom field in the generated `*Base` interface is a designed Dataverse column and is generally safe to select.
- A custom `sfsures_*name` field that appears only on the expanded interface should be treated as suspect unless Dataverse metadata proves it is real.
- For custom lookups, Choice fields, and Boolean display labels, prefer querying the real related/configuration table or using OData formatted-value annotations where the runtime already returns them.
- Do not add generated custom `*name` fields to `$select` just because TypeScript exposes them.

Known safe exceptions are Dataverse system fields such as `createdbyname`, `modifiedbyname`, `owneridname`, `organizationidname`, `statecodename`, and `statuscodename`, plus designed app columns such as `sfsures_displayname` and `sfsures_selectedthemename`.

## Decisions / Rationale

### Source labels from real definition rows

`BookingModal` already loads custom-field labels from Attribute Definition rows. The reservation-info modal now follows the same pattern instead of relying on generated shadow-name fields on value tables.

### Prefer graceful degradation for detail sections

The reservation-info modal is a review surface. If a secondary detail source fails, the modal should still show the event, owner, comments, and any other successfully loaded detail sections.

## Current Status

- Source fix is implemented in `src/calendar/CalendarScreen.tsx`.
- `npm run lint` and `npm run build` passed after the fix.
- Published Power Apps runtime verification is still required.

## Still Open / Carry Forward

- Re-publish the app and verify the same reservation-info modal now displays saved Custom Field answers.
- Keep the generated custom `*name` field rule visible during future feature work, especially reports, groups, resources, and audit-log screens.
- Consider a lightweight metadata validation script later so invalid `$select` fields fail before publishing.

## How to Resume

If a future screen needs a display label for a lookup, Choice, or Boolean:

1. Check whether the selected field exists in the generated `*Base` interface.
2. If it exists only as a generated custom `sfsures_*name` property, do not `$select` it directly.
3. Query the real related table or verify the live Dataverse metadata with the generated service's `getMetadata()` method.
4. Build a local ID-to-label map when multiple value rows need labels, as `CalendarScreen` now does for Attribute Definitions.
