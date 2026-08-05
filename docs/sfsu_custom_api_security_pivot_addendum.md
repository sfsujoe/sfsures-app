# SFSU Reservation System -- Runbook Addendum: Custom API Security Pivot

**Date:** 2026-08-05
**Phase:** Reservation-write hardening pivot selected; Custom API implementation next
**Scope:** Documents the decision to stop broadening table-triggered reservation plug-ins, move ordinary reservation writes behind Dataverse Custom APIs, simplify the target security model, and prepare the Code App toolchain for Dataverse action/function generation.

**Follow-up:** The first `sfsures_CreateReservation` contract was later drafted in [CreateReservation Custom API Contract Addendum](sfsu_create_reservation_custom_api_contract_addendum.md). Treat this pivot note as rationale and the contract addendum as the implementation handoff.

## Headline Outcomes

- The table-triggered `ReservationOccurrenceCreateGuard` step was unregistered in the development environment after the team selected a Custom API write path as the stronger anti-vandalism boundary.
- The C# plug-in workspace under `plugins/` remains useful; it should be repurposed for Custom API plug-ins such as `sfsures_CreateReservation`, not discarded.
- The target security model is now simpler: ordinary app users may have broad read access, but should lose direct reservation-table write access and instead execute constrained Custom APIs.
- `@microsoft/power-apps` and the npm `power-apps` CLI are now explicitly pinned high enough for `find-dataverse-api` and `add-dataverse-api`.
- Vite now ignores `plugins/**` while watching files so Visual Studio plug-in solution locks do not crash local Code App development.

## What Changed

The earlier synchronous table plug-in path was reassessed against two threat types:

- Policy-bypass vandalism, where a user writes invalid or out-of-policy rows directly to Dataverse.
- Volume/DoS-style vandalism, where a user writes many technically valid reservations and bloats or disrupts the reservation tables.

The existing `ReservationOccurrenceCreateGuard` could block some invalid direct `Reservation Occurrence` creates, but it could not by itself solve valid high-volume abuse. Expanding the table-step matrix would also add synchronous latency to every direct table write while still leaving ordinary users with direct table write capability until the security roles were changed.

The selected direction is now to move regular reservation writes behind narrow Dataverse Custom APIs:

- `sfsures_CreateReservation`
- later `sfsures_EditReservation`
- later `sfsures_CancelReservation`
- possibly `sfsures_DecideApprovalRequest` for app-native approval decisions

The app would call these Custom APIs using the signed-in user's normal Power Apps/Dataverse identity. The C# Custom API plug-in should validate using the caller context, then write reservation rows with a Dataverse service created as SYSTEM after validation succeeds.

## Decisions / Rationale

Origin detection such as "did this come from Web API vs the app" is not trusted as a security boundary. Even when plug-in context exposes caller/client-adjacent details, the durable boundary should be server-side validation of the attempted operation, not whether the request appears to have originated from a particular UI.

The Custom API path is stronger because ordinary users can be denied direct create/update/delete privileges on sensitive reservation write tables. A determined user may still call the Custom API from Postman or a browser console, but the only operation available is the constrained server command.

All in-house app users having broad read access to reservation/catalog data is accepted. There is no current requirement to hide reservation data between internal users. View-only vs booking ability can remain SFSURES business permission data enforced in the app and in the Custom API plug-ins.

Admins retaining direct write privileges is accepted. Admins are trusted operators, and direct Dataverse table access may be useful for recovery, support, or exceptional cleanup. If abuse comes from leadership or trusted admins, that is an organizational-control problem more than an app-code problem.

## Target Security Model

The target Dataverse role model is:

- `sfsures User`: broad read access needed by the app, execute permission for reservation Custom APIs, no direct create/update/delete on `Reservation Series`, `Reservation Occurrence`, or `Reservation Attribute Value`.
- `sfsures Admin`: broad app/admin access and direct table write capability where useful.

