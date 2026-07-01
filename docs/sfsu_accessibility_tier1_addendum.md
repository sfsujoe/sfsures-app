# SFSU Reservation System — Accessibility (Tier 1) & UI-Polish Addendum

**Date:** 2026-06-30
**Scope:** First accessibility pass (WCAG 2.1 AA, ahead of DPRC vetting). Tier 1 of a
three-tier plan landed in full, plus the focus-indicator, toolbar-clipping, prev/next
chevron, and native date-picker items that surfaced while verifying it. `CLAUDE.md` and
the build sheet remain live truth; this is an accurate-as-of-date snapshot.

---

## Accessibility plan — the tiering (for continuity)

Sorted by "is a keyboard/AT user structurally blocked" vs. "DPRC flags it but nobody is
blocked." Load-bearing fact that shaped everything: **FullCalendar's drag-to-select has no
keyboard equivalent** — so the booking-*creation* path must be an equivalent control, not the
grid. (Confirmed against FC docs: events can be made tabbable, but range selection to start a
booking is a mouse/touch gesture only.)

- **Tier 1 (structural blockers) — DONE this session:** keyboard path to create a booking;
  focus trap + restore in modals; live-region announcement of booking status.
- **Tier 2 (conformance, not blockers) — queued:** color-only event encoding (1.4.1) needs a
  non-color signal + per-event `aria-label`; palette contrast bake-in (Gold rule below); form
  semantics already mostly present; dialog naming (done early as a freebie).
- **Tier 3 (sweep):** `listWeek` SR-friendly view; skip-to-content; focus-visible coverage
  audit; reflow/resize at 320px & 200% inside the iframe.

---

## What shipped (code)

### New — `src/a11y/useFocusTrap.ts`
Reusable hook. Traps Tab inside a container while `active`, moves focus in on open, restores
focus to the triggering element on close. Built once; reused by both dialogs and any future
modal (Theme screen, user management).

- **Initial-focus default:** first focusable element. (Optional: change the one line to
  `container.focus()` to announce the dialog name and land first Tab on the first field — the
  `tabIndex={-1}` on the dialog cards supports either.)
- **Robustness:** uses `getClientRects().length` (not `offsetParent`) to filter visible
  focusables, because `offsetParent` is `null` on `position: fixed` modals.

⚠ **TS build-error fix (do not re-derive):** signature must be generic over a **nullable** ref:
```ts
export function useFocusTrap<T extends HTMLElement>(
  containerRef: RefObject<T | null>,
  active: boolean,
): void
```
Modern `@types/react` types `useRef<HTMLDivElement>(null)` as `RefObject<HTMLDivElement | null>`.
A non-nullable `RefObject<HTMLElement>` parameter throws
*"Type 'null' is not assignable to type 'HTMLElement'."* The generic infers `T` from each call
site exactly and clears it on both `BookingModal` and `CalendarScreen`.

### `BookingModal.tsx` (+ `.module.css`)
- Focus trap wired to the dialog card via `dialogRef` + `useFocusTrap(dialogRef, true)`
  (modal mounts only when open → always active while mounted).
- `role="dialog"` / `aria-modal` **moved off the backdrop onto the card** (backdrop is now a
  plain click-to-close overlay). Card gains `aria-labelledby="booking-modal-title"` (names the
  dialog by its visible `<h2>` — clears 4.1.2) and `tabIndex={-1}`.
- **Status announcement:** an always-mounted, visually hidden `role="alert"`
  `aria-live="assertive"` region mirrors `error`. The existing **visual banner is unchanged**
  and left navigable so SR users still reach the conflict list for detail.
- **Success is *not* announced here** — the modal unmounts on success, so its live region can't
  fire reliably. Success is announced from `CalendarScreen` instead (below).
- New `.srOnly` class (absolute/clip technique; `position: absolute` keeps it out of the body
  flex flow → zero layout footprint when idle).
- **Modal width 440 → 500px** (Joe). At 440px the two-column datetime inputs overflowed — that
  overflow is also what hid the date-picker indicator (see Date picker below).

### `CalendarScreen.tsx` (+ `.module.css`)
- **Keyboard booking path:** "New booking" injected via FullCalendar `customButtons`, placed
  `left: 'newBooking prev,next today'`. Click opens `BookingModal` with `nextHourSlot()`
  (next top of the hour, 1h long) — **no calendar selection required**, which is exactly the
  keyboard/AT user's situation. This is the WCAG 2.1.1 equivalent path; do **not** try to make
  the grid the keyboard creation surface.
- **Success live region:** page-level, visually hidden `role="status"` `aria-live="polite"`
  region + `announce()` helper. `onBooked` now calls `announce('Booking confirmed.')` after
  refresh. `announce()` does **clear-then-set on a later tick** so two identical confirmations
  in a row still register as a content change and re-announce.
- **Event-detail popover** given the same dialog treatment (it *is* a modal): `role`/`aria-modal`
  moved onto the card, `useFocusTrap(popoverRef, !!selectedEvent)`, `aria-labelledby` →
  `#event-popover-title` (id added to **both** branch headings; one renders at a time),
  `tabIndex={-1}`.
- **Chevron fix:** `buttonIcons={false}` + `buttonText` `prev: '❮'` / `next: '❯'` (see CSP note).
- New `.srOnly` class (separate CSS module → needs its own copy).

