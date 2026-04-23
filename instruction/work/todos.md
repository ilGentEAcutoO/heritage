# Active Tasks

> Last updated: 2026-04-23 13:50 (+07)

## Current phase: **S1–S6 ✅ tested; S7 partially done (code ready; deploy + remote-migration + cron-visibility = user action)**

User approved defaults D1–D7 via `/workflow-work` invocation (2026-04-23 12:15).

**Migration numbering correction:** existing migrations stop at 0002. Plan originally cited 0004/0005 — real next numbers are **0003** (is_public drop, drizzle-generated) and **0004** (CHECK constraints, hand-written).

Plan ref: `instruction/work/plan.md` § Phases S1–S7
Requirements ref: `instruction/work/requirements.md`

Prior phases 0–5 (Re-introduce Auth + Sharing + Perf) all DONE — live at `heritage.jairukchan.com`. Archive-on-approval.

---

## TASK-S1 — Fix H1: img route uses `canAccessTree` (P0-critical)

- Status: ✅ tested (agent-s1, Sonnet 4.6, finished 2026-04-23 12:30)
- Verified: 363/363 tests passed (was 355 → +8 new). typecheck clean. 2 cosmetic comment fixes applied by main agent.
- Model: Sonnet 4.6
- Dependencies: —
- Files (exclusive lock):
  - `src/worker/routes/img.ts` (modify)
  - `tests/integration/img-read.test.ts` (extend)
  - `tests/helpers/fixtures.ts` (extend — add `seedPrivateTree`, `seedSharedTree`)
- Sub-tasks:
  - [ ] RED: add tests S1-T1..T8 (see plan § S1)
  - [ ] Confirm S1-T1 fails on current `main`
  - [ ] GREEN: modify `img.ts` to call `canAccessTree(visibility)`
  - [ ] Confirm all 8 tests green
  - [ ] `pnpm typecheck` clean
  - [ ] Emit `Cache-Control: private, max-age=60, must-revalidate` for non-public responses
- Acceptance: 8/8 new tests pass, full suite still green, typecheck clean.

---

## TASK-S2 — Drop `is_public` column + client surface cleanup (P0-cleanup)

- Status: ✅ tested (agent-s2, Sonnet 4.6, finished 2026-04-23 13:37; migration apply gated on user approval)
- Verified: migration `0003_blushing_ender_wiggin.sql` uses direct `ALTER TABLE ... DROP COLUMN` (SQLite 3.35+ / D1-supported); `grep is_public src/` empty; `pnpm test` 371/371; `pnpm typecheck` clean.
- **Post-S2 REMOTE migration NOT yet applied** — user-gated per D7. After S1+S2 land in prod and soak 24h, user runs `pnpm db:migrate:remote`.
- Model: Sonnet 4.6
- Dependencies: TASK-S1 GREEN (but can draft in parallel, apply after)
- Files (exclusive lock):
  - `src/db/schema.ts` (modify)
  - `src/worker/lib/tree-query.ts` (modify)
  - `src/worker/lib/seed.ts` (modify)
  - `src/app/lib/api.ts` (modify)
  - `src/app/lib/types.ts` (modify)
  - `scripts/seed-demo.ts` (modify)
  - `drizzle/seed.sql` (regenerate)
  - `drizzle/migrations/0004_*.sql` (create — via `pnpm db:generate`)
  - `tests/integration/tree-read.test.ts` (assertion update)
  - `tests/unit/schema-roundtrip.test.ts` (assertion update)
  - `tests/helpers/fixtures.ts` (remove `is_public` uses)
- Sub-tasks:
  - [ ] Remove `is_public` from drizzle schema
  - [ ] `pnpm db:generate` → migration 0004
  - [ ] Hand-review migration (SQLite table rebuild is expected)
  - [ ] Remove `isPublic` from `TreeMeta`, `ApiTreeResponse`, seed scripts
  - [ ] Update tests S2-T1..T4
  - [ ] `pnpm db:migrate:local` applies cleanly
  - [ ] `pnpm typecheck` + `pnpm test` green
  - [ ] **USER GATE:** wait for approval to run `pnpm db:migrate:remote`
- Acceptance: grep `is_public` across `src/` returns 0 hits; migration applies locally + remotely; full suite green.

---

## TASK-S3 — DB CHECK constraints on enum columns (P1)

- Status: ✅ tested (agent-s3, Sonnet 4.6, finished 2026-04-23 13:50)
- Verified: migration `0004_enum_check_constraints.sql` applied locally (64 statements); 8/8 S3 tests pass; `pnpm test` 379/379; `pnpm typecheck` clean.
- **Post-S3 REMOTE migration NOT yet applied** — user-gated per D7.
- Model: Sonnet 4.6
- Dependencies: TASK-S1 GREEN; can run parallel with S4, S5
- Files (exclusive lock):
  - `drizzle/migrations/0004_enum_check_constraints.sql` (created — hand-written)
  - `tests/integration/schema-check-constraints.test.ts` (created — 8 tests)
