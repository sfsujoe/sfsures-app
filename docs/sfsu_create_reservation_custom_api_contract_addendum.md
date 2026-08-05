# SFSU Reservation System -- Runbook Addendum: CreateReservation Custom API Contract

**Date:** 2026-08-05
**Phase:** `sfsures_CreateReservation` contract drafted; first single-create plug-in slice implemented locally
**Scope:** Defines the first reservation-write Custom API boundary, including request/response fields, validation rules, write behavior, quota rules, error taxonomy, role implications, and the first Code App refactor slice.

## Implementation Status

The first local implementation slice now exists in `plugins/Sfsures.Plugins/CreateReservationPlugin.cs` and compiles into `Sfsures.Plugins.dll`.

Dataverse registration status: `npx power-apps find-dataverse-api --search sfsures_CreateReservation --json --non-interactive` returned `[]` on 2026-08-05, so the Custom API is not registered in the development environment yet.

Supported in this slice:

- Global Custom API message handler for `sfsures_CreateReservation`.
- Required scalar inputs for a single reservation: `ResourceId`, `BookingOwnerAppUserId`, `Start`, and `End`.
- Optional `Comments` and `ClientRequestId`.
- Caller resolution from Dataverse execution context.
- Active App User and Booking Owner validation.
- Non-admin self-booking enforcement.
- App Admin detection through `APP_ADMINS`.
- Resource and Resource Type active/disabled validation.
- Resource Type-scoped Book permission validation through ordinary groups, excluding `APP_ADMINS` and `REPORT_VIEWERS` as booking-permission sources.
- Fail-closed behavior for approval-required non-admin submissions.
- Fail-closed behavior when required reservation custom fields exist.
- Conflict detection against active/pending Reservation Occurrences.
- Blackout conflict detection.
- Future active/pending occurrence quota per Booking Owner.
- SYSTEM creation of one active Reservation Occurrence with system `OwnerId` set to the Booking Owner's mapped Dataverse System User.
- Best-effort server-side ReservationCreated Audit Log write.
- Response outputs for single-create success.

Intentionally not supported yet:

- Recurring reservations.
- Reservation custom-field answer writes.
- Approval Request creation for non-admin approval-required resources.
- Reservable-hours validation.
- Dedicated idempotency/request-log storage.
- Rolling request-rate limits.

Security note: unsupported paths fail closed where they would otherwise create a policy bypass. For example, approval-required non-admin requests and resources with required reservation custom fields are rejected until their server-side write paths are implemented.

## Headline Outcomes

- `sfsures_CreateReservation` should be a global Dataverse Custom API action, not a function.
- The API must be safe when called directly outside the Code App. Do not rely on "came from the app" checks, client secrets, hidden headers, or client-computed validation results.
- The request should express booking intent, not trusted row payloads. The plug-in should expand recurrence, validate all rules, and write reservation rows.
- The first version should support the current create surface: single reservations, daily/weekly/monthly recurring reservations, comments, Text and Choice reservation custom fields, approval-required pending submissions, App Admin delegated booking, and App Admin reservable-hours override.
- Ordinary users should eventually have execute permission for this API but no direct create/update/delete privileges on `Reservation Series`, `Reservation Occurrence`, or `Reservation Attribute Value`.

## API Shape

| Property | Value |
|---|---|
| Display name | Create Reservation |
| Unique name | `sfsures_CreateReservation` |
| Binding type | Global |
| Is function | No |
| HTTP style | Action / POST |
| Plug-in stage | Main operation |
| Execution mode | Synchronous |
| Enabled for workflow | No for v1 |
| Allowed custom processing step type | None unless a later extension point is explicitly needed |
| Managed property | Set Custom API, request parameters, and response properties to not customizable before managed release |

Use an action because this command changes data, accepts structured request data, and may need string values with special characters. Keep it global because the request operates across Resource, App User, Reservation Series, Reservation Occurrence, Reservation Attribute Value, Approval Request, App Settings, Group, and Blackout Window data rather than being naturally bound to one row.

## Parameter Strategy

