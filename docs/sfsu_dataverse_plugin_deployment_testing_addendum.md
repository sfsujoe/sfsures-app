# SFSU Reservation System -- Runbook Addendum: Dataverse Plug-in Deployment and Testing

**Date:** 2026-08-05
**Phase:** First Dataverse plug-in deployed; repeatable negative testing next
**Scope:** Captures the Visual Studio/Dataverse plug-in setup, first Reservation Occurrence guard behavior, trace-log discovery, and the planned developer test-harness direction.

## Headline Outcomes

- The first SFSURES Dataverse plug-in assembly was created, signed, built, deployed, and registered in the development Dataverse environment.
- `ReservationOccurrenceCreateGuard` moved from trace-only to an initial synchronous Create guard for `sfsures_reservationoccurrence`.
- The manually registered step fired successfully and produced trace output in the Plug-In Trace Log.
- The next testing step is to replace browser-console one-offs with a repo-local, developer-only Dataverse test harness.

## What Changed

- Added a Visual Studio/Dataverse plug-in workspace under `plugins/`:
  - `plugins/Sfsures.Plugins/`
  - `plugins/Sfsures.Plugins.Package/`
- Retargeted the plug-in projects to .NET Framework 4.8 after the Power Platform template defaulted or fell back to 4.6.2.
- Added strong-name signing with `Sfsures.Plugins.snk` after Visual Studio and `sn.exe` key generation both hit local access-denied behavior.
- Deployed the plug-in assembly from Visual Studio after adding the Power Platform Package project.
- Registered the first step with the Plug-in Registration Tool rather than the Visual Studio Add Step command, because Visual Studio returned:
  - `The specified type "CrmSdk.SdkMessage is not a known entity type.`

## Plug-in Step

Current manually registered step:

- Assembly: `Sfsures.Plugins`
- Type: `Sfsures.Plugins.ReservationOccurrenceCreateGuard`
- Message: `Create`
- Primary Entity: `sfsures_reservationoccurrence`
- Stage: `PreOperation`
- Mode: `Synchronous`
- Deployment: Server
- Filtering attributes: blank
- Execution order: `1`

The step is currently manual configuration debt: `plugins/Sfsures.Plugins.Package/RegisterFile.crmregister` records the assembly/type but does not yet represent the manually registered step. Before ALM or production replication, sync the step registration into the package/solution path or document the manual registration as an explicit deployment step.

## Current Guard Behavior

On Reservation Occurrence Create, the guard currently validates:

- Target entity is present.
- Resource lookup is present and references `sfsures_resource`.
- Booking Owner lookup is present and references `sfsures_appuser`.
- Start and End are present.
- End is after Start.
- Resource is active.
- Resource `sfsures_recordstatus` is not Disabled.
- Resource has a Resource Type.
- Resource Type is active.
- Resource Type `sfsures_status` is not Inactive.

Known block messages include:

- `Reservation Resource is disabled.`
- `Reservation Resource Type is inactive.`
- `Reservation End must be after Start.`

This is the first guard slice only. Conflict checks, blackout checks, recurrence/series invariants, custom-field invariants, permission checks, and broader update/delete protections remain future hardening work.

## Testing Notes

- The first trace-only version fired successfully.
- The first required-field/resource-validation version fired successfully and logged `ReservationOccurrenceCreateGuard required-field validation passed.`
- Dataverse trace timestamps may appear seven hours ahead of Pacific time during daylight saving time because the trace log uses UTC.
- The Plug-In Trace Log was found at Power Apps -> Settings -> Advanced Settings -> left navigation -> Plug-In Trace Log.

For a one-off negative test, a browser DevTools Web API script can try to create a Reservation Occurrence against a disabled Resource and should receive `Reservation Resource is disabled.`

For repeated testing, prefer a repo-local harness instead of repeated browser-console scripts.

## Decisions / Rationale

- Keep plug-in source in the same repo so app, schema, plug-in, and docs history stay together.
- Keep the test harness outside `src/` so it is not bundled into the Power Apps Code App.
- Default the harness to development environments only and require explicit opt-in before any production run.
- Use named tests rather than a generic arbitrary-write utility, so the harness is a validation tool rather than a convenient database mutation script.
- Store environment URLs and credentials in local ignored configuration, not committed source.

## Current Status

- The development environment has a deployed assembly and manually registered Create/PreOperation/Synchronous step for Reservation Occurrence.
- The guard currently blocks invalid direct writes only for the first Resource/Resource Type validation slice.
- Visual Studio and PRT setup are proven enough to continue implementation, but the registration path needs cleanup before production-quality ALM.
- App UI already prevents normal users from choosing disabled Resources, so the direct Web API test is specifically for bypass resistance.

## Still Open / Carry Forward

- Build a developer-only Dataverse test harness under a non-deployed folder such as `tools/dataverse-tests`.
- Add tests for disabled Resource, inactive Resource Type, missing required lookups, and invalid date ranges.
- Add cleanup behavior for any test-created rows that unexpectedly succeed.
- Add guardrails so tests refuse to run against production unless deliberately enabled.
- Decide whether the harness should be Node/TypeScript or C# after comparing developer ergonomics with Dataverse authentication setup.
- Revisit disabled Resource calendar behavior: disabled Resources currently disappear from the calendar along with existing reservations, but the desired behavior may be "not bookable going forward" while existing/historical reservations remain visible.
- Bring the manually registered plug-in step into deployable solution/package artifacts before relying on this in production or replicated department environments.

## How to Resume

1. Confirm the current `ReservationOccurrenceCreateGuard` assembly and step are still deployed in the development environment.
2. Create the repo-local test harness outside `src/`, likely under `tools/dataverse-tests`.
3. Start with the disabled-Resource negative test and assert the Web API response contains `Reservation Resource is disabled.`
4. Add an inactive-Resource-Type negative test next.
5. After harness proof, extend the plug-in guard matrix for Reservation Occurrence, Reservation Series, and Reservation Attribute Value.
