# SFSU Reservation System — Vibe Coding Session Notes

## Overview
Joe (SFSU Procurement) is planning to use Microsoft Power Apps vibe coding (currently in preview) to build the SFSU resource reservation system. This document summarizes the preparation work and practical considerations discussed before the first vibe coding session.

---

## Prompting Strategy

### Gemini's Suggestion vs. Power Apps Vibe Reality
Gemini suggested chunking the build — starting with Dataverse tables only. This is sound general vibe coding advice, but Power Apps vibe is specifically designed to generate plans, data models, and apps together in a single unified session.

### Recommended Approach
1. **Feed the full prompt in one shot** — let it generate the plan, Dataverse schema, and app skeleton together as intended
2. **Stop and validate the data model before publishing** — Dataverse tables are generated as drafts first; review every table, relationship, and field before publishing, since the app is built on top of them and schema changes later are painful
3. **Iterate screen by screen after the data model is solid** — use follow-up prompts to refine individual screens rather than regenerating everything

### Why the Data Model Is the Critical Checkpoint
The flexible resource attribute schema (supporting rooms, boats, trucks, lab equipment in one platform) is the hardest part of the spec. If the AI produces a rigid flat schema, that must be caught and corrected before the app is built on top of it.

---

## Environment Prerequisites

### Two Toggles Required (Both Need Admin Access)

**Tenant-level — Power Platform Admin Center > Settings > Tenant Settings:**
- Enable: *Copilot in Power Apps (preview)*

**Environment-level — Power Platform Admin Center > Manage > Environments > [environment] > Settings > Features:**
- Enable: *Power Apps code apps*
- Enable: *Enable External Models*

### Additional Requirements
- Must use a **non-default environment** — vibe coding is not available in default environments
- Environment must be in an **eligible region**: US, Australia, Asia, or India (SFSU should be fine as a US institution)

---

## Admin Access Situation
Joe does not have Power Platform admin access. Getting admin attention can be challenging. 

### Mitigation: Start with a Test App
Rather than waiting on admin escalation, Joe plans to run a small test vibe coding session first. Goals:
- Determine what is already enabled in the current environment
- Learn the vibe coding interface on something low-stakes
- If blocked, the specific error message will make the admin request much more concrete and actionable

### Suggested Test Prompt Characteristics
- Single Dataverse table
- Basic form and gallery view
- Something structurally similar to the real project (e.g., simple equipment checkout tracker or room sign-in log)
- Simple enough that failure is easy to interpret

### What to Observe During the Test
- Does it generate Dataverse tables or fall back to another data source?
- Does it produce a code app (TypeScript) or a canvas app?
- How does iterative prompting feel — can you redirect it mid-session?
- Does the Claude browser extension integrate smoothly?

---

## Planned Workflow for Real Sessions
Joe plans to use the **Claude browser extension** during vibe coding sessions for real-time guidance — reviewing generated schemas, formulas, and design decisions without context-switching out of Power Apps.

### Recommended Use of Claude During Sessions
- Paste generated Dataverse schemas for review before accepting
- Flag any deviations from the spec (e.g., hardcoded theme values, email used instead of SF State ID for permissions)
- Get second opinions on architectural decisions the AI makes early in the session
- Reference the prompt and chat summary MD files for context

---

## Reference Files
- `sfsu_reservation_system_summary.md` — Structured summary of the full vibe coding prompt
- `sfsu_reservation_system_chat_summary.md` — Full chat summary including design decisions and rationale
- `sfsu_vibe_coding_session_notes.md` — This file