- Sub-tasks:
  - [x] Hand-write migration: rebuild `trees`, `tree_members`, `tree_shares`, `relations`, `people`, `auth_tokens` with CHECK constraints
  - [x] Write RED tests S3-T1..T8
  - [x] Confirm RED tests fail before migration (7/8 failed — expected)
  - [x] `pnpm db:migrate:local` applies cleanly
  - [x] Confirm tests GREEN (8/8)
  - [x] `pnpm test` full suite green (379/379)
  - [ ] **USER GATE:** user runs `pnpm db:migrate:remote`
- Note: `people.gender` is nullable — CHECK uses `IS NULL OR gender IN ('m','f')`.
- Note: D1 FK enforcement ignores PRAGMA foreign_keys=OFF; migration uses 3-phase approach (stage all new tables, drop in child-before-parent order, rename).
- Acceptance: invalid enum inserts throw via D1 driver; valid inserts pass. ✅

---

## TASK-S4 — Scheduled session cleanup cron (P2)

- Status: ✅ tested (agent-s4, Sonnet 4.6, finished 2026-04-23 12:40)
- Verified: `scheduled()` handler at `index.ts:86-95` uses `ScheduledController` type (enforced by `ExportedHandler<Env>`); 2 unit tests pass; wrangler `triggers.crons=["0 * * * *"]` in place.
- Model: Sonnet 4.6
- Dependencies: TASK-S1 GREEN; parallel with S3, S5
- Files (exclusive lock):
  - `src/worker/index.ts` (add `scheduled()` export)
  - `wrangler.jsonc` (add `triggers.crons`)
  - `tests/unit/scheduled-handler.test.ts` (create)
- Sub-tasks:
  - [ ] Add `scheduled()` export calling `deleteExpiredSessions`, wrapped in try/catch
  - [ ] Add `"triggers": { "crons": ["0 * * * *"] }` in `wrangler.jsonc`
  - [ ] Write S4-T1 unit test exercising the handler
  - [ ] `pnpm typecheck` + `pnpm test` green
  - [ ] Post-deploy: verify cron fires via CF dashboard logs
- Acceptance: local manual run via `wrangler dev --test-scheduled` purges expired sessions; prod cron visible in dashboard.

---

## TASK-S5 — Narrow `/api/tree/:slug` cache key (P2)

- Status: ✅ tested (agent-s5, Sonnet 4.6, finished 2026-04-23 12:38)
- Verified: cache key now path-only at `tree.ts:60-62`; S5-T1 + S5-T2 both pass; typecheck clean.
- Model: Sonnet 4.6
- Dependencies: TASK-S1 GREEN; parallel with S3, S4
- Files (exclusive lock):
  - `src/worker/routes/tree.ts` (modify — normalise cache key)
  - `tests/integration/security-cache-invalidation.test.ts` (extend — 2 tests)
- Sub-tasks:
  - [ ] Strip `search` from cache read key at `tree.ts:59`
  - [ ] Strip `search` from cache write key at `tree.ts:130`
  - [ ] Add tests S5-T1, S5-T2
  - [ ] Confirm tests GREEN
  - [ ] `pnpm typecheck` clean
- Acceptance: query-string variants all map to one cache entry; purge clears them all.

---

## TASK-S6 — Patch-level dep bumps (hygiene)

- Status: ✅ tested (agent-s6, Sonnet 4.6, finished 2026-04-23 13:57)
- Verified: 7 pkgs bumped patch/minor; `pnpm audit` 0/0/0/0/0; typecheck clean; test 379/379; build clean (worker 376 kB / client 317 kB).
- Model: Sonnet 4.6 (or direct main-agent — very mechanical)
- Dependencies: S1 + S2 + S3 + S4 + S5 all GREEN
- Files (exclusive lock):
  - `package.json`
  - `pnpm-lock.yaml`
- Sub-tasks:
  - [ ] `pnpm update @vitest/ui vitest vite react-router-dom @cloudflare/vite-plugin @cloudflare/workers-types wrangler` (patch+minor only)
  - [ ] `pnpm audit --json` — assert 0 vulns
  - [ ] `pnpm typecheck` clean
  - [ ] `pnpm test` green
  - [ ] `pnpm e2e` green (or run in S7 instead)
  - [ ] Skip majors: `react`, `react-dom`, `@types/react`, `@types/react-dom`, `zod`, `typescript`, `@types/node`
- Acceptance: audit stays at 0; no test regression.

---

## TASK-S7 — Verification, deploy, migration apply, review-doc flip (coordinator)

- Status: 🟡 partially done — **code + review-doc ready; deploy + remote-migration + cron-visibility remain user-gated**
- Done by main-agent (Opus 4.7, 2026-04-23 14:00):
  - `pnpm typecheck` clean
  - `pnpm test` 379/379
  - `pnpm audit` 0 vulns
  - `pnpm build` clean (worker 376 kB / client 317 kB)
  - `instruction/security-review.md` remediation header + full checklist flipped. DO rate-limiter (P2) left unchecked with explicit deferral note (D5).
