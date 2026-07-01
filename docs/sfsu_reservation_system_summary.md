# SFSU Resource Reservation System — Project Summary

## Overview
A Power Apps-based online resource reservation system for San Francisco State University (SFSU), modeled after LibreBooking. Designed to handle diverse resource types (rooms, scientific equipment, vehicles, boats, field gear) in a single unified platform. Backend is Microsoft Dataverse. No existing data backend — one will be built from scratch.

---

## Data Backend
- **Platform:** Microsoft Dataverse
- Resource schema must be flexible enough to support type-specific attributes (e.g., room capacity, boat captain-required flag, vehicle license class requirement)
- Attributes must be configurable per resource type without code changes

---

## Calendar Interface
- Default view: calendar with day/week/month toggle
- Users see only resources they have permission to access
- New reservations initiated by clicking a time slot
- **Conflict detection** — double-booking must be prevented
- **Recurring reservations** supported (daily, weekly, monthly) with per-occurrence exception handling

---

## Roles and Permissions
- Access control is **group-based**, scoped per resource or resource type
- Users are vetted and granted access **externally by an Admin** — there is no in-app approval workflow
- Booking is **immediate** upon submission for any permitted resource
- **All permissions checking must use SF State ID as the sole authoritative identifier** — email and display name are mutable and must never be used for access control

### Roles
| Role | Capabilities |
|------|-------------|
| **Admin** | Full access; manage resources, users, groups, blackout windows, reports; create/edit/delete any reservation |
| **User** | Create, view, edit, cancel own reservations for permitted resources |
| **Viewer** | Read-only calendar access for permitted resources |

---

## User Identity
- Integrated with **Office365Users connector**
- Each user record stores:
  - **SF State ID** — first 9 characters of UserPrincipalName — **primary key, used for all permissions checks**
  - Display Name (Office365Users DisplayName) — display only
  - Email Address (Office365Users Mail) — display only
- Authentication via **SFSU Azure AD / Entra ID SSO** — no separate login step

---

## Access Gate
- On launch, app extracts SF State ID from the authenticated user's UPN
- Checks Users table: ID must exist **and** account must not be disabled
- If check fails: modal dialog appears informing user they lack access and who to contact
- **No app content, navigation, or calendar data is visible behind the modal**
- Gate fires **before any other content loads**

---

## User Profile Photos and Header
- On `App.OnStart`, fetch logged-in user's **photo and DisplayName once** via Office365Users and store in session-scoped global variables
- Every screen displays photo and DisplayName in a **fixed header/title bar** referencing these variables
- Photo/name lookups must **not** repeat on screen navigation

### Admin Users Screen Photos
- On screen load, fetch all user photos **in parallel using `Concurrent()`**
- Store results in a local collection keyed by SF State ID
- Gallery binds to this collection — **no per-row connector calls**
- Display a loading indicator while fetching
- Implement **pagination** for large user lists; fetch photos only for the visible page

---

## User Management
- Admins can **add, edit, and disable** users
- **No delete option** — deleting users would orphan reservation history
- Disabled users: blocked from login and new reservations; all past reservations preserved
- Disabled users' reservations remain visible in calendar and reports with a clear inactive indicator

---

## Maintenance and Blackout Windows
- Admins can block any resource for any reason (maintenance, cleaning, etc.)
- Reason field is required
- Blocked windows are **visually distinct** on the calendar
- No new reservations can be created during a blocked window

---

## Notifications
Automated email notifications via Office 365 for:
- Reservation confirmation
- Reservation cancellation
- Upcoming reservation reminders (configurable lead time per resource type)

---

## Reporting
- Filterable by: user, resource, resource type, date range
- Exportable to **Excel**
- Dashboard with at-a-glance metrics: most-used resources, peak booking times

---

## Theming and White-Labeling
- All theming values (colors, fonts, sizes, border radius, logo) defined in a **single centralized location** — Dataverse Themes table, named formula, or settings screen
- **No hardcoded style values** on individual screens or controls
- All UI elements reference central theme values
- Designed for duplication: rebranding for another university unit requires only updating the central theme config and logo

### Default SFSU Theme
| Element | Value |
|---------|-------|
| Primary color | `#442C8B` (Core Purple) |
| Accent color | `#DCAE27` (Core Gold) |
| Background | White |

---

## UI and Accessibility
- Fully **mobile-responsive**
- **WCAG 2.1 AA** compliant

---

## Feedback and Error Handling
- Clear success and error feedback on all user actions
- Input validation before submission
- Conflicts and permission errors surfaced with plain-language explanations

---

## Documentation to Generate
- Dataverse table structure and relationships
- Role and group configuration guide
- Resource catalog setup guide
- Office365Users and Entra ID SSO integration steps
- End-user guide: browsing resources, making reservations, managing bookings

---

## General Guidance to AI
Do not assume these instructions represent the optimal approach. If a better way exists for any requirement — data modeling, UX flow, or technical implementation — propose it and offer the choice between approaches.
