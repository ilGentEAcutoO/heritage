# Plan — Security remediation (H1 + P1 + P2) and dep-audit sanity

> Created: 2026-04-23 12:02 (+07)
> Source: `requirements.md` (this same dir); full audit in `instruction/security-review.md`
> Supersedes prior plan ("Re-introduce Auth + Sharing + Perf" — all phases 0-5 shipped 2026-04-23)

---

## Architecture — what changes, what stays

```
┌──────────────────────────────────────────────────────────────┐
│  PUBLIC SURFACE                                              │
│  GET  /api/tree/:slug       ── cache-key now path-only       │ ← S5
│  GET  /api/img/*            ── gate via canAccessTree()      │ ← S1
│  PATCH /api/tree/:slug/visibility  (no change)               │
│  scheduled() handler        ── deleteExpiredSessions()       │ ← S4
└──────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  D1 SCHEMA DELTA                                             │
│  trees.is_public            ── DROPPED in migration 0004     │ ← S2
│  trees.visibility           ── CHECK(visibility IN …)        │ ← S3
│  tree_members.role          ── CHECK(role IN …)              │ ← S3
│  tree_shares.role           ── CHECK(role IN …)              │ ← S3
│  tree_shares.status         ── CHECK(status IN …)            │ ← S3
│  relations.kind             ── CHECK(kind IN …)              │ ← S3
│  people.gender              ── CHECK(gender IN …)            │ ← S3
│  auth_tokens.kind           ── CHECK(kind IN …)              │ ← S3
└──────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  WRANGLER.JSONC                                              │
│  "triggers": { "crons": ["0 * * * *"] }  ← NEW for session   │
│                                              cleanup (S4)    │
└──────────────────────────────────────────────────────────────┘
```

**Unchanged** (intentionally): auth routes, password hashing, origin-check CSRF, token CAS, session cookie attributes, Zod schemas, security-headers middleware, edge-cache write/read flow. These came through the audit clean.

---

## Sequencing — six phases, TDD-first, safe rollback

**S1 (P0-critical) ▸ S2 (P0-cleanup) ▸ S3 (P1-constraints) ‖ S4 (P2-cron) ‖ S5 (P2-cache) ▸ S6 (dep bumps) ▸ S7 (verify + ship)**

Legend: `▸` = sequential dependency, `‖` = parallelisable.

Phases S3, S4, S5 are independent of each other once S1 lands — can run as three parallel sub-agents. S6 is independent too but we gate it on S1-5 green so we don't muddle the diff.

---

## Phase S1 — Fix H1: img route uses `canAccessTree`

**Why first:** live IDOR. Every other task is cosmetic relative to this one.

**Sequencing:** TDD. Red tests first, confirm they fail on `main`, then apply the fix, confirm green.

### Test specifications (RED tests, must fail before fix)

Add to `tests/integration/img-read.test.ts`:

1. **S1-T1 — `is_public=1, visibility='private'` → 403** (the IDOR fix)
   - Seed: tree with `is_public: true, visibility: 'private'`, plus a photo + R2 object.
   - Anonymous GET `/api/img/photos/<treeId>/<pid>/<ULID>.jpg` → expect 403. Current code returns 200.
2. **S1-T2 — private tree, owner has session cookie → 200**
   - Seed: tree `visibility='private', owner_id=U1`; session row for U1.
   - GET with the `__Host-session` cookie set → expect 200.
3. **S1-T3 — private tree, non-owner session → 403**
   - Seed: `visibility='private', owner_id=U1`; session for U2.
   - GET → 403.
4. **S1-T4 — shared tree, user has accepted share → 200**
   - Seed: `visibility='shared', owner_id=U1`; `tree_shares` row user_id=U2 status='accepted'.
   - GET with U2's session → 200.
5. **S1-T5 — shared tree, pending/revoked share → 403**
   - Same as S1-T4 but `status='pending'`. GET → 403.
6. **S1-T6 — shared tree, anonymous → 403**
   - Seed: `visibility='shared'`. GET with no cookie → 403.
7. **S1-T7 — public tree, anonymous → 200** (regression guard, preserves existing behaviour)
   - Seed: `visibility='public'`. GET with no cookie → 200.
8. **S1-T8 — existing rate-limit + key-shape + header tests stay green** (regression guard).

Also update the R2 stub helper to accept per-tree seed helpers `seedPrivateTree(owner_id)` and `seedSharedTree(owner_id, acceptedShares)` in `tests/helpers/`.

### Implementation steps