Viewer, Booker, App Admin, and Report Viewer remain SFSURES business concepts backed by App User/Group data. The app may use those flags for UI presentation, but Custom API plug-ins must enforce booking permission for reservation writes.

The existing three-role/three-team model still exists until the roles are deliberately refactored. The new two-role model is the selected target, not yet fully implemented.

## Custom API Guard Boundary

The first Custom API should be `sfsures_CreateReservation`. Its contract should cover:

- Resource Type/Resource context.
- Booking owner App User.
- Start/end for single reservations.
- Recurrence pattern, count/until mode, and generated occurrence cap for recurring reservations.
- Comments.
- Text/Choice custom-field answers.
- Approval-required submission behavior.

The server-side validation boundary should include:

- Caller is an active onboarded SFSURES App User.
- Selected booking owner is valid and allowed for the caller.
- Resource and Resource Type are active/enabled.
- Caller or selected owner has Book permission for the Resource Type/Resource.
- Requested dates are valid and within hard reservation limits.
- Requested occurrences are inside effective reservable hours unless admin override is allowed and explicitly represented.
- Requested occurrences do not conflict with active/pending reservations or blackout windows.
- Quotas/rate-style business limits prevent valid high-volume abuse, such as maximum future active/pending reservations per user, maximum generated occurrences per request, maximum span, and possibly rolling new-reservation limits.
- Approval-required resources create Pending reservation rows plus a populated Reservation Approval Request.

## Tooling Notes

The npm Code Apps toolchain now has the needed Custom API command surface:

- `@microsoft/power-apps` is explicitly updated to `^1.2.12`.
- `@microsoft/power-apps-cli` is explicitly added as a dev dependency at `^0.15.2`.
- `npx power-apps --help` exposes `find-dataverse-api` and `add-dataverse-api`.

The newer `@microsoft/power-apps` package no longer brought the CLI along in the same way the previous installed version did, so pinning `@microsoft/power-apps-cli` directly is intentional.

`vite.config.ts` now ignores `plugins/**` for dev-server file watching. This prevents local Vite crashes when Visual Studio or Windows locks files such as `plugins/Sfsures.Plugins/Sfsures.Plugins.sln`.

## Current Status

- `ReservationOccurrenceCreateGuard` source still exists in the repo, but its manually registered development Dataverse step has been unregistered.
- Normal app reloads still work after unregistering the table step.
- The C# plug-in project, package project, strong-name signing setup, and deployment learning remain valuable setup for Custom API plug-ins.
- No Custom API has been defined, registered, generated into the Code App, or called by the React app yet.
- Current app reservation writes still use generated Dataverse table services until the Custom API refactor begins.

## Still Open / Carry Forward

- Implement the drafted `sfsures_CreateReservation` Custom API request/response contract from [CreateReservation Custom API Contract Addendum](sfsu_create_reservation_custom_api_contract_addendum.md).
- Implement the first Custom API plug-in handler in the existing `plugins/` workspace.
- Register the Custom API and related plug-in type/step as solution components.
- Generate the Custom API client into the Code App with `npx power-apps find-dataverse-api` and `npx power-apps add-dataverse-api`.
- Refactor `BookingModal` create flows to call `sfsures_CreateReservation`.
- After create works, design and implement edit/cancel Custom APIs.
- Refactor Dataverse roles toward `sfsures User` and `sfsures Admin`, removing ordinary direct reservation-table write privileges only after the Custom API write path works.
- Decide exact anti-volume quotas before production rollout.
- Update older plug-in hardening docs later with a superseded notice so the retired table-step path does not look like the current plan.

## How to Resume

1. Start with [CreateReservation Custom API Contract Addendum](sfsu_create_reservation_custom_api_contract_addendum.md).
2. Decide the minimum quota/idempotency rules for the first implementation.
3. Implement the C# Custom API plug-in handler using the existing `plugins/` project.
4. Register the Custom API in development Dataverse.
5. Generate the Code App API client and replace the single-reservation create path first.
