# SFSU Reservation System -- Runbook Addendum: Deployment and Approval Flows

**Date:** 2026-08-03
**Phase:** Approval-flow implementation checkpoint
**Scope:** Deployment/replication checklist, approval notification flow setup, App Settings published URL, and current approval-test status.

## Headline Outcomes

- Reservation approvals now use an app-owned approval model with a notification-only Power Automate flow.
- The Flow should not approve or deny records. It sends email only; App Admins make the decision inside SFSURES.
- New approval-required reservation submissions create Pending reservation rows that hold the time slot, plus one `Reservation Approval Request` row.
- Approval notification email content is intentionally denormalized onto `Reservation Approval Request` so the Flow can stay simple.
- New production or departmental instances now require a deployment checklist. The important new post-publish setting is App Settings `Published App URL`.

## Approval Model

Approval is configured at Resource Type and Resource level:

- Resource Type has `Requires Approval`.
- Resource has `Approval Mode`: inherit from Resource Type, no approval required, or approval required.
- For non-admin users, approval-required resources show `Submit for Approval`.
- App Admins continue to book directly.
- Pending reservations participate in conflict detection, so overlapping active or pending reservations block new submissions.
- Approval links use the hash route `#/approval/{reservationApprovalRequestId}`.
- Only App Admins can use the app approval UI. The email/link is a notification convenience, not an authorization mechanism.

## Dataverse Schema Added

### New table

`Reservation Approval Request`

Important fields currently used by the app or Flow:

- `Approval Status`: Pending, Approved, Denied, Cancelled.
- `Request Type`: Single Reservation or Recurring Series.
- `Requested Start` and `Requested End`.
- `Requester Name`.
- `Requester Comments`.
- `Requested Resource Name`.
- `Notification Recipients`.
- `Approval Link`.
- `Decision Source`: App, Power Automate Approval, Admin Override. Current implementation writes App decisions only.
- `Decided On`, `Decided By`, and `Decision Comments`.
- Lookups to Requested By, Booking Owner, Resource, Reservation Occurrence, and/or Reservation Series.

### Existing table extensions

- Resource Type: `Requires Approval`.
- Resource: `Approval Mode`.
- Reservation Occurrence and Reservation Series: `Record Status` includes Pending.
- App Settings: `Published App URL`.

## App Implementation Status

- `BookingModal` computes the effective approval requirement from Resource/Resource Type settings.
- For approval-required non-admin submissions, the app creates Pending Reservation Occurrence/Series rows.
- The app resolves active App Admin emails from the `APP_ADMINS` group and writes them to `Notification Recipients`.
- The app denormalizes `Requester Name`, `Requested Resource Name`, and the per-request `Approval Link`.
- The app pre-generates the approval request GUID so `Approval Link` is present on the initial create. This avoids a race where the Flow trigger could fire before a follow-up update writes the link.
- `CalendarScreen` handles `#/approval/{id}`, opens the existing reservation detail modal in approval-review mode, and provides Approve/Deny controls for App Admins.
- Approve changes pending linked reservation rows to Active and marks the approval request Approved.
- Deny changes pending linked reservation rows to Cancelled and marks the approval request Denied.
- App Settings admin UI includes `Published App URL`.
- `ThemeProvider` loads `Published App URL` for approval-link generation.

Latest verification in this checkpoint:

- `npm run build` passed after approval, App Settings URL, and approval-link changes.
- Power Automate notification-only Flow was manually tested by the user with the Flow Test button.
- Full end-to-end app test with a real non-admin user is still pending.

## Power Automate Flow

Use one notification-only cloud flow in the SFSURES solution.

Recommended shape:

1. Trigger: Dataverse `When a row is added, modified or deleted`.
2. Change type: Added.
3. Table: `Reservation Approval Requests`.
4. Scope: Organization.
5. Action: Office 365 Outlook `Send an email (V2)`.
6. To: dynamic content `Notification Recipients`.
7. Subject: `Reservation approval request pending`.
8. Body: use the denormalized fields and an explicit HTML link around `Approval Link`.

Recommended trigger filter:

```text
sfsures_notificationrecipients ne null and sfsures_notificationrecipients ne ''
```

This prevents manual half-created Dataverse grid rows from firing the Flow before `Notification Recipients` is filled. App-created approval request rows should already have recipients on initial insert.

Recommended date expressions for Pacific time:

```text
formatDateTime(convertTimeZone(triggerOutputs()?['body/sfsures_requestedstart'], 'UTC', 'Pacific Standard Time'), 'dddd, MMMM d, yyyy h:mm tt')
```

```text
formatDateTime(convertTimeZone(triggerOutputs()?['body/sfsures_requestedend'], 'UTC', 'Pacific Standard Time'), 'dddd, MMMM d, yyyy h:mm tt')
```

Recommended HTML link:

```html
<p>
  <a href="[Approval Link]">Review this reservation request in SFSURES</a>
</p>
```

