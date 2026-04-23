# Requirements — Security remediation + dependency audit

> Captured: 2026-04-23 12:02 (+07)
> Source: user command `/workflow-plan fix all @instruction/security-review.md and all npm audit`
> Supersedes prior requirements doc (Phases 0–5 "Re-introduce Login + Fix Demo Tree Performance" all shipped 2026-04-23)

---

## Inputs

- **Security review:** `instruction/security-review.md` (audit of commit `997e845`)
- **Audit tool:** `pnpm audit` (project uses pnpm, not npm)

## Current state (verified 2026-04-23 12:02)

- `pnpm audit --json` → **0 vulnerabilities** across 271 deps (info 0 / low 0 / moderate 0 / high 0 / critical 0).
  - The "fix all npm audit" line is therefore a **no-op** for today. Plan must preserve this green state; any dep change we make must re-run `pnpm audit` to confirm.
- `pnpm outdated` — 14 patch/minor/major updates available. None are security-driven per the audit; **not in scope** unless user explicitly asks. Major bumps (React 18→19, Zod 3→4, TypeScript 5→6) are deferred.
- `instruction/security-review.md` — **1 HIGH finding** (H1: img.ts `is_public` IDOR) + **2 P1 follow-ups** (invariant test, `CHECK` constraint) + **3 P2 backlog** items (session-cleanup cron, DO rate-limiter, cache-key narrowing).

## Scope to fix

Everything in the security review's checklist — P0 + P1 + P2 — interpreted as "fix all":

### P0 (must)
1. **H1** — Rewrite `src/worker/routes/img.ts:175-186` so the access gate calls `canAccessTree(visibility)` instead of reading `is_public`. Cover the three visibility states (public anonymous-OK, private owner-only, shared owner-or-accepted-share).
2. Drop the deprecated `is_public` column via migration `0003_drop_is_public.sql` once no reader references it.
3. Remove `isPublic` from `TreeMeta` (`src/worker/lib/tree-query.ts`) and from `ApiTreeResponse` (`src/app/lib/api.ts`) — canonical field on client is `visibility`.

### P1 (next sprint, bundled here per "fix all")
4. Integration test that asserts the is_public/visibility invariant can't regress — any future reintroduction of a dual-column boolean authz check must fail CI.
5. SQLite `CHECK` constraint on `trees.visibility` (and other enum columns: `role`, `status`, `kind`, `gender`) so direct `wrangler d1 execute` writes with invalid enum are rejected at the DB boundary.

### P2 (backlog, bundled here per "fix all")
6. Wire `deleteExpiredSessions` to a Cloudflare scheduled (cron) trigger so session IP/UA PII is purged on schedule. Start hourly.
7. Narrow the `/api/tree/:slug` cache-key policy so query-string variants cannot survive a `purgeTreeCache` call. Proposed default: strip the search component at cache-write and cache-read time (simpler than iterating variants at purge time).
8. Durable Object rate-limiter (for true atomic increments on img route) — **defer** unless user opts in. Current KV-based limiter has a documented tolerated race; moving to DO is a bigger refactor and a stand-alone planning unit.

### Not in scope (explicit)
- Dependency major bumps (React 18→19, Zod 3→4, TypeScript 5→6) — need their own plan.
- New feature work, UI changes (beyond type shape cleanup).
- Rewriting the existing auth flow — it's clean per the audit.

## Open decisions (defaults flagged, user can override)

| # | Decision | Default | Alternative |
|---|----------|---------|-------------|
| D1 | Drop `is_public` column immediately or keep one release cycle? | **Keep one cycle**: ship the img-route fix first (P0 step 1), deploy, then drop the column in a follow-up migration. Safer rollback path if the new gate breaks. | Drop in the same PR after the fix lands. |
| D2 | Add `CHECK` constraints for all enums or just `visibility`? | **All enums** (`visibility`, `role`, `status`, `kind`, `gender`) — consistent, cheap. | Visibility only (minimal change). |
| D3 | Cron cadence for `deleteExpiredSessions`? | **Hourly** (`0 * * * *`) — low cost, matches comment in `lib/session-cleanup.ts`. | Daily (`0 2 * * *`) — cheaper, sessions live 14d anyway. |
| D4 | Cache-key narrowing approach? | **Strip `search` at cache read + write** in `tree.ts` — keeps `purgeTreeCache` trivial and closes the variant-survival gap. | Leave cache as-is, narrow the exploit with smaller `max-age`. |
| D5 | Durable Object rate-limiter? | **Defer** — documented race is accepted, DO refactor warrants its own plan. | Include in this workstream (larger scope, more risk). |
| D6 | Patch-level dep bumps? | **Include** (low risk, good hygiene): `@vitest/ui`, `react-router-dom`, `vite`, `vitest`, `@cloudflare/vite-plugin`, `@cloudflare/workers-types`, `wrangler`. | Skip (strictly respect "audit shows 0 — no action"). |
| D7 | How do migrations reach prod? | **User-gated**: agent generates migration, user runs `pnpm db:migrate:remote` manually after review. | Agent runs via `wrangler d1 migrations apply --remote` with explicit confirmation. |

## Constraints (from CLAUDE.md)

- No AI signature on git commits (`git-commit` skill rule).
- Cloudflare resource names must be prefixed with project name (applies if we add new ones — cron trigger doesn't create a CF resource, so no new naming work).
- Intermediate / scratch files go in `./agent-temp/`, deleted before end of task.
- `./instruction/work/` is the active work dir.
- Every sub-agent task must have exclusive file locks in `todos.md`.

## Acceptance criteria

- `pnpm test` → 355+ tests green (new regression tests added on top of current count).
- `pnpm typecheck` → clean.
- `pnpm e2e` → 18/18 green on the target prod deployment after fix ships.
- `pnpm audit` → 0 vulnerabilities (preserved).
- `instruction/security-review.md` — every check-box in §"Prioritised action checklist" flipped to ✅ (including P2).
- Post-deploy smoke: `curl -i https://heritage.jairukchan.com/api/img/photos/<seeded-public-tree>/<person>/<ULID>.jpg` returns 200; `curl` against a seeded private tree returns 403.
- Cloudflare dashboard: cron trigger visible and fired at least once.

## Rollback plan

- The img-route fix is a single file change — revert the commit to roll back.
- Migration 0003 (drop `is_public`) is **not reversible** in SQLite without a table rebuild. Deploy only after the img-route fix has been observed healthy in prod for 24 hours. Keep a manual snapshot of the `trees` table before running.
- CHECK-constraint migration is reversible via a table rebuild; still recommend the 24-hour wait.
- Cron trigger rollback: remove the `crons` entry from `wrangler.jsonc` and redeploy.