Dataverse Custom API parameters can be scalar typed, `Guid`, `StringArray`, `Entity`, or `EntityCollection`. For this contract, use a small set of stable scalar parameters plus JSON string parameters for nested client intent. This keeps the Code App call surface practical while leaving the plug-in responsible for strict parsing and validation.

Do not accept prebuilt OData bind strings, record statuses, owner IDs, generated occurrence rows, approval rows, or audit rows from the client.

## Request Parameters

| Unique name | Type | Optional | Description |
|---|---:|---:|---|
| `ResourceId` | Guid | No | `sfsures_resourceid` for the requested resource. |
| `BookingOwnerAppUserId` | Guid | No | `sfsures_appuserid` for the person the reservation is for. Usually the caller; App Admins may choose another eligible owner. |
| `Start` | DateTime | No | First requested local-start instant converted to Dataverse/UTC by the caller, matching current app behavior. |
| `End` | DateTime | No | First requested local-end instant converted to Dataverse/UTC by the caller. Must be after `Start`. |
| `RecurrenceJson` | String | Yes | Empty/null for single reservation, or a compact JSON object describing recurrence intent. |
| `Comments` | String | Yes | Plain-text reservation comments. Trim server-side. |
| `CustomFieldsJson` | String | Yes | JSON array of reservation custom-field answers keyed by Attribute Definition ID. |
| `AllowReservableHoursOverride` | Boolean | Yes | True only when an App Admin explicitly confirmed an out-of-hours override in the UI. Ignored/rejected for non-admin callers. |
| `ClientRequestId` | String | Yes | Optional idempotency token generated by the client for retry protection. Recommended UUID. |

### `RecurrenceJson`

For a single reservation, omit `RecurrenceJson` or send null/empty.

For a recurring reservation:

```json
{
  "frequency": "daily",
  "interval": 1,
  "endMode": "count",
  "count": 4,
  "untilDate": null,
  "weekdays": []
}
```

Rules:

- `frequency`: `daily`, `weekly`, or `monthly`.
- `interval`: integer from 1 through 52.
- `endMode`: `count` or `until`.
- `count`: required for `count`; integer from 2 through the effective max occurrence cap.
- `untilDate`: required for `until`; date or DateTime parseable by the plug-in; cannot exceed the effective span cap.
- `weekdays`: required for weekly recurrence; array containing any of `Sun`, `Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`.
- The server expands recurrence from `Start` and `End`. The client must not send generated occurrence rows.

### `CustomFieldsJson`

V1 should support the same field types currently created by the booking modal: Text and Choice.

```json
[
  {
    "attributeDefinitionId": "00000000-0000-0000-0000-000000000000",
    "value": "User supplied answer"
  }
]
```

Rules:

- `attributeDefinitionId` must point to an active `Attribute Definition` where `Applies To = Reservation`.
- The definition must be scoped to either the selected Resource or its Resource Type.
- Required fields must have a nonblank value.
- Text values are trimmed and length-limited.
- Choice values must exactly match one configured choice option after trimming.
- Unknown, inactive, duplicate, or out-of-scope attribute IDs fail the request.
- Number, DateTime, and Boolean answers are out of scope for v1. Add typed support only when the UI supports those field types.

## Response Properties

| Unique name | Type | Optional | Description |
|---|---:|---:|---|
| `Success` | Boolean | No | True when the command completed. Validation failures should throw Dataverse plug-in exceptions rather than returning false. |
| `Outcome` | String | No | `Created` or `SubmittedForApproval`. |
| `ReservationScope` | String | No | `Single` or `Series`. |
| `ReservationOccurrenceId` | Guid | Yes | Created occurrence ID for single reservations. Empty for recurring-series requests. |
| `ReservationSeriesId` | Guid | Yes | Created series ID for recurring requests. Empty for single reservations. |
| `ApprovalRequestId` | Guid | Yes | Created approval request ID when approval is required. |
| `OccurrenceIdsJson` | String | Yes | JSON array of created occurrence IDs, in chronological order. |
| `OccurrenceCount` | Integer | No | Number of occurrence rows created. |
| `RecordStatus` | String | No | `Active` or `Pending`. |
| `Message` | String | Yes | Short user-displayable success message. |

## Caller Identity

