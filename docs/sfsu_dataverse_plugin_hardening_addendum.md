# SFSU Reservation System -- Runbook Addendum: Dataverse Plug-in Hardening Decision

**Date:** 2026-07-23
**Phase:** Security hardening decision and v2.0 planning
**Scope:** Documents the decision to pursue synchronous Dataverse plug-ins for server-side reservation enforcement, why this route was chosen over audit-only controls or an external backend, what the plug-ins should protect, and what limitations remain.

## Headline Outcomes

- Direct Dataverse API bypass is now treated as a credible broad-rollout risk, not merely an accepted residual.
- The selected hardening route is synchronous Dataverse plug-ins that reject invalid reservation writes inside the Dataverse event pipeline.
- Plug-ins are favored because they move critical booking rules from app-only logic into server-side enforcement while preserving the managed-solution replication model.
- The plug-in work can be delivered after MVP as a managed solution update or upgrade, but it should be planned as the first production-hardening milestone before broad downstream rollout.
- Nightly or frequent Power Automate exports to SharePoint remain useful as recovery/forensics controls, but they do not replace preventive server-side validation.

## What Changed

No app source or schema files changed in this session. This was a design and documentation closeout.

The documented security posture changed from "possible Dataverse plugin hardening" to a committed architectural direction:

- Build synchronous Dataverse plug-ins for reservation write enforcement.
- Keep the plug-in project in the same repo as the Code App, likely under a separate `plugins/` folder with its own C# / .NET Framework Visual Studio solution.
- Include the plug-in assembly, synchronous steps, and any step images/configuration as solution components so they travel with the SFSURES managed solution.
- Treat SharePoint exports and reconciliation reports as detection/recovery layers, not as the primary security boundary.

## Decisions / Rationale

### Why plug-ins

The current app correctly filters resources in the UI, but a Booker with Dataverse table access can deliberately craft a Web API request against `sfsures_reservationoccurrences` and point it at a Resource they should not be able to book. This requires intent and technical ability, but the risk is realistic for approved users who are developers, IT-adjacent power users, or students with AI coding assistance.

Synchronous Dataverse plug-ins are the best fit because they:

- run for Dataverse writes regardless of entry point: Code App, Web API, Excel connector, Power Automate, or another client;
- can reject invalid operations before the write is committed;
- stay inside Dataverse and do not require a separate Azure/API hosting layer for the first hardening pass;
- can be packaged as solution components for managed-solution replication;
- let SFSURES keep the existing Dataverse-centered architecture while moving the most important business rules out of bypassable UI code.

### Why not audit-only

Audit logging, reconciliation, and backups are necessary but insufficient. They can identify or help recover from bad writes after the fact, but they cannot prevent a rogue booking from disrupting the live calendar.

For a small pilot with highly trusted Bookers, audit-only may be an acceptable temporary residual. For broad rollout, the known ability for a capable Booker to create out-of-policy reservation rows is too brittle.

### Why not Custom API first

A Custom API write path would be cleaner because Bookers could lose direct Create/Write privileges on reservation tables and call only controlled reservation operations. This remains a strong future architecture option.

For the next hardening milestone, synchronous table plug-ins are a smaller step from the current app because the existing Code App can keep using generated Dataverse services while Dataverse itself rejects invalid writes. This reduces refactor cost while materially improving security.

### Why not external backend first

An Azure Function or dedicated backend with a service principal would provide the strongest boundary and better operational controls, but it adds hosting, authentication, secrets, monitoring, deployment, and ITS/security-review complexity.

The current replication strategy favors portable Dataverse solution components. Plug-ins are the better near-term match for that constraint.

## Proposed Plug-in Boundary

The first plug-in package should focus on reservation integrity, not every possible app rule.

Candidate synchronous guards:

- `ReservationOccurrenceCreateGuard`
- `ReservationOccurrenceUpdateGuard`
- `ReservationOccurrenceDeleteGuard`
- `ReservationSeriesCreateGuard`
- `ReservationSeriesUpdateGuard`
- `ReservationSeriesDeleteGuard`
- `ReservationAttributeValueGuard`

