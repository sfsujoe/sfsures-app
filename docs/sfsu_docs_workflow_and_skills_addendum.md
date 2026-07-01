# SFSU Reservation System -- Runbook Addendum: Documentation Workflow + Session Skills

**Date:** 2026-07-01
**Phase:** Documentation workflow setup
**Scope:** Records the local documentation index and the personal Codex skills created to make future SFSURES chats start and end with the right project context.

## Headline Outcomes

1. `docs/README.md` now exists as the documentation index and onboarding map for the project.
2. A personal startup skill, `$sfsures-start-chat`, was created so a new chat can load project context before work begins.
3. A personal closeout skill, `$sfsures-docs-closeout`, was created so a session can write a concise addendum and update the docs index before the chat ends.
4. Both skills were validated with the Codex skill validator after installing/fixing the missing `PyYAML` dependency.

## What Changed

### Documentation index

`docs/README.md` was created as the front door for future local reference sessions. It includes:

- project description and repository shape
- recommended reading order
- index of every Markdown doc under `docs/`
- Dataverse schema documentation section
- architecture and decision-history section
- security notes and known risks
- current MVP status vs future production work
- gaps, TODOs, and open questions

This file should stay concise. Detailed history belongs in dated/topic addenda, then the README gets updated as the index.

### Personal Codex skills

Two personal skills were created under `C:\Users\909272551\.codex\skills`:

| Skill | Invocation | Purpose |
|---|---|---|
| `sfsures-start-chat` | `$sfsures-start-chat go` | At the beginning of a new chat, read `docs/README.md`, load canonical project context, summarize current state, remind Joe of likely next steps, and ask whether to continue there or work on something else. |
| `sfsures-docs-closeout` | `$sfsures-docs-closeout go` | At the end of a session, create a concise addendum under `docs/`, update `docs/README.md` only where needed, check README Markdown links, and report open items. |

These are personal Codex skills, not app source code and not part of the repo unless copied in later.

## Decisions / Rationale

- Use skills instead of relying on memory or repeated prompts. The project has enough decision history that "remember to read the right docs" should be procedural, not manual.
- Use `docs/README.md` as the map, not the archive. This prevents the index from becoming too long to serve as onboarding.
- Use addenda for durable history. They keep decision rationale discoverable without forcing every future session to ingest every old document.
- Keep startup read-only. `$sfsures-start-chat go` should orient and ask for direction before changing files.
- Keep closeout documentation-only. `$sfsures-docs-closeout go` should not modify app source code.

## Current Status

The intended session workflow is now:

1. Start a new SFSURES chat with `$sfsures-start-chat go`.
2. Choose whether to continue from the documented next steps or redirect to a different task.
3. Do the work.
4. End the session with `$sfsures-docs-closeout go`.

If a skill was created during an already-open chat, it may not appear in that chat's loaded skill list until a future session. In that case, link directly to the skill's `SKILL.md` or ask Codex to follow the same workflow manually.

## Still Open / Carry Forward

1. Decide whether to add a repo-local `AGENTS.md` or `CLAUDE.md` later. For now, the personal startup skill plus `docs/README.md` covers the need.
2. Personal skills live outside the repo. If another machine or user needs the same workflow, copy or recreate the skills there.
3. Keep watching `docs/README.md` length. If the process section grows, move details into another addendum and keep only the command summary in the README.
4. Existing project work remains unchanged: recurrence, resource group-scoping, admin screens, reports, accessibility verification, environment provisioning, Booker inheritance testing, and security hardening are still future production work.

## How to Resume

Open a new chat with:

```text
$sfsures-start-chat go
```

Before closing a work session, use:

```text
$sfsures-docs-closeout go
```

For project context, start from [README.md](README.md).