The plug-in must derive the caller from Dataverse execution context, not from request body fields.

Validation must resolve:

- `context.InitiatingUserId` or equivalent caller user ID.
- The active `App User` row mapped to that Dataverse System User.
- Caller group memberships and protected app group keys.
- Whether the caller is an App Admin via `APP_ADMINS`.

Do not accept caller App User ID, caller SF State ID, caller email, or caller admin flag from the client.

## Validation Boundary

The plug-in must validate all of these before writing any reservation rows:

1. Caller is an active onboarded SFSURES App User mapped to the calling Dataverse System User.
2. `BookingOwnerAppUserId` identifies an active App User with a mapped active Dataverse System User.
3. Non-admin caller may book only for themselves.
4. App Admin caller may book for another App User only if the selected owner has Book access to the Resource Type or Resource.
5. Resource exists, is active, and is not disabled.
6. Resource Type exists, is active, and is not inactive.
7. Resource belongs to the resolved Resource Type.
8. Caller or selected owner has Book access through ordinary business groups.
9. Protected groups `APP_ADMINS` and `REPORT_VIEWERS` do not grant ordinary resource booking permission.
10. Start/end are valid, finite, and end is after start.
11. Recurrence intent is valid and expands to at least one occurrence.
12. Expanded occurrence count is within the effective max-occurrence cap.
13. Reservation span is within the effective max-span-weeks cap.
14. All occurrences fall inside effective reservable hours unless the caller is App Admin and `AllowReservableHoursOverride = true`.
15. All occurrences avoid active/pending reservation conflicts for the selected Resource.
16. All occurrences avoid active blackout windows for the selected Resource.
17. Custom field answers satisfy active required Text/Choice field rules for the Resource and Resource Type.
18. Approval-required resources create pending reservation rows plus one Approval Request.
19. Quota checks pass.
20. Optional `ClientRequestId` is either new or maps to an identical previously completed request.

## Quota Rules

The first implementation should enforce simple, explainable anti-volume rules server-side. Suggested v1 defaults:

| Rule | Default |
|---|---:|
| Maximum occurrences per request | Use active App Settings cap, never above 50 |
| Maximum reservation/series span | Use active App Settings cap, never above 18 weeks |
| Maximum future active/pending occurrences per booking owner | 200 |
| Maximum active/pending series per booking owner | 50 |
| Maximum create requests per caller in a rolling 10-minute window | 20 |

Open question: Dataverse alone does not provide an ideal rolling-rate counter without another table or external service. For v1, prioritize the durable total future active/pending limits. Add a lightweight request-log or rate-counter table only if pilot abuse risk justifies it.

## Write Behavior

After validation succeeds, create rows using an organization service that can write despite ordinary users lacking direct table create privileges.

### Single Reservation

Create one `Reservation Occurrence`:

- `sfsures_name`: `<Resource Name> <short date>`
- `sfsures_start`: requested start
- `sfsures_end`: requested end
- `sfsures_recordstatus`: `Active` or `Pending`
- `sfsures_comments`: trimmed comments or null
- `sfsures_Resource`: selected Resource
- `sfsures_BookingOwner`: selected App User
- system `OwnerId`: selected owner's mapped System User

Create `Reservation Attribute Value` rows for submitted custom fields against the occurrence.

If approval is required, create one `Reservation Approval Request` linked to the occurrence.

### Recurring Reservation

Create one `Reservation Series`:

- `sfsures_name`: `<Resource Name> recurring reservation`
- `sfsures_comments`: trimmed comments or null
- `sfsures_frequency`: Daily/Weekly/Monthly choice value
- `sfsures_interval`: interval
- `sfsures_daysofweek`: comma-separated weekly day keys when weekly
- `sfsures_endmode`: UntilDate or Count
- `sfsures_occurrencecount`: occurrence count when count-based
- `sfsures_rangestart`: first occurrence start
- `sfsures_untildate`: until date when until-based
- `sfsures_recordstatus`: `Active` or `Pending`
- `sfsures_Resource`: selected Resource
- `sfsures_BookingOwner`: selected App User
- system `OwnerId`: selected owner's mapped System User