Primary validations to enforce:

- Caller maps to one active App User and, for Booker-level writes, cannot spoof another Booking Owner unless the caller has App Admin authority.
- Selected Booking Owner has group-derived `Book` access to the selected Resource Type.
- App Admin delegated booking still respects the selected owner's ordinary `Book` access.
- Resource exists, is active, and belongs to an active/reservable Resource Type.
- Reservation start/end values are valid and within configured max occurrence/span limits.
- Requested occurrence or series does not overlap active blackout windows.
- Requested occurrence or generated series occurrences do not conflict with active reservation occurrences for the same Resource.
- Create/update/delete actions preserve the intended own-record and admin-only boundaries.
- Reservation Attribute Value rows point to a valid reservation parent, valid reservation-scoped Attribute Definition, and only one typed answer value.

Implementation should keep the plug-in code deterministic and boring: extract the attempted write, load the minimum needed Dataverse rows using `IOrganizationService`, validate, and throw `InvalidPluginExecutionException` for violations.

## Managed-Solution Portability

Plug-ins do not need to be baked into the day 1 MVP to remain portable. They can be added later through a SFSURES managed solution update or upgrade:

1. Add the C# plug-in assembly to the source unmanaged `sfsures` solution.
2. Register synchronous SDK message processing steps for the relevant tables/messages.
3. Add each step and any required images/configuration to the solution.
4. Increment the solution version and export managed.
5. Import the updated managed solution into downstream department environments.
6. Enable plug-in steps during import.

Important packaging rule: the assembly alone is not enough. The SDK message processing steps are separate solution components and must travel too.

## Limitations

Plug-ins reduce the direct API bypass risk, but they are not magic.

- They protect writes only for messages/tables/attributes covered by registered steps.
- They do not retroactively prove old reservation rows were valid.
- They must be carefully tested to avoid blocking legitimate app workflows.
- They add C#/.NET Framework development and ALM overhead to a repo that is currently TypeScript-first.
- They can introduce performance costs if conflict or permission queries are broad.
- They still run under Dataverse constraints; true multi-row transactional recurrence semantics may require careful step design.
- They do not eliminate the need for audit logs, reconciliation reports, backups, and non-admin security testing.

## Current Status

- No plug-in project exists yet.
- No Dataverse plug-in assembly or steps have been registered.
- The decision is now to pursue synchronous Dataverse plug-ins as the preferred server-side hardening path.
- This can be a v2.0 managed-solution upgrade, but broad rollout should not treat the direct API bypass as a permanent accepted residual.

## Still Open / Carry Forward

- Decide whether plug-in hardening is required before the first non-pilot department replication or whether the initial MVP can run only in a tightly controlled pilot.
- Scaffold `plugins/Sfsures.Plugins/` as a separate C# Visual Studio solution inside the same repo.
- Draft the exact plug-in step registration matrix: table, message, stage, mode, filtering attributes, pre/post images.
- Decide whether to begin with table guards or move directly to a Custom API write path.
- Build a test plan with a non-admin Booker identity, including direct Web API create/update attempts.
- Add a reconciliation/export strategy as a detection and recovery layer, separate from preventive enforcement.
- Confirm downstream import permissions and the managed-solution process for plug-in assemblies/steps in production-like environments.

## How to Resume

Start from this addendum, then reread [Security Roles and Teams Addendum](sfsu_security_roles_and_teams_addendum.md) and [Threat Model Addendum](sfsu_threat_model_addendum.md).

Recommended next work:

1. Draft the plug-in step matrix for Reservation Occurrence, Reservation Series, and Reservation Attribute Value.
2. Decide MVP vs v2.0 timing for plug-in enforcement before broader rollout.
3. Scaffold the C# plug-in project under `plugins/` only after the timing and first-step matrix are agreed.