1. Modify `src/worker/routes/img.ts:175-186`:
   - Read `visibility` + `owner_id` instead of `is_public`.
   - Replace the `!tree.is_public → 403` check with a call to `canAccessTree(db, {id, visibility, owner_id}, c.var.user?.id ?? null)`.
   - Keep the rate-limiter, R2 fetch, and response headers exactly as today.
2. Add `import { canAccessTree } from '../lib/can-access-tree';` at the top.
3. No change to the middleware stack — `sessionMiddleware` already runs app-wide in `index.ts` so `c.var.user` is populated when a valid `__Host-session` cookie is present.

### Acceptance for S1

- S1-T1…S1-T8 all green.
- `pnpm test` total unchanged apart from the new tests added.
- `pnpm typecheck` clean.
- No change to exported types or client API.

**Security implication:** this is the production bug. Ship S1 standalone as its own commit so the revert is atomic if anything surprises us in prod.

---

## Phase S2 — Drop `is_public` column + client surface cleanup

**Depends on:** S1 deployed and observed healthy for 24 h (per rollback plan in requirements.md). Agent can **prepare** the diff in S2 but must not apply the migration until user says go.

### Test specifications

1. **S2-T1 — schema-roundtrip test updated** (`tests/unit/schema-roundtrip.test.ts`)
   - Remove `is_public` from the expected columns; assert it is NOT present after migration 0004.
2. **S2-T2 — no production code references `is_public`**
   - Static test: `grep -rn 'is_public' src/` returns zero hits.
3. **S2-T3 — tree-query returns no `isPublic` field**
   - Unit test on `getTreeData` confirms `tree` object does not expose `isPublic`.
4. **S2-T4 — API contract regression** (`tests/integration/tree-read.test.ts`)
   - GET `/api/tree/wongsuriya` response body has no `isPublic` key.

### Implementation steps

1. **Drizzle schema change** — `src/db/schema.ts`:
   - Remove the `is_public` column definition from the `trees` table.
2. **Generate migration 0004** via `pnpm db:generate` (drizzle-kit emits the SQLite-rebuild dance automatically).
   - Review the generated `.sql` — it should recreate `trees` without `is_public` and backfill from existing data.
3. **Tree-query** — `src/worker/lib/tree-query.ts`:
   - Remove `isPublic: boolean` from `TreeMeta` interface.
   - Remove the `isPublic: visibility === 'public'` assignment in the return object.
   - Remove the fallback `treeRow.is_public` logic at lines 307-309 (no longer reachable).
4. **API types** — `src/app/lib/api.ts`:
   - Remove `isPublic: boolean` from `ApiTreeResponse.tree`.
5. **Frontend types** — `src/app/lib/types.ts`:
   - Already migrated to `visibility` (per TASK-F-SHARE). Confirm `isPublic` is gone.
6. **Seed data** — `src/worker/lib/seed.ts:236` and `scripts/seed-demo.ts:229-230` + `drizzle/seed.sql:5`:
   - Remove `is_public` from INSERT column list.
7. **Tests** — update any fixture that constructs `trees` rows to stop setting `is_public`.

### Acceptance for S2

- Migration 0004 applies cleanly locally (`pnpm db:migrate:local`).
- `pnpm typecheck` clean.
- `pnpm test` green.
- User approves → `pnpm db:migrate:remote` applied to prod D1 (per decision D7).

---

## Phase S3 — DB `CHECK` constraints on enum columns

**Depends on:** none (parallel with S4, S5). Can run on top of S1 without waiting for S2.

### Test specifications

New file `tests/integration/schema-check-constraints.test.ts`:

1. **S3-T1** — Insert invalid `trees.visibility='admin'` → driver throws.
2. **S3-T2** — Insert invalid `tree_members.role='superuser'` → driver throws.
3. **S3-T3** — Insert invalid `tree_shares.status='nuked'` → driver throws.
4. **S3-T4** — Insert invalid `tree_shares.role='admin'` → driver throws.
5. **S3-T5** — Insert invalid `relations.kind='friend'` → driver throws.
6. **S3-T6** — Insert invalid `people.gender='x'` → driver throws (current: no constraint).
7. **S3-T7** — Insert invalid `auth_tokens.kind='admin'` → driver throws.
8. **S3-T8** — All **valid** enum values still insert successfully (regression guard).

### Implementation steps