Create one `Reservation Occurrence` per expanded occurrence, linked to the series and using the same Resource, Booking Owner, system owner, comments, and record status.

Create `Reservation Attribute Value` rows for submitted custom fields against the series. For current UI parity, create blank/no-value child rows against each occurrence only if the existing display code still needs occurrence-level rows. Prefer reading inherited series answers later rather than duplicating empty occurrence rows.

If approval is required, create one `Reservation Approval Request` linked to the series.

## Approval Behavior

Approval is required when:

- Caller is not an App Admin, and
- Resource approval mode is `ApprovalRequired`, or
- Resource approval mode is `Inherit from Resource Type` and Resource Type requires approval.

Approval is not required when:

- Caller is an App Admin, or
- Effective resource approval mode is not required.

When approval is required:

- Reservation Series/Occurrence rows are created with `Pending` record status.
- One active Approval Request is created with `Pending` approval status.
- `RequestedBy` is the caller App User.
- `BookingOwner` is the selected owner App User.
- `Resource`, requested start/end, resource display name, requester display name, comments, submitted timestamp, approval link, and notification recipients are populated server-side.
- Missing active App Admin notification recipients fails the request before reservation rows are committed.

## Audit Behavior

The Custom API should write the reservation-created Audit Log row server-side after successful row creation.

Suggested audit details:

```json
{
  "api": "sfsures_CreateReservation",
  "clientRequestId": "optional UUID",
  "outcome": "Created",
  "reservationScope": "Single",
  "affectedRowIds": ["..."],
  "bookingOwnerAppUserId": "...",
  "callerAppUserId": "...",
  "approvalRequired": false,
  "occurrenceCount": 1,
  "reservableHoursOverride": false
}
```

Do not accept audit fields from the client.

## Idempotency

`ClientRequestId` should be optional for the first UI refactor but supported by the plug-in contract.

Preferred behavior:

- If `ClientRequestId` is missing, process normally.
- If present and no matching prior successful create exists for the caller, process normally and store enough idempotency metadata to recognize the result.
- If present and the same caller repeats an identical request, return the original created IDs.
- If present and the same caller repeats a different request body, fail with `DuplicateClientRequestId`.

Open implementation choice: either add an idempotency table or store the token in the audit/details row and query it. A dedicated table is cleaner if retries become important.

## Error Taxonomy

Use Dataverse plug-in exceptions with stable error codes embedded at the start of the message. The Code App can map these to user-friendly messages later.

| Code | Meaning |
|---|---|
| `CallerNotOnboarded` | Calling Dataverse user is not mapped to one active App User. |
| `BookingOwnerInvalid` | Requested booking owner is disabled, missing, or lacks System User mapping. |
| `DelegatedBookingDenied` | Non-admin caller tried to book for someone else, or admin selected an owner without booking permission. |
| `ResourceUnavailable` | Resource or Resource Type is inactive/disabled/mismatched. |
| `BookPermissionDenied` | Selected owner/caller lacks Book permission for the Resource/Resource Type. |
| `InvalidTimeRange` | Start/end or recurrence dates are invalid. |
| `ReservationLimitExceeded` | Occurrence count or span exceeds configured/hard cap. |
| `QuotaExceeded` | User/caller exceeds anti-volume quota. |
| `OutsideReservableHours` | One or more occurrences are outside effective reservable hours. |
| `ConflictDetected` | One or more occurrences overlap active/pending reservations. |
| `BlackoutConflictDetected` | One or more occurrences overlap active blackout windows. |
| `CustomFieldInvalid` | Required/malformed/out-of-scope custom-field answer. |
| `ApprovalRoutingUnavailable` | Approval is required but no active App Admin notification recipient exists. |
| `DuplicateClientRequestId` | Idempotency token reuse conflict. |
| `CreateReservationFailed` | Unexpected server-side failure. |

## Transaction Requirements

The plug-in should make reservation create effectively all-or-nothing:

- Use a synchronous Custom API plug-in and throw before completion if any validation or write fails.
- Perform validation before writes wherever possible.
- Write series, occurrences, attributes, approval request, and audit in one Dataverse transaction context where Custom API plug-in behavior allows it.
- Do not reproduce the current client-side partial-create cleanup pattern as the primary safety mechanism.

