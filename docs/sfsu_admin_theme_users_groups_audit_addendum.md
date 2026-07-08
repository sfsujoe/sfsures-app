# SFSU Reservation System -- Runbook Addendum: Admin Theme, Users, Groups, and Audit Logging

**Date:** 2026-07-08
**Phase:** Admin MVP build-out
**Scope:** Lazy admin shell, App Settings theme presets, resource calendar colors, Users and Groups screens, and first audit-log write path for group administration.

## Headline Outcomes

- Admin navigation moved to a left-rail shell, with the heavier Users and Groups screens lazy-loaded as separate chunks.
- App Settings is now preset-only for SFSU themes: admins cannot choose arbitrary fonts or colors, and the settings row name is not exposed.
- Resources now have a `Calendar Color` choice column sourced from SFSU palette colors, and calendar reservation text color is computed from each reservation background color for contrast.
- Users and Groups are separate admin screens. Users remains user-centered, while Groups is group-centered and supports creating custom groups and managing membership.
- Group keys stay hidden in normal UI but remain the stable internal key used by app logic and audit logging.
- Audit Log now has specific group action choices plus `Target Key`; group creation and membership changes write audit rows.

## What Changed

### Admin Shell

- `src/admin/AdminApp.tsx` now gates admin access through `currentUser.isAppAdmin`, shows a left rail, and exposes active sections for Settings, Users, and Groups.
- `UsersScreen` and `GroupsScreen` are imported with `React.lazy` and rendered under `Suspense` fallbacks so admin-only code stays out of the first calendar experience.
- Resources, Blackouts, and Reports remain visible but disabled placeholders.

### App Settings and Theme

- `src/admin/AppSettingsScreen.tsx` loads the single active App Settings row and persists selected SFSU theme preset, logo URL, border radius, and reservation limits.
- Font is fixed to Source Sans 3 and is still written to Dataverse for compatibility, but it is no longer a user choice.
- Arbitrary theme color inputs were removed. The available theme presets currently are Core Purple, Purple #2, Ocean, Forest, and Rock.
- Theme presets include the calendar date-header color. `ThemeContext` publishes `dateHeaderColor`, and `App.tsx` writes it to `--sfsures-date-header` for FullCalendar.
- The App Settings row name is not visible in the UI; new rows use the internal name `SFSU Reservation Settings`.

### Resource Calendar Colors

- Resource now includes `sfsures_calendarcolor`, a choice column with 16 options from the SFSU primary/secondary palettes: all palette colors except Bridge.
- `src/theme/resourceColors.ts` maps those choice values to labels and hex colors.
- Reservation occurrence events now use their active resource's selected calendar color. If a resource color is missing, the app falls back to the current theme primary.
- Text color for reservation events is computed dynamically as black or white using WCAG contrast math. Full black text is allowed on calendar reservations when accessibility requires it.

### Users Screen

- `src/admin/UsersScreen.tsx` loads App Users, active Groups, and active User Group Assignments.
- Admins can search onboarded App Users, add new users from Office365Users, disable/reactivate users through the custom App User `Record Status`, and manage a selected user's group memberships through checkboxes.
- The add-user field has a debounced directory typeahead. Text searches start after 3 characters; numeric-only searches start after 5 characters to avoid broad campus-wide `9...` searches.
- The selected user's profile photo is loaded from Office365Users when available, with initials fallback.
- The screen guards against disabling the current user and against removing the current user's own `APP_ADMINS` membership.
- Group keys are not displayed; group membership rows show whether the group is system or custom.

### Groups Screen

- `src/admin/GroupsScreen.tsx` is a separate group-centered admin surface.
- Admins can search groups, create custom groups, select a group, view member count/type/description, and add or remove users from the selected group.
- New custom groups auto-generate `sfsures_groupkey` from the group name. The key is written to Dataverse and used internally, but is not exposed in the normal Groups UI.
- The screen also guards against removing the current user's own `APP_ADMINS` membership.

