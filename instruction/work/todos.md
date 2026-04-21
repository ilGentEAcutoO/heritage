# Active Tasks

> Last updated: 2026-04-21 10:40 (+07)

No active feature work. Prior session archived at
`instruction/archive/02-security-remediation-login-removal/`.

## Housekeeping done this session (2026-04-21)

- Removed 5 orphan PNG screenshots from repo root (`ft-0{1..3}-*.png`,
  `heritage-{demo,prod}-verified.png`) — leftover artifacts from archived
  security-remediation session, no live references.
- Cleaned stale `.playwright-mcp/` logs + `.DS_Store`.
- Created `./agent-temp/` as the single sanctioned scratch directory
  (gitignored with `.gitkeep` preserved).
- Added **Global Rule #8 — Agent Temp Files** to `CLAUDE.md`: all agent
  scratch output must live under `./agent-temp/` and be removed before
  task end.
- Saved feedback to project memory (`feedback_agent_temp_files.md`).

Start a new session with `/workflow-plan` (for a new feature/task) or
`/workflow-todo` (to resume an in-flight plan if one exists).