### `App.css` — keyboard focus ring (WCAG 2.4.7 / 1.4.11)
Replaced the prior weak `:focus-visible` block with an element-list rule **plus** an
`.fc .fc-button:focus-visible` override (FC ships its own focus CSS at higher specificity; a
bare `:focus-visible` loses to it — that's why only calendar events reacted before). `outline`
(not box-shadow) is primary so it survives Windows High Contrast / forced-colors.
`outline-offset` is load-bearing: it pushes the ring off the purple-on-purple **Book** button
onto the white footer, where it's visible.

---

## Decisions (locked)

### Focus ring stays **Core Purple** — Gold rejected on contrast
Focus-indicator contrast is governed by **1.4.11 Non-text Contrast (AA, 3:1)**, *not* 2.4.7
(which only requires the indicator be visible). Computed:

| Color on white | Ratio | 1.4.11 (≥3:1) |
|---|---|---|
| Core Purple `#442C8B` | ~10.6:1 | ✅ pass |
| Core Gold `#DCAE27` | ~2.07:1 | ❌ fail |

A plain gold ring on the white toolbar fails. **On the shelf** if the gold *look* is ever wanted
without losing compliance: two-tone ring — gold outline + a Core-Purple `box-shadow` on the
**outer** edge (so the boundary against white is the 10.6:1 purple). Same thickness, both brand
colors, forced-colors-safe (outline survives, OS recolors it). Not adopted; purple kept.

### Keyboard booking path = `customButtons`, not the grid
FC grid select is mouse/touch only. The "New booking" button + default slot is the accessible
equivalent. Locked.

### Logo stays the `sfsures_appsettings` Box **Text URL** — SVG bundling declined
Considered bundling an `.svg` as a Vite asset. Declined: it moves the logo from **data → code**,
which reverses the locked "logo varies per department → lives in data; rebrand = edit one row,
no redeploy" decision. Kept as-is. (If ever revisited: bundle only as a *default/fallback*,
never persist the content-hashed asset URL into Dataverse, and watch the `img-src data:` CSP
note below.)

---

## Gotchas resolved / learnings (do not re-derive)

### ⚠ Power Apps iframe CSP: blocks `data:` **fonts**, allows `data:` **images**
The unifying explanation for two separate symptoms this session:
- **prev/next rendered as empty boxes (tofu):** FC ships its chevron glyphs as a base64 `data:`
  webfont; the iframe CSP blocks it under **`font-src`**. Fix = don't use the font:
  `buttonIcons={false}` → falls back to `buttonText` (`❮`/`❯`, U+276E/276F, drawn in the system
  font). Bonus a11y win — FC keeps its own accessible name on the buttons, and a real glyph beats
  an icon-font character some SRs skip.
- **the `.select` dropdown arrow and the date-picker glyph render fine:** both are `data:` **SVG
  images** under **`img-src`**, which the CSP **allows**.

Rule going forward: in this iframe, `data:` **images are fine**, `data:` **fonts are not**.
Reach for inline-SVG backgrounds, never an icon webfont.

### FullCalendar overrides need descendant specificity
FC's own button/event focus CSS sits around (0,3,0). A bare pseudo-class rule loses. Use
`.fc .fc-button:focus-visible` (and `.fc .fc-prev-button` / `.fc-next-button` for glyph sizing).
These are FC's global classes — they will **not** match from inside a CSS module (names get
hashed); put them in `App.css` or use `:global(...)`.

### Live-region rules
- **Always-mounted**, never conditionally rendered — an SR only announces a region that was in
  the DOM when its text changed.
- **Assertive** (`role="alert"`) for errors/conflicts; **polite** (`role="status"`) for success.
- **Clear-then-set on a later tick** to re-announce identical repeat messages.
- The announcing region must live on a surface that **survives the trigger's unmount** (success
  belongs to `CalendarScreen`, not `BookingModal`).

### "Tabbable but invisible" = overflow-clipped, not missing
Two instances, same root cause — element is in the DOM (so Tab reaches it) but painted in a
clipped/overflowed zone:
- **Focus ring clipped at the New booking button's top-left:** ancestor `overflow: hidden` on
  the calendar wrapper. Fix = `padding: 6px` on `.calendarWrap` (gives the ring room *inside* the
  clip boundary regardless of overflow). The earlier `.fc .fc-header-toolbar` padding attempt was
  **reverted** — the clip was upstream of the toolbar.
- **Date-picker indicator unreachable by mouse:** the datetime inputs overflowed at 440px; the
  indicator rendered in the clipped zone. Widening the modal to 500px brought it back.

### Native datetime picker works in the iframe; surface its indicator deliberately
`<input type="datetime-local">`'s Chromium calendar-picker works in the Power Apps iframe (no JS
needed). But once `::-webkit-calendar-picker-indicator` is custom-sized, the **default glyph
renders faint/invisible** — supply your own `data:` SVG glyph (Core Purple `%23442C8B`, ~10.6:1
on white) so it's reliably visible; purple hover tint on top. `%23666` variant matches the
`.select` chevron if a muted look is preferred. Bigger-affordance alternative (`input.showPicker()`
on a labeled `<button>`) is **untested in the iframe** — needs a user gesture + try/catch — so it's
deferred; the CSS-glyph approach has no such risk.

---

## Still open / carry forward

1. **Tier 1 verification — partial.** Tabbing/trap reachability confirmed (the picker was found
   while tabbing the modal). **Still to confirm with a screenshot/SR run:** focus cannot escape
   either dialog to the calendar behind it; Escape restores focus to the trigger; VoiceOver
   announces the **conflict** (assertive) and **"Booking confirmed"** (polite) without focus moving.
2. **Booker User-level inheritance test** still deferred (needs Scott's non-admin identity; Joe's
   sysadmin role masks the 403) — unchanged from prior addenda, flagged here for continuity.
3. **Tier 2** queued (color-only event encoding + per-event `aria-label`; palette/contrast
   bake-in; `listWeek` toggle is Tier 3).
4. **On the shelf:** compliant gold two-tone ring; `showPicker()` labeled-button picker.