Replace `[Approval Link]` with the Flow dynamic content token.

## Deployment Checklist

Use this checklist when rolling out a new production or departmental instance.

### 1. Environment and Solution

- Confirm target environment has Dataverse and Code Apps enabled.
- Confirm region and environment ownership match the rollout plan.
- Import the SFSURES managed solution.
- Confirm the app, Dataverse tables, choices, security roles, Owner teams, and Flow components are present.
- Publish all Dataverse customizations after import or schema edits.
- Publish the Code App.

### 2. Security and Sharing

- Confirm Owner teams exist: `sfsures Admins`, `sfsures Bookers`, `sfsures Viewers`.
- Confirm each Owner team has exactly its intended security role.
- Share the app only with the intended population or Entra groups.
- Confirm Dataverse role/team membership aligns with app sharing.
- Add at least one real admin user to the app and to the correct Dataverse/team access path.
- Verify `APP_ADMINS` and `REPORT_VIEWERS` group rows exist and remain protected in the app UI.
- Add at least one active App User with a valid email to `APP_ADMINS`.

### 3. App Settings

- Open Admin -> Settings.
- Set App Name and logo as needed.
- Set reservation limits if the department needs stricter limits than defaults.
- Set `Published App URL`.
- Include `hidenavbar=true` in the published URL before any hash route.
- Do not include an approval route in the stored base URL.

Example base URL shape:

```text
https://apps.powerapps.com/play/...?...&hidenavbar=true
```

The app appends:

```text
#/approval/{reservationApprovalRequestId}
```

### 4. Power Automate

- Confirm the notification Flow is inside the SFSURES solution.
- Confirm all Flow connections are valid.
- Assign or confirm Flow owner/co-owner. For production, prefer a stable service/admin ownership strategy rather than a single departing individual.
- Save the Flow and turn it on.
- Confirm `Send an email (V2)` uses `Notification Recipients` for To.
- Confirm email body uses `Requester Name`, `Requested Resource Name`, formatted requested start/end, `Requester Comments`, and `Approval Link`.
- Use the Flow Test button before live app testing.

### 5. Catalog and Permissions

- Configure Resource Types.
- Configure Resources.
- Configure Resource Type permissions for ordinary groups.
- Configure Resource Type/Resource reservable hours.
- Configure Resource Type/Resource approval requirement:
  - Use Resource Type `Requires Approval` for broad defaults.
  - Use Resource `Approval Mode` for exceptions.
- Confirm normal Booker users are active App Users, mapped to Dataverse System Users, and assigned to groups with Book access.

### 6. Smoke Tests

Test as an App Admin:

- Sign in.
- Confirm Settings, Users, Groups, Resources, and Blackouts access as expected.
- Create a direct reservation for a non-approval-required resource.
- Create a direct reservation for an approval-required resource; App Admin should still book directly.

Test as a non-admin Booker:

- Sign in.
- Confirm only permitted Resource Types/Resources are visible.
- Create a normal reservation for a non-approval-required resource.
- Submit a reservation for an approval-required resource.
- Confirm the submit button says `Submit for Approval`.
- Confirm the reservation row is Pending.
- Confirm the `Reservation Approval Request` row has `Notification Recipients`, `Requester Name`, `Requested Resource Name`, and `Approval Link`.
- Confirm pending request blocks a duplicate overlapping booking.

Test the approval email:

- Confirm the admin receives the email.
- Confirm the review link is clickable.
- Confirm the link opens the app at the specific approval request.
- Approve one request and verify reservation rows become Active.
- Deny one request and verify reservation rows become Cancelled.
- Confirm non-admin users cannot approve by direct-linking to the approval route.

## Current Status

Ready for controlled end-to-end testing with a real non-admin Booker and App Admin in the app runtime.

The notification Flow has been manually tested, but the complete app-created path still needs verification:

- Non-admin submit for approval.
- Admin email delivery with clickable `Approval Link`.
- Admin approval and denial from inside the app.
- Direct-link authorization behavior for non-admins.

## Still Open / Carry Forward

- Document the exact production Flow owner/service-account policy once the university ownership strategy is decided.
- Add deployment-runbook details for managed solution export/import once first replication is performed end-to-end.
- Confirm whether the notification Flow should record `Approval Email Sent On` or Flow run URL. Current simple design avoids Flow writes.
- Add a visible in-app approval queue for App Admins if email-only discovery is not enough.
- Add requester notification on approve/deny if required.
- Decide whether pending approval requests should expire or be auto-cancelled after a configurable interval.
- Server-side plug-in hardening is still future work; approval-required reservation writes remain app-enforced until plug-ins exist.

## How to Resume

1. Push/publish the current app build to the target app instance.
2. In Admin -> Settings, set `Published App URL` with `hidenavbar=true`.
3. Turn on the notification Flow.
4. Run the non-admin Booker end-to-end approval test.
5. Record the test results and any Flow ownership decisions in the next docs closeout.