- Remaining (**user action**):
  - [ ] Deploy (push to `main` → CI, or `pnpm deploy`)
  - [ ] `pnpm e2e` 18/18 against prod post-deploy
  - [ ] Post-24h: `pnpm db:migrate:remote` (applies 0003 + 0004)
  - [ ] Verify cron fires in CF dashboard 1 hour after deploy
  - [ ] Smoke curl: `/api/health` + one public-tree img (200) + a seeded private tree anon (403)
- Model: Opus 4.6 (coordinator)
- Dependencies: S1–S6 GREEN
- Files (exclusive lock):
  - `instruction/security-review.md` (flip checklist, add remediation header)
- Sub-tasks:
  - [ ] `pnpm typecheck` clean
  - [ ] `pnpm test` — record new total (expect ~355 + ~18)
  - [ ] `pnpm e2e` 18/18 green (or updated count)
  - [ ] `pnpm audit --json` 0 vulns
  - [ ] `pnpm build` clean
  - [ ] Deploy via CI (push to main) or user-gated `pnpm deploy`
  - [ ] Post-deploy smoke (see plan § S7 step 7)
  - [ ] Apply migrations 0004 + 0005 after 24h soak on S1 (user-gated)
  - [ ] Verify cron fires in CF dashboard
  - [ ] Flip every checkbox in security-review.md § Prioritised action checklist to ✅
  - [ ] Add "Remediated 2026-04-MM — commit `<sha>`" header at top of security-review.md
- Acceptance: every acceptance criterion in requirements.md satisfied.

---

## File Lock Registry

Locks become active when the corresponding task flips to 🟡 in_progress. Main agent releases on task completion.

| File | Locked by | Task | Status |
|------|-----------|------|--------|
| `src/worker/routes/img.ts` | — | TASK-S1 | done |
| `tests/integration/img-read.test.ts` | — | TASK-S1 | done |
| `tests/helpers/fixtures.ts` | — | S1 ✅ / S2 | done |
| `src/db/schema.ts` | — | TASK-S2 | done |
| `src/worker/lib/tree-query.ts` | — | TASK-S2 | done |
| `src/worker/lib/seed.ts` | — | TASK-S2 | done |
| `src/app/lib/api.ts` | — | TASK-S2 | done |
| `src/app/lib/types.ts` | — | TASK-S2 | done |
| `scripts/seed-demo.ts` | — | TASK-S2 | done |
| `drizzle/seed.sql` | — | TASK-S2 | done |
| `drizzle/migrations/0003_blushing_ender_wiggin.sql` | — | TASK-S2 | done |
| `tests/integration/tree-read.test.ts` | — | TASK-S2 | done |
| `tests/unit/schema-roundtrip.test.ts` | — | TASK-S2 | done |
| `drizzle/migrations/0004_enum_check_constraints.sql` | — | TASK-S3 | done |
| `tests/integration/schema-check-constraints.test.ts` | — | TASK-S3 | done |
| `src/worker/index.ts` | — | TASK-S4 | done |
| `wrangler.jsonc` | — | TASK-S4 | done |
| `tests/unit/scheduled-handler.test.ts` | — | TASK-S4 | done |
| `src/worker/routes/tree.ts` | — | TASK-S5 | done |
| `tests/integration/security-cache-invalidation.test.ts` | — | TASK-S5 | done |
| `package.json` | — | TASK-S6 | done |
| `pnpm-lock.yaml` | — | TASK-S6 | done |
| `instruction/security-review.md` | main-agent | TASK-S7 | in_progress |

Parallelisable groups:
- **Sequential chain:** S1 → (S2 draft) → S7
- **Parallel after S1:** {S3, S4, S5} can run as three independent agents
- **Gated by all prior:** S6 runs only after S1–S5 green
- **Serial finish:** S7 after S6

---

## Open decisions (from requirements.md — user to confirm or override)

| # | Default | Confirm? |
|---|---------|----------|
| D1 | Keep `is_public` column one cycle; drop after S1 ships + 24h soak. | ✅ approved (S1+S2 staged in one branch; user applies migration after soak) |
| D2 | CHECK on all enum columns (6 tables). | ✅ approved (migration 0004 applied locally) |
| D3 | Cron cadence hourly (`0 * * * *`). | ✅ approved (wrangler.jsonc triggers added) |
| D4 | Strip `search` at cache read/write. | ✅ approved (tree.ts cache key normalised) |
| D5 | Defer DO rate-limiter to separate plan. | ✅ approved (out of scope) |
| D6 | Include patch-level dep bumps (7 packages). | ✅ approved (all 7 bumped; audit clean; tests green) |
| D7 | Migrations user-gated (`pnpm db:migrate:remote` run by user, not agent). | ✅ approved — agent will NOT run remote apply |

---

## Approval gate

User must say **"ลุย"** / **"go"** / **"approve"** (or specify overrides) before any TASK-S* enters in_progress. Sub-agents never prompt the user; defer back to main agent for any unclear decision.