1. **Migration 0005_enum_check_constraints.sql** — hand-written since drizzle-kit doesn't emit CHECK clauses from the TS enum type. SQLite requires a table rebuild to add CHECK; pattern is:

   ```sql
   PRAGMA foreign_keys=OFF;
   CREATE TABLE `__new_trees` (
     …same as existing trees…,
     `visibility` text DEFAULT 'public' NOT NULL
       CHECK (`visibility` IN ('public','private','shared')),
     …
   );
   INSERT INTO `__new_trees` SELECT … FROM `trees`;
   DROP TABLE `trees`;
   ALTER TABLE `__new_trees` RENAME TO `trees`;
   PRAGMA foreign_keys=ON;
   ```

   Apply the same pattern to: `tree_members`, `tree_shares`, `relations`, `people`, `auth_tokens`.

2. **No schema.ts change needed** — drizzle enum types stay; CHECK enforces the same set at the DB.
3. Document the migration in a comment header so the next engineer knows drizzle doesn't emit CHECKs.

### Acceptance for S3

- Migration 0005 applies cleanly locally.
- S3-T1…T8 pass.
- All prior schema-roundtrip tests still pass (constraints don't reject valid data).
- User approves → `pnpm db:migrate:remote`.

---

## Phase S4 — Scheduled session cleanup (cron trigger)

**Depends on:** none (parallel with S3, S5).

### Test specifications

1. **S4-T1** — `scheduled()` handler calls `deleteExpiredSessions(db)` and logs a `sessions_purged=N` line.
2. **S4-T2** — Existing `session-cleanup.test.ts` stays green (helper itself is already tested).

### Implementation steps

1. **`src/worker/index.ts`** — add the `scheduled` export alongside `fetch`:

   ```ts
   export default {
     async fetch(request, env, ctx) { … existing … },
     async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
       try {
         getValidatedEnv(env);
         const db = createDb(env.DB);
         const purged = await deleteExpiredSessions(db);
         console.log(JSON.stringify({ event: 'sessions_purged', count: purged }));
       } catch (err) {
         console.error('[scheduled] session cleanup failed:', err);
       }
     },
   } satisfies ExportedHandler<Env>;
   ```

2. **`wrangler.jsonc`** — add the `triggers` section:

   ```jsonc
   "triggers": {
     "crons": ["0 * * * *"]
   }
   ```

3. **Unit test** — `tests/unit/scheduled-handler.test.ts` exercises the handler end-to-end against the sqlite D1 stub; asserts expired sessions are removed, fresh ones retained.

### Acceptance for S4

- Local: manual run via `wrangler dev --test-scheduled` then `curl -X POST http://localhost:8787/__scheduled` fires the handler.
- Prod: after deploy, CF dashboard shows a cron trigger firing at `:00` each hour; logs contain `sessions_purged=N` entries.

---

## Phase S5 — Cache-key narrowing

**Depends on:** none (parallel with S3, S4).

### Test specifications

Add to `tests/integration/security-cache-invalidation.test.ts`:

1. **S5-T1** — `/api/tree/:slug?foo=1` and `/api/tree/:slug?bar=2` both hit the same cache entry (key is path-only).
2. **S5-T2** — After `purgeTreeCache`, every query-string variant misses on next read.

### Implementation steps

1. **`src/worker/routes/tree.ts:57-59`** — replace `const cacheKey = new Request(c.req.url)` with a normalised key that strips search:

   ```ts
   const cacheUrl = new URL(c.req.url);
   cacheUrl.search = '';
   const cacheKey = new Request(cacheUrl.toString());
   ```

   Apply the same change to both the read path (L59) and the write path (L130) — both must use the normalised key.

2. **`src/worker/lib/cache-purge.ts`** — already does `url.search = ''`. After S5, it now aligns exactly with the write key.

### Acceptance for S5

- S5-T1 + S5-T2 pass.
- Existing `security-cache-invalidation.test.ts` coverage stays green.
- A query-string-based cache-poisoning probe (`curl /api/tree/wongsuriya?x=1`, `?x=2`, …) returns the same `X-Cache: HIT` body with the same ETag after the first miss.

---

## Phase S6 — Patch-level dependency bumps (optional hygiene)

**Depends on:** S1-5 all green (keeps the diff clean).

### Packages to bump

- `@vitest/ui` 4.1.4 → 4.1.5
- `react-router-dom` 7.14.1 → 7.14.2
- `vite` 8.0.8 → 8.0.9
- `vitest` 4.1.4 → 4.1.5
- `@cloudflare/vite-plugin` 1.32.3 → 1.33.1 (minor — smoke test before shipping)
- `@cloudflare/workers-types` 4.20260418.1 → 4.20260423.1
- `wrangler` 4.83.0 → 4.84.1

### Implementation steps

1. `pnpm update` with the exact version targets above (avoid a surprise major).
2. `pnpm audit --json` — confirm still 0 vulnerabilities.
3. `pnpm typecheck` — confirm clean.
4. `pnpm test` — confirm green.
5. `pnpm e2e` against local dev or prod.

### Acceptance for S6

- `pnpm audit` → 0 vulns.
- `pnpm outdated` now shows only majors (React 18→19, Zod 3→4, TypeScript 5→6) + patch/minor for deps we deliberately skipped.
- No test regression.

---

## Phase S7 — Verification + deploy

Ordered checklist run by a single coordinator agent after S1-S6 land:

1. `pnpm typecheck` → must be clean.
2. `pnpm test` → all green; record new total (expect 355 + ~18 new).
3. `pnpm e2e` → 18/18 green (or updated count if new cases added).
4. `pnpm audit --json` → 0 vulns.
5. Build: `pnpm build`.
6. Deploy via CI (push to main → GitHub Actions) **or**, if CI not wired yet, user runs `pnpm deploy` with approval.
7. Post-deploy smoke:
   - `curl -i https://heritage.jairukchan.com/api/health` → 200.
   - `curl -i https://heritage.jairukchan.com/api/img/photos/tree-wongsuriya/p1/01KPMM887P4HHGNQ3VE5H2E44D.jpg` → 200 (demo public tree).
   - Seed a private tree (non-prod) and verify 403 for anonymous.
8. Apply prod migrations in order (0004, then 0005) after 24 h soak on S1.
9. Verify cron trigger fires in CF dashboard after 1 h.
10. Update `instruction/security-review.md` — flip every checkbox in the Prioritised Action Checklist to ✅ and add a "Remediated 2026-04-23" header.

---

## Security considerations (unchanged surface)

The audit already confirmed the following is safe after prior remediation; we preserve all of it:

- `__Host-session` cookie attributes — do not touch.
- Scrypt N=16384 / r=8 / p=1 — do not touch.
- `originCheck` middleware semantics — do not touch.
- Zod validation on every mutation — do not touch.
- Token CAS with `UPDATE ... RETURNING` — do not touch.
- Image key regex `photos/<tree>/<person>/<ULID>.<ext>` — preserved.

New considerations introduced by this plan:

- **S1** — img route now consults `c.var.user`. Make sure `sessionMiddleware` runs before the img router (it does — mounted in `index.ts` as `app.use('*', sessionMiddleware)`).
- **S1** — private/shared photos are now cacheable-per-user. Keep `Cache-Control: public, max-age=60` on public only; for private/shared responses emit `Cache-Control: private, max-age=60, must-revalidate`. Otherwise a CDN shared cache could replay one user's response to another.
- **S3** — `CHECK` constraints reject `NULL` in some enum cols (notably `people.gender`, which is currently nullable). Migration must tolerate `gender IS NULL` with `CHECK (gender IS NULL OR gender IN ('m','f'))`.
- **S4** — scheduled handler must fail closed; any unexpected error must log without crashing the worker.
- **S5** — stripping the search component means `?cachebust=xxx` no longer does anything. That's the intent, but confirm no frontend or ops workflow relies on the current behaviour.

---

## Parallel-execution plan

Two parallel sub-agent fleets after S1 lands:

```
S1 (one agent, Sonnet 4.6, test-first)
 │
 └──► S2 prep (one agent, Sonnet 4.6)   ─ diff ready, waits for user "ลุย" to apply migration 0004
 │
 ├──► S3 (one agent, Sonnet 4.6)  — migration 0005 + tests
 ├──► S4 (one agent, Sonnet 4.6)  — scheduled handler + wrangler.jsonc + tests
 └──► S5 (one agent, Sonnet 4.6)  — tree.ts + cache-purge sync + tests
        │
        ▼
      S6 (one agent, Sonnet 4.6) — pnpm update
        │
        ▼
      S7 (coordinator, Opus 4.6) — verify + deploy + migration apply + review.md flip
```

File locks (see todos.md) prevent overlap. `tree.ts` is touched by S5 only; `index.ts` by S4 only; `schema.ts` by S2 only; migration files by S2, S3, S5; `img.ts` by S1 only.

---

## Reference to security-checklist

This plan explicitly addresses every item currently open in `instruction/security-review.md` § "Prioritised action checklist":

- **P0** — H1 img fix (S1), migration 0004 drop (S2), type cleanup (S2).
- **P1** — invariant regression test (S1-T1…S1-T8 + S2-T2), CHECK constraints (S3).
- **P2** — session cleanup cron (S4), cache-key narrowing (S5). The DO rate-limiter is explicitly deferred (decision D5) and will be a separate planning round.