### Audit Logging

- Audit Log action choices were split from the older broad `GroupCreatedorEdited` option into:
  - `GroupCreated`
  - `GroupEdited`
  - `GroupMemberAdded`
  - `GroupMemberRemoved`
- Audit Log now includes a generic `Target Key` text column. Group actions write the hidden group key there.
- `src/audit/auditLog.ts` adds a small reusable writer for action audit rows. It snapshots actor SF State ID, actor display name, actor group names, action timestamp, target type/id/key/label, and before/after/details snapshots.
- Audit writes are intentionally nonblocking: if an audit write fails after the business action succeeds, the screen reports that the action completed but the audit row could not be written.
- Group creation writes `GroupCreated` rows from the Groups screen.
- Membership changes write `GroupMemberAdded` or `GroupMemberRemoved` rows from both the Users screen and the Groups screen.

## Decisions / Rationale

- **Separate Users and Groups screens:** Users should stay user-centered for onboarding and per-user membership checks. Groups should be group-centered for creating groups and reviewing/changing membership by group.
- **Hide Group Key in UI:** `sfsures_groupkey` is a stable internal handle, not an admin-facing concept. Showing it creates confusion and invites unnecessary editing pressure. It remains in Dataverse, code checks, and audit snapshots.
- **Use Audit Log Target Key:** A generic `Target Key` column is more reusable than a group-specific audit column and supports future stable-key reporting across other target types.
- **Preset-only theming:** SFSU brand colors and fixed Source Sans 3 reduce the risk of inaccessible combinations or invisible text. Admins retain practical controls without opening arbitrary color/font choices.
- **Dynamic reservation text color:** The resource color palette includes many light colors. Computing event text as black/white by contrast keeps the calendar accessible while allowing most of the SFSU palette to be used.
- **Lazy admin chunks:** Admin screens are less frequently used and can be heavier because they coordinate multiple Dataverse tables and Office365Users calls. Lazy-loading keeps the calendar-first experience lighter.

## Current Status

- Latest verified build during the session: `npm run build` passed.
- Local smoke check: `http://127.0.0.1:3000/` returned `200`.
- Known Vite main-chunk warning remains; new admin screens and audit helper are split separately.
- Group audit writes are implemented in app code, but have not yet been verified end-to-end in the published Power Apps runtime with real Audit Log privileges.
- Audit logging is now partially implemented for group administration only. Session-open, reservation create/edit/cancel, user create/disable/edit, resource edits, blackout edits, and theme/settings changes still need audit-write coverage.

## Still Open / Carry Forward

- Build admin screens for Resources, Blackouts, and Reports.
- Add edit/deactivate behavior for custom groups if admins need to rename or retire groups. If added, use `GroupEdited` audit rows.
- Decide whether to show any advanced/debug audit metadata in future reports; do not expose group keys in normal admin forms.
- Verify Audit Log Create permission in the real roles and confirm that failed audit writes are surfaced acceptably.
- Consider a queue/retry strategy for audit write failures if production users encounter transient Dataverse failures.
- Add audit writes for user onboarding/status changes, settings/theme saves, resource catalog changes, blackout changes, and reservation workflows.
- Validate Office365Users profile photo lookup behavior in the published app, especially when the stored App User email differs from UPN.
- Later resource admin work should expose `Calendar Color` as palette-only choices, not arbitrary colors.

## How to Resume

1. Start from `src/admin/AdminApp.tsx` to understand the lazy admin shell and enabled/disabled sections.
2. For theming, read `src/theme/ThemeContext.tsx` and `src/admin/AppSettingsScreen.tsx`.
3. For resource event colors, read `src/theme/resourceColors.ts` and `CalendarScreen.loadRange`.
4. For membership workflows, read `src/admin/UsersScreen.tsx` and `src/admin/GroupsScreen.tsx`.
5. For audit writes, read `src/audit/auditLog.ts` and the group membership handlers in both admin screens.
