# Work Session Summary — Security Remediation S1–S7

> Completed: 2026-04-23 17:05 +07 (10:05 UTC)
> Commits: `997e845..7229ce3` (2 commits on `main`)
> Deploy: CF Worker `heritage-worker-api` (GH Actions run `24827108752`)
> Database: `heritage-d1-main` — migrations 0003 + 0004 applied remote at `2026-04-23 09:19:55 UTC`

## Tasks Completed

| Task | Status | Scope |
|------|--------|-------|
| TASK-S1 | ✅ tested | img route gates on `canAccessTree(visibility)` — closes H1 IDOR (`is_public=1 ∧ visibility∈{private,shared}`) |
| TASK-S2 | ✅ tested | Drop `trees.is_public` column (migration 0003) + remove `isPublic` from API/type surface |
| TASK-S3 | ✅ tested | CHECK constraints on enum cols across 6 tables (migration 0004, D1 3-phase rebuild) |
| TASK-S4 | ✅ tested | `scheduled()` handler + `triggers.crons=["0 * * * *"]` for `deleteExpiredSessions` |
| TASK-S5 | ✅ tested | `/api/tree/:slug` cache key path-only (strip search) |
| TASK-S6 | ✅ tested | Patch/minor dep bumps (7 packages); audit stays 0/0/0/0/0 |
| TASK-S7 | ✅ tested | Verify + deploy + migration apply + checklist flip (coordinator) |

## Test Results

- `pnpm typecheck` — clean
- `pnpm test` — **379 passed / 39 files** (was 355 → +24 new regression tests)
  - S1: 8 img-read adversarial tests (is_public IDOR + visibility matrix)
  - S2: 2 unit tests (`no-is-public-in-src`, `tree-query-no-is-public`) + integration assertions
  - S3: 8 CHECK-constraint tests (schema-check-constraints)
  - S4: 2 scheduled-handler tests
  - S5: 2 cache-key narrowing tests (security-cache-invalidation)
- `pnpm e2e` — **18/18 passed (1.9m)** against live prod post-deploy
- `pnpm audit` — 0 info / 0 low / 0 moderate / 0 high / 0 critical (270 deps)
- `pnpm build` — clean (worker 376 kB / client 317 kB)

## Security Review

- **1 HIGH finding remediated** (H1 img IDOR) — verified via 8 new adversarial tests + prod smoke
- **P1 items remediated** — invariant regression test + CHECK constraints on all 6 enum tables
- **P2 items remediated** — session-cleanup cron (registered via CF API: `cron="0 * * * *"`, created `2026-04-23T09:15:49Z`) + cache-key narrowing
- **1 P2 deferred** — Durable Object rate-limiter (per decision D5, own planning round)
- **secret grep in `src/`** — 0 hardcoded credentials
- **`.gitignore`** — `.env` + `.dev.vars` covered
- **Checklist** — `instruction/security-review.md` has remediation header with commit `e95bfc9` + all boxes flipped except the explicit D5 deferral

## Prod Verification

- `GET /api/health` → 200
- `GET /api/tree/wongsuriya` → 200 with keys `[id, slug, name, nameEn, visibility, ownerId]` (no `isPublic` — S2 contract shipped)
- D1 post-migration row counts preserved: 1 tree / 0 members / 0 shares / 24 relations / 16 people / 1 auth_token
- CHECK constraints live on `trees`, `tree_members`, `tree_shares`, `relations`, `people`, `auth_tokens`
- Cron trigger registered (verified via `GET /accounts/{id}/workers/scripts/{name}/schedules`)

## Files Changed (34 files, +3602 / −1322)

### Production code
- `src/worker/routes/img.ts` — S1 (canAccessTree gate + private-cache header)
- `src/worker/routes/tree.ts` — S5 (cache key normalise)
- `src/worker/index.ts` — S4 (scheduled export)
- `src/worker/lib/tree-query.ts` — S2 (drop isPublic from TreeMeta)
- `src/worker/lib/seed.ts` — S2 (remove is_public insert)
- `src/app/lib/api.ts` — S2 (drop isPublic from ApiTreeResponse)
- `src/db/schema.ts` — S2 (remove is_public column definition)
- `scripts/seed-demo.ts` — S2 (seed without is_public)
- `wrangler.jsonc` — S4 (`triggers.crons`)
- `package.json` + `pnpm-lock.yaml` — S6 (dep bumps)

### Migrations
- `drizzle/migrations/0003_blushing_ender_wiggin.sql` — drop is_public
- `drizzle/migrations/0004_enum_check_constraints.sql` — CHECK constraints (314 lines, hand-written 3-phase rebuild)
- `drizzle/migrations/meta/0003_snapshot.json` + `_journal.json`

### Tests
- `tests/integration/img-read.test.ts` (+251) — S1 adversarial matrix
- `tests/integration/schema-check-constraints.test.ts` (new, 285) — S3
- `tests/integration/security-cache-invalidation.test.ts` (+76) — S5
- `tests/integration/tree-read.test.ts` + `perf-cache.test.ts` — assertion updates
- `tests/helpers/fixtures.ts` (+143) — seedPrivateTree / seedSharedTree
- `tests/unit/no-is-public-in-src.test.ts` (new)
- `tests/unit/tree-query-no-is-public.test.ts` (new)
- `tests/unit/scheduled-handler.test.ts` (new, 124)
- `tests/unit/schema-roundtrip.test.ts` — is_public removed from expected columns

### Docs
- `README.md`, `SECURITY.md` — is_public → visibility copy update
- `instruction/security-review.md` — remediation header + checklist flip
- `instruction/work/{plan,requirements,todos}.md` — session planning artifacts

## User Decisions Applied

- **D1** ✅ Keep `is_public` one cycle (S1 shipped first) — but soak gate overridden (see below)
- **D2** ✅ CHECK on all 6 enum cols
- **D3** ✅ Cron hourly `0 * * * *`
- **D4** ✅ Strip search at cache read + write
- **D5** ✅ Defer DO rate-limiter
- **D6** ✅ Include patch-level dep bumps (7 packages)
- **D7** ⚠ Overridden 2026-04-23 16:22 +07 — user explicitly approved applying remote migrations immediately after deploy. Justified by prod D1 sparsity (0 users / 0 sessions / 1 demo tree already satisfying every CHECK).

## Follow-ups (not in scope)

- DO rate-limiter for img route — separate planning round (P2, decision D5)
- Major dep bumps (React 18→19, Zod 3→4, TypeScript 5→6, @types/node) — separate planning round
- Observing first cron fire in CF dashboard Logs (user-side, time-based)

## Commits

```
7229ce3 docs(security): flip S7 to tested after deploy + remote migration
e95bfc9 fix(security): close H1 IDOR + schema CHECKs + session cron (S1-S6)
```