If a later test proves Custom API write composition does not rollback as expected, document that immediately and add compensating cleanup inside the plug-in.

## Code App Refactor Slice

First client refactor should replace only create mode:

1. Keep the existing UI, date inputs, custom-field controls, owner picker, approval messaging, and success modal.
2. Keep lightweight client-side validation for fast feedback.
3. Remove create-mode trust in client-side conflict/reservable-hours/custom-field validation as the final authority.
4. Call generated `sfsures_CreateReservation` API for create mode.
5. Use response IDs/count/status to populate success state and refresh the calendar.
6. Leave edit occurrence, edit series, cancel occurrence, and cancel series on current table-service paths until their own Custom APIs are drafted.

## Security Role Refactor Dependency

Do not remove ordinary direct reservation-table create privileges until:

- `sfsures_CreateReservation` is registered and callable from the Code App.
- The Code App create path works for non-admin Bookers in published runtime.
- Approval-required create works end to end.
- Custom-field answer creation works through the API.
- App Admin delegated booking works through the API.
- Direct raw API table create as a non-admin User fails with 403.
- Direct raw Custom API invocation as a non-admin User succeeds only for valid requests and fails for invalid requests.

Then refactor roles toward:

- `sfsures User`: broad read, execute reservation Custom APIs, no direct create/update/delete on reservation write tables.
- `sfsures Admin`: broad app/admin access and direct table writes where intentionally retained.

## Test Matrix

Minimum tests for the first implementation:

| Scenario | Expected result |
|---|---|
| Active Booker creates valid single reservation for self | Active occurrence created. |
| Active Booker creates valid recurring reservation for self | Active series and occurrence rows created. |
| Booker tries direct table create after role refactor | 403. |
| Booker calls Custom API for out-of-scope resource | `BookPermissionDenied`. |
| Booker calls Custom API during blackout | `BlackoutConflictDetected`. |
| Booker calls Custom API for conflicting time | `ConflictDetected`. |
| Booker calls Custom API outside reservable hours | `OutsideReservableHours`. |
| App Admin confirms reservable-hours override | Reservation created. |
| Non-admin sets `AllowReservableHoursOverride = true` | `OutsideReservableHours` or permission error. |
| Non-admin tries delegated booking for another user | `DelegatedBookingDenied`. |
| App Admin books for eligible owner | Reservation created with selected owner as system Owner and Booking Owner. |
| Approval-required resource by non-admin | Pending reservation row(s) and Approval Request created. |
| Approval-required resource by App Admin | Active reservation row(s), no Approval Request. |
| Missing required custom field | `CustomFieldInvalid`. |
| Invalid choice custom field | `CustomFieldInvalid`. |
| Excess recurrence count/span | `ReservationLimitExceeded`. |
| Excess future active/pending reservations | `QuotaExceeded`. |
| Replayed identical `ClientRequestId` | Same result returned without duplicate rows, if idempotency table/lookup is implemented in v1. |

## Open Questions

- Should v1 add a dedicated idempotency/request-log table, or defer idempotency until after the first create path works?
- Should v1 enforce a rolling request-rate quota, or only durable total future active/pending reservation caps?
- Should recurring custom-field answers be stored only at series level, or should the current occurrence-level placeholder behavior be preserved for UI compatibility?
- Should approval notification recipients continue to be a semicolon string on Approval Request, or should the Approval Flow resolve App Admins itself?
- Should System User active/disabled state be checked from `systemuser` during every create, or is the App User mapping sufficient for v1?
- Should `AllowReservableHoursOverride` require an admin-provided reason/comment in the first API version?

## How to Resume

1. Answer the v1 idempotency/rate-quota question.
2. Register `sfsures_CreateReservation` and its request/response parameters in the development solution.
3. Generate the API client into the Code App with `npx power-apps find-dataverse-api` and `npx power-apps add-dataverse-api`.
4. Refactor `BookingModal` create mode to call the generated API for eligible single reservations.
5. Add the next server-side slice: reservable-hours validation, then approval-required single submissions, then custom-field answer writes.
6. Run published-runtime non-admin tests before changing the Dataverse roles.
