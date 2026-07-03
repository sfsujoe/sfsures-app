# SFSU Reservation System -- Runbook Addendum: Reservation Details, Comments, and Limits

**Date:** 2026-07-03
**Phase:** Demo-ready reservation workflow polish
**Scope:** Documents header/profile polish, reservation terminology cleanup, owner/detail display, comments, App Settings-backed limits, and related carry-forward decisions.

## Headline Outcomes

- The fixed header now has a larger responsive SFSU logo, a clickable logo link to `https://www.sfsu.edu/`, and a signed-in user profile photo or initials fallback from the tenant.
- User-facing language has been standardized on Reserve/Reservation instead of Book/Booking.
- The reservation confirmation modal now shows the bundled transparent PNG green check icon beside "Reservation Confirmed".
- The Reservation Info modal no longer shows the owner SF State ID. It now shows the reservation owner's display name, email, tenant profile photo or initials fallback, reservation comments when present, and a `mailto:` email link.
- Reservation comments are now a first-class plain-text Memo field on both Reservation Occurrence and Reservation Series, with single-reservation create/update writing `sfsures_comments`.
- App Settings now carries configurable reservation limits, while code hard caps prevent any instance from loosening the policy beyond 50 generated occurrences or an 18-week span.

## What Changed

- `src/calendar/CalendarScreen.tsx` now reads the signed-in user's profile photo through `Office365UsersService`, renders the header avatar, and opens the SFSU logo in a new tab.
- `src/calendar/CalendarScreen.tsx` enriches clicked reservation events with `sfsures_comments` and loads owner App User details by lookup GUID, then uses Office365Users for tenant display/photo data where available.
- `src/calendar/CalendarScreen.module.css` now includes responsive header sizing, avatar styling, owner-detail layout, and a read-only comments section for the reservation info dialog.
- `src/booking/BookingModal.tsx` includes a Comments textarea in the New/Edit Reservation form, writes `sfsures_comments` on create/update, and echoes comments in the success summary.
- `src/booking/BookingModal.tsx` enforces the active max-span setting for single reservations and surfaces the active span limit under the date/time inputs.
- `src/theme/ThemeContext.tsx` exposes `reservationLimits`, hard constants `HARD_MAX_RESERVATION_OCCURRENCES = 50` and `HARD_MAX_RESERVATION_SPAN_WEEKS = 18`, and clamps Dataverse App Settings values so admins can only make limits more restrictive.
- Power Apps data sources were refreshed for App Settings, Reservation Occurrence, and Reservation Series. Generated metadata now includes `sfsures_maxreservationoccurrences`, `sfsures_maxreservationspanweeks`, and `sfsures_comments`.
- `docs/sfsu_dataverse_build_sheet.md` now records Comments on Series/Occurrence and the App Settings limit columns.

## Decisions / Rationale

- Comments should be plain text, not rich text. The reservation use case is operational metadata, and plain text is easier to search, audit, export, sanitize, and render consistently in the Code App.
- Do not use Dataverse Notes/Timeline for reservation comments. A direct Memo column keeps the UI and security model simpler.
- Comments should live on Reservation Occurrence for fast calendar/detail reads. For future recurring reservations, Series comments should be copied to generated Occurrences so the modal does not need a per-click Series lookup.
- The recurrence cap is 50 generated occurrences. This supports roughly a year of weekly reservations or 10 workweeks of daily reservations while bounding conflict checks, bulk updates, audit volume, and accidental runaway series.
- The reservation span cap is 18 weeks. This approximates a semester and prevents low-count long-tail recurrence patterns, such as 50 monthly dates spread across years.
- App Settings may lower these limits but cannot raise them above code hard caps. Dataverse column min/max values should mirror this policy: occurrences 1-50, span weeks 1-18, defaults at the maxima for new instances.
- The Vite large chunk warning is a baseline metric, not a current blocker. Revisit when admin/settings/report screens are introduced, especially by lazy-loading non-calendar screens.

## Current Status

- `npm run build` passes after the UI, schema refresh, comments, and limit changes. The existing Vite large-chunk warning remains.
- Current built bundle baseline is approximately 631 kB minified JavaScript and 226 kB gzipped JavaScript.
- The calendar/reservation flow now supports create/update of single, non-recurring reservations with resource, start, end, owner, comments, conflict checks, and the 18-week span cap.
- Reservation Info is now suitable for demo use: resource/time, comments, and owner profile details are visible without exposing SF State ID.
- App Settings model and generated schema include the new limit columns, but the App Settings admin screen has not been built yet.

## Still Open / Carry Forward

- Recurring reservation UI still needs to enforce both resolved limits before creating any Series or Occurrence rows.
- Series comment edit behavior is not implemented. The likely first rule: editing a Series applies comments to future active Occurrences; editing one Occurrence changes only that Occurrence.
- Future edit-from-existing-reservation flows should load existing `sfsures_comments` into the reservation form.
- The App Settings screen must show hard maximum values beside editable reservation limits and block or clamp looser values.
- Audit logging should include comments in before/after snapshots once audit writes are implemented for reservation create/modify/cancel.
- As admin/settings/report screens arrive, introduce navigation with lazy-loaded screen modules so calendar users do not download every admin surface on first load.
- Resource group scoping, recurring reservations, admin screens, reports/exports, full DPRC verification, and non-admin Booker permission testing remain open.

## How to Resume

- For reservation create/update comments and span validation, start with `src/booking/BookingModal.tsx`.
- For clicked-reservation details, owner profile display, and comments display, start with `src/calendar/CalendarScreen.tsx`.
- For reservation limit policy, start with `src/theme/ThemeContext.tsx` and the App Settings columns in `docs/sfsu_dataverse_build_sheet.md`.
- For future recurring reservation implementation, generate the candidate occurrence list first, then validate `occurrences.length <= reservationLimits.maxOccurrences` and total span `<= reservationLimits.maxSpanWeeks` before any Dataverse writes.
