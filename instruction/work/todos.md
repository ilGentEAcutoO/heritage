# Active Tasks

> Last updated: 2026-04-21 13:33 (+07)

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

## CI repair (2026-04-21) — green again ✅

- **Fix 1** `tests/unit/useTweaks.test.ts`: replaced hardcoded absolute
  dev path with `new URL('../../src/app/hooks/useTweaks.ts', import.meta.url)`
  so the source-scanning tests work on any machine (dev laptop + CI runner).
- **Fix 2** `scripts/seed-demo.ts`: wrapped top-level side effects
  (assertRemoteConsent call, mkdirSync, writeFileSync, `execFileSync wrangler
  d1 execute`) in `async function main()`, guarded by
  `fileURLToPath(import.meta.url) === resolve(process.argv[1])`.
  Before: every `import { assertRemoteConsent }` from the guard test
  triggered wrangler d1 execute, blowing up on CI (no worker env) and
  silently polluting local D1 on dev boxes. After: main runs only under
  CLI invocation; imports are pure.
- Local `pnpm typecheck` + `pnpm test` (13 files, 161 tests) both green.
- **Fix 3** `worker-configuration.d.ts`: cleaned local `.dev.vars` to match
  `.dev.vars.example` (APP_URL only) and regenerated with `pnpm cf-typegen`.
  The Env interface had been carrying `SESSION_SECRET`, `R2_ACCOUNT_ID`,
  `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `EMAIL_DEV_STUB` as stale
  drift from the pre-login-removal state — CI's "Block stale secret/binding
  names" gate correctly caught it. Remote `SESSION_SECRET` secret is
  preserved (cleanup of remote is a separate prod decision).
- **Final CI run (`24707531734`): all steps green, 26s.** ✅
- **Remote secret cleanup**: ran `pnpm wrangler secret delete SESSION_SECRET`
  to retire the dead auth secret from the `heritage-worker-api` Worker.
  `wrangler secret list` now returns `[]`; `https://heritage.jairukchan.com/`
  still returns HTTP 200 (smoke check). Worker Env surface now matches
  deployed binding set 1:1.

Start a new session with `/workflow-plan` (for a new feature/task) or
`/workflow-todo` (to resume an in-flight plan if one exists).
