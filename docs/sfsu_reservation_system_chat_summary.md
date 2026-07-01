# SFSU Reservation System — Full Chat Summary

## Context
Joe works in an IT/administrative capacity at San Francisco State University (SFSU) and is developing a resource reservation system using Microsoft Power Apps. This chat documents the collaborative development of an AI vibe coding prompt for that system, including design decisions, rationale, and tradeoffs discussed along the way.

---

## Starting Point
Joe had an existing draft prompt inspired by LibreBooking (https://github.com/LibreBooking/librebooking). The draft covered a calendar interface, role-based permissions, Office365Users integration, reporting, and SFSU branding. Claude analyzed the draft and identified gaps including: missing multi-resource-type flexibility, no approval workflow, no Dataverse specification, no conflict detection callout, no waitlisting, no recurring reservations, and an ambiguous User role.

---

## Key Design Decisions Made During This Chat

### 1. Resource Flexibility
The system must support diverse resource types in a single platform — rooms, scientific equipment, vehicles (trucks, boats), field gear, etc. The Dataverse schema must support type-specific attributes configurable without code changes.

### 2. Backend: Microsoft Dataverse
Specified explicitly as the data backend. No existing backend — built from scratch. Dataverse is the natural Power Platform choice.

### 3. Simplified Permission Model (No Approval Workflow)
**Decision:** Users are vetted externally by Admins and granted group membership before they can book. There is no in-app approval workflow — permission IS the approval. Booking is immediate upon submission for any permitted resource.

**Rationale:** Cleaner architecture, simpler Power Automate flows, better fit for SFSU's actual workflow.

**Roles defined:**
| Role | Capabilities |
|------|-------------|
| Admin | Full access — manage resources, users, groups, blackout windows, reports, all reservations |
| User | Create, view, edit, cancel own reservations for permitted resources |
| Viewer | Read-only calendar access for permitted resources |

*Note: An Approver role was considered and removed since the permission model eliminates the need for it.*

### 4. Features Cut for v1
To improve chances of a coherent first output from the vibe coding AI, the following were deliberately deferred:
- **Approval workflows** — not needed given the permission model
- **Waitlisting** — complex queue logic, not a day-one requirement

**Features retained despite being non-trivial:**
- Conflict detection (essential)
- Recurring reservations (immediate faculty need)
- Maintenance/blackout windows (needed from day one)
- Notifications (expected by users)
- Reporting (will be asked for quickly)

### 5. SF State ID as Primary Identifier
**Decision:** All permissions checking uses SF State ID (first 9 characters of UserPrincipalName) as the sole authoritative identifier — never email address or display name.

**Rationale:** Email addresses and display names are mutable (name changes, department transfers). SF State ID never changes and is the only stable anchor for access control.

SF State ID is the primary key for the Users table. Display Name and Email are stored for convenience and display only.

### 6. Access Gate
On launch, before any content loads:
- Extract SF State ID from the authenticated user's UPN
- Check Users table: ID must exist and account must not be disabled
- If check fails: modal dialog, no app content visible behind it
- If check passes: proceed to main interface

**Rationale:** Azure AD SSO authenticates anyone with an SFSU account (the entire university). The Users table check is the only barrier between the app and the general campus population.

### 7. No Delete User Option
Admins can add, edit, and disable users — but not delete them.

**Rationale:** Deleting users would orphan reservation history. Disabled users' accounts and all associated reservations are preserved. Disabled accounts are visually flagged in the calendar and reports.

### 8. Profile Photo Performance
**Problem:** Office365Users photo lookups are notoriously laggy in Power Apps, especially in galleries.

**Solution for header:** Fetch logged-in user's photo and DisplayName once in `App.OnStart`, store in global variables. All screens reference these variables — no repeat lookups on navigation.

**Solution for admin Users screen gallery:** Fetch all user photos in parallel using `Concurrent()` on screen load, store in a local collection keyed by SF State ID. Gallery binds to the collection. Show a loading indicator. Paginate for large user lists and fetch photos only for the visible page.

### 9. Centralized Theming for White-Labeling
All theming values (colors, fonts, sizes, border radius, logo) must live in a single centralized location — not hardcoded into individual screens or controls.

**Rationale:** Joe may need to duplicate this app for other SFSU units. Rebranding should require updating only the central theme config and logo, with no changes to individual screens.

**Default SFSU theme:**
| Element | Value |
|---------|-------|
| Primary color | `#442C8B` (Core Purple) |
| Accent color | `#DCAE27` (Core Gold) |
| Background | White |

---

## Prompt Evolution Summary
The prompt went through multiple iterations:

1. **Initial draft** — Joe's starting point, solid but missing several key areas
2. **Expanded draft** — Claude added resource flexibility, Dataverse, approval workflow, waitlisting, recurring reservations, conflict detection, maintenance windows, notifications, reporting, Entra ID SSO, WCAG accessibility
3. **Simplified for v1** — Removed approval workflow and waitlisting; clarified permission model (vetting is external, booking is immediate)
4. **User management added** — Add/edit/disable users; no delete; orphaned reservation rationale stated explicitly
5. **Centralized theming added** — White-labeling rationale for multi-unit duplication
6. **Access gate added** — Modal on launch; SF State ID check; no content visible behind modal
7. **SF State ID as primary key** — Immutable identifier for all permissions; email/display name for display only; stated in three sections of the prompt
8. **Profile photo performance** — App.OnStart caching for header; Concurrent() + local collection for gallery; pagination for large lists

---

## Realistic Expectations for Vibe Coding Output
Claude's assessment of what Power Apps vibe coding will likely handle well vs. struggle with:

**Likely to work well:**
- Dataverse table scaffolding
- Basic calendar UI and forms
- Office365Users connector integration
- Branding/theming
- Basic role checking logic

**Likely to need hand-tuning:**
- Conflict detection across recurring reservations
- Flexible resource attribute schema
- Reporting and dashboards (may require Power BI)
- Photo performance patterns if AI defaults to naive per-row lookups

**Realistic outcome:** A functional skeleton covering roughly 40–60% of the spec — a strong prototype, not a production system. The detailed prompt should meaningfully improve output quality over a vague prompt.

---

## Intended Workflow
Joe plans to use the **Claude browser extension** during Power Apps vibe coding sessions for real-time guidance — reviewing generated schemas, formulas, and design decisions inline without context-switching. The project summary MD file is intended as context to share with the extension during those sessions.

---

## Output Files
- `sfsu_reservation_system_summary.md` — Structured summary of the final prompt, for use with the Claude browser extension during vibe coding
- `sfsu_reservation_system_chat_summary.md` — This file; full summary of the chat including design decisions and rationale
