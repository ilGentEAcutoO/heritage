# Security Review — heritage

> **Update 2026-05-02 — Magic-link login shipped (TASK-M1…M7, commit `41052d6`, Deploy run `25248096502`).**
> New endpoints `POST /api/auth/magic/{request,consume}` reuse the existing security primitives (`RL_LOGIN` + `RL_LOGIN_IP` rate limits, `__Host-session` cookie, atomic CAS via `UPDATE ... RETURNING`). Migration `0005_extend_auth_tokens_kind.sql` extends the `auth_tokens.kind` CHECK to allow `'magic'`; consume filters by `kind='magic'` so verify/reset tokens cannot be replayed across kinds. Constant-time `hashToken()` filler on the no-user / unverified branch preserves the existing timing-enumeration parity. Outbound mail moved from CF Email Routing forward to CF Email Service binding (`remote: true`, FROM `heritage@jairukchan.com`); DMARC `p=reject` + DKIM `cf2024-1` live on the zone. End-to-end prod smoke `2026-05-02 08:42 UTC` exercised signup → verify email → magic request → consume → `/api/auth/me` against `https://heritage.jairukchan.com`; replay of an already-consumed magic token correctly returns 400. **No new findings.** 400/400 unit + integration tests green at deploy time.
>
> **Remediated 2026-04-23 — TASK-S1…S6 (plan `instruction/work/plan.md`), commit `e95bfc9`.**
> H1 + P0 cleanup (S1, S2) shipped in code; P1 invariant regression + `CHECK` constraints (S2-T2 + S3 migration 0004) shipped; P2 cron (S4) + cache-key narrowing (S5) shipped; patch-level dep audit (S6) preserves 0 vulns. Deployed to prod via GitHub Actions (CI run `24827044433`, Deploy run `24827108752`). Migrations `0003_blushing_ender_wiggin.sql` (drop `is_public`) and `0004_enum_check_constraints.sql` (enum CHECKs on 6 tables) applied to remote D1 at `2026-04-23 09:19:55 UTC`; post-migration schema verified (no `is_public` column on `trees`; CHECK constraints live on all 6 rebuilt tables; row counts preserved). `pnpm e2e` 18/18 green against prod post-deploy. The Durable-Object rate-limiter (P2) remains an open follow-up — intentionally deferred to its own planning round per decision D5.

**Scope:** full codebase audit (all apps — worker, frontend, schema, config, scripts). Not diff-limited.
**Date:** 2026-04-23
**Commit:** `997e845` (tip of `main` at audit time; remediation staged on the same branch at HEAD)
**Auditor:** 4 parallel Explore sub-agents (auth/session, API/data, frontend, schema/config) + lead verification
**Stack:** Cloudflare Workers + Hono 4 + D1 (Drizzle) + R2 + KV + React 18 + React Router 7 + Vite 8

---

## Executive summary

The codebase is in solid shape after the prior remediation pass. Auth/session handling is robust (scrypt, atomic token CAS, `__Host-session`, origin-based CSRF, login rate-limits, timing-safe password compare). API routes consistently gate by `canAccessTree` / `resolveOwnerTree`. Drizzle parameterised queries close SQLi. Frontend has no XSS sinks or unsafe navigation. Config hygiene is clean (secrets not committed, `assertEnv` validates `APP_URL` + `SESSION_SECRET` length, Worker production guard in `seed-demo.ts`).

**One confirmed HIGH-severity finding** remains: the `/api/img/*` route gates on the deprecated `is_public` boolean instead of the canonical `visibility` enum. This creates a latent IDOR whenever a tree has `is_public=1` but `visibility ∈ {private, shared}` — a state that migration 0002 can produce for any pre-existing public tree whose owner later flips visibility.

### Severity totals

| Critical | High | Medium | Low | Informational |
|---------:|-----:|-------:|----:|--------------:|
|   0      |   1  |   0    |  0  |      —        |

All other candidate findings from the sub-agents were filtered out as sub-confidence-8 or under the hard-exclusion list (DoS, hardening-only, theoretical races, dependency CVE scans, client-side authz expectations, etc.).

---

## High

### H1 — `GET /api/img/*` authorises on deprecated `is_public` instead of `visibility`
**Location:** `src/worker/routes/img.ts:175-186`
**Category:** IDOR / data exposure
**Confidence:** 9

```ts
// img.ts:175-186
const tree = await db.query.trees.findFirst({
  where: eq(schema.trees.id, person.tree_id),
  columns: { id: true, is_public: true },   // ← wrong column
});
if (!tree) return c.json({ error: 'not_found' }, 404);
if (!tree.is_public) {                      // ← legacy gate
  return c.json({ error: 'forbidden' }, 403);
}
```

The canonical access-control column everywhere else in the codebase is `trees.visibility` (enum `'public' | 'private' | 'shared'`), enforced by `canAccessTree` (`src/worker/lib/can-access-tree.ts:35-80`). The `is_public` boolean is flagged in `src/db/schema.ts:42` as *"retained for backward compat — drop deferred"* and is never written by application code:

- `POST /api/trees` (`trees.ts:170-176`) inserts `visibility` only; `is_public` falls back to the schema default (`false`).
- `PATCH /:slug/visibility` (`shares.ts:296-299`) updates `visibility` only; `is_public` is never touched.
- Migration 0002 backfills `visibility` from `is_public` but **does not clear `is_public`** (`drizzle/migrations/0002_odd_molecule_man.sql:27`).

The two columns therefore drift apart the moment any pre-migration tree's owner flips visibility.

**Exploit scenario:**
1. A tree existed before migration 0002 with `is_public = 1`. Migration 0002 backfills `visibility = 'public'`. Both columns now say "public" — consistent.
2. The owner later calls `PATCH /api/tree/:slug/visibility` with `{ "visibility": "private" }`. The UPDATE at `shares.ts:296-299` writes `visibility = 'private'` but leaves `is_public = 1`.
3. The tree-read route correctly refuses: `GET /api/tree/:slug` runs `canAccessTree(vis='private')` and 404s for anonymous viewers (`tree.ts:86-92`).
4. The image route still passes the gate because it reads `is_public`:
   ```
   curl https://heritage.jairukchan.com/api/img/photos/<treeId>/<personId>/<ULID>.jpg
   HTTP/1.1 200 OK
   Content-Type: image/jpeg
   ...
   ```
5. Every avatar/photo in the now-private tree is readable without a session cookie. Because photo keys are deterministic (`photos/<treeId>/<personId>/<ULID>.<ext>`) the whole tree's photo set is enumerable from the tree's `people[].avatarKey` values — which are exposed by the cached public response that lived in `caches.default` before the visibility flip, by any scraped archive, or by direct enumeration of people IDs.

**Why this is exploitable today, not just theoretical:**

- The seeded `tree-wongsuriya` has `is_public=1` in both `drizzle/seed.sql:5` and `scripts/seed-demo.ts:229-230`. It has no owner so a single tree can't be flipped via the API, but **any production D1 row inserted before migration 0002 with `is_public=1` and a non-null owner** is vulnerable at the moment the owner makes it private.
- An admin tool or future migration that sets `is_public = true` on an owned tree (e.g. to promote a community tree) reopens the exact same desync window — `POST /api/trees` can't reach this state today, but an operator bootstrapping via direct `wrangler d1 execute` can.

**Fix:** remove the `is_public` check and delegate to `canAccessTree` so the image route shares the same policy as the tree-read route. Replace `img.ts:165-186` with:

```ts
const tree = await db.query.trees.findFirst({
  where: eq(schema.trees.id, person.tree_id),
  columns: { id: true, visibility: true, owner_id: true },
});
if (!tree) return c.json({ error: 'not_found' }, 404);

const allowed = await canAccessTree(
  db,
  { id: tree.id, visibility: tree.visibility, owner_id: tree.owner_id ?? null },
  c.var.user?.id ?? null,
);
if (!allowed) return c.json({ error: 'forbidden' }, 403);
```

Then:
1. Add a follow-up migration that **drops `is_public`** from `trees` once the column is fully orphaned:
   ```sql
   ALTER TABLE trees DROP COLUMN is_public;
   ```
2. Delete `isPublic` from `TreeMeta` in `tree-query.ts:33` and from the `ApiTreeResponse` shape in `src/app/lib/api.ts:51` (frontend only reads `visibility`).

Until both columns converge, every access path that authorises on `is_public` is a latent bypass.

---

## Notable clean results (for the record)

The following categories were audited end-to-end and produced zero findings at confidence ≥ 8. Each was a candidate surface in the prior review that has since been closed.

**Authentication / session**
- Scrypt password hashing with per-user random salt, `timingSafeEqual` for verify (`lib/password.ts:51-86`).
- `dummyVerifyPassword` runs on unknown-email and unverified-email paths to preserve timing parity (`auth.ts:330-343`).
- 256-bit tokens via `crypto.getRandomValues`; SHA-256 hash stored, raw token only in transit (`lib/tokens.ts:11-45`).
- Atomic CAS on `/verify` and `/reset` via `UPDATE ... RETURNING` with `used_at IS NULL` predicate — closes the earlier H1/TOCTOU (`auth.ts:226-243, 466-483`).
- Session cookie is `__Host-session`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, no `Domain=` (`auth.ts:99-105`).
- Password reset invalidates all sessions for the user (`auth.ts:507`).
- Login rate-limited per-email (`RL_LOGIN`) and per-IP (`RL_LOGIN_IP`) from Cloudflare's native binding.
- `origin-check` middleware covers all mutation verbs including `application/json` (which Hono's `csrf()` does not) and correctly treats missing Origin as same-origin/tooling (`middleware/origin-check.ts`).
- `assertEnv` enforces `APP_URL` is https in production and `SESSION_SECRET.length ≥ 32` (`lib/config.ts:31-60`).
- `newId()` and `newUuid()` use `crypto.getRandomValues` / `crypto.randomUUID` — no `Math.random`.

**API / data layer**
- All tree-read requests flow through `canAccessTree`, with owner-only gates in `resolveOwnerTree` for share management and visibility flips (`lib/can-access-tree.ts`, `shares.ts:61-86`).
- All routes use Drizzle parameterised queries; only raw SQL is the static seed data in `seed-demo.ts` (no user input).
- Zod validation applied to every mutation body; email fields capped at RFC-5321 254 chars; slugs constrained to `/^[a-z0-9][a-z0-9-]{1,63}$/`.
- Image key regex (`img.ts:65`) pins the tree-scoped ULID layout and rejects path-traversal attempts with 404 (no shape disclosure).
- `X-Content-Type-Options: nosniff`, `Content-Disposition: inline; filename="<sanitized>"`, `Vary: Cookie` on image responses.
- `cache-purge.ts` invalidates only a deterministic cache key constructed from the current `slug` — no SSRF, no user-controlled fetch.
- `seedDemo()` is not mounted as an HTTP route; reachable only via `pnpm db:seed:local`.

**Frontend**
- No `dangerouslySetInnerHTML`, no direct DOM mutation, no `eval`/`Function`/string-`setTimeout`.
- No `postMessage` calls and no unvalidated `message` listeners.
- No `window.location = userData`, no `<a href={userData}>` fed by user content, no `<iframe src=...>`.
- Auth tokens only live in `__Host-session` cookies; `localStorage` holds UI prefs only.
- `credentials: 'include'` is same-origin-only (relative paths), with an explicit comment guard in `api.ts:107-109`.
- No secrets in `vite.config.ts` (`define` absent) and no source maps committed.

**Config / repo hygiene**
- `.env.example` and `.dev.vars.example` hold placeholder values only.
- `.gitignore` covers `.env`, `.dev.vars`, `.wrangler`, `dist`, `drizzle/seed.sql`, `.playwright-mcp`, `agent-temp`.
- `scripts/seed-demo.ts` is guarded by `assertRemoteConsent` — `--remote` requires `CONFIRM=yes` or an interactive `y` reply.
- `SECURITY.md` is present and documents the reporting channel.
- Baseline security headers (`CSP`, `HSTS` with preload, `Referrer-Policy`, `Permissions-Policy`, `X-Content-Type-Options`) are applied to every response via `middleware/security-headers.ts` and re-applied to SPA/asset responses in the top-level fetch handler.
- `compatibility_date: 2026-04-01` documented with an explanatory comment in `wrangler.jsonc`.

---

## Candidate findings that were filtered out

For transparency, these were raised by sub-agents or considered by the lead auditor and then dropped:

- **Password-reset token bound to email, not user id** — sub-agent proposed this as an IDOR, but the token is a 256-bit opaque secret hashed in D1 and delivered only to the email owner; any "intercept" scenario requires owning the email channel, at which point every email-based flow is compromised. Dropped: not a concrete attack path.
- **Session cookie uses `SameSite=Lax` rather than `Strict`** — Lax + `origin-check` + `__Host-` is the documented belt-and-braces pattern and the "pre-2010s browser bypass" scenario is not realistic. Dropped: hardening only.
- **Magic-verify link auto-POSTed on mount in `Verify.tsx`** — prefetchers that execute JS could consume the token, but the resulting session cookie is `__Host-` scoped and lands in the prefetcher, not the attacker, and the user can still log in via password (email is already verified). Dropped: availability inconvenience, not a security vulnerability.
- **Missing DB-level `CHECK` constraints on enum columns** — requires direct DB write (outside the app threat model); application-layer Zod + Drizzle enum typing is the actual enforcement point. Dropped: hardening only.
- **Stale-cache read after visibility flip via pre-primed query-string variants on `/api/tree/:slug`** (`tree.ts:59` + `cache-purge.ts:23-33`) — `caches.default` keys by full URL; the purge only deletes the no-query variant. Exploit window is bounded by the 60-second `max-age`. Dropped: confidence ~7, narrow window, requires attacker-timed pre-seeding.
- **Signup lacks per-IP rate-limiter** — anti-enumeration is handled by uniform 201 responses regardless of email existence; rate-limit absence here is a DoS/hardening concern, excluded per scope.
- **Email prefetcher token consumption** — see above; behavior is annoying but not a session-hijack path.
- **Logout endpoint not behind `requireAuth`** — deleting the session identified by the caller's own cookie is idempotent and provides no attacker leverage.

---

## Prioritised action checklist

### P0 — must fix before next production release
- [x] **H1** Swap `img.ts:175-186` to `canAccessTree` and drop the `is_public` lookup. — TASK-S1, 8 new tests (`tests/integration/img-read.test.ts` S1-T1…T8) including the IDOR regression + private/shared `Cache-Control: private, max-age=60, must-revalidate` guard.
- [x] Follow-up migration: `ALTER TABLE trees DROP COLUMN is_public;` once no reader references it. — TASK-S2, `drizzle/migrations/0003_blushing_ender_wiggin.sql` (direct SQLite 3.35+ DROP COLUMN). **Remote apply user-gated per D7.**
- [x] Delete `isPublic` from `TreeMeta` / `ApiTreeResponse` to remove the zombie field from the client surface. — TASK-S2, removed from `src/worker/lib/tree-query.ts`, `src/app/lib/api.ts`, `src/app/lib/types.ts`, all seed scripts, and every test fixture.

### P1 — next sprint
- [x] Add `is_public` → `visibility` invariant regression test in `tests/integration/` so any future re-introduction of the dual-column pattern fails CI. — TASK-S2, `tests/unit/no-is-public-in-src.test.ts` (static grep on `src/`) + `tests/unit/schema-roundtrip.test.ts` (asserts `is_public` column absent) + the rewritten S1-T1 as the behavioural regression.
- [x] Add a check constraint on `trees.visibility` so a direct `wrangler d1 execute` that drops an invalid enum is rejected at the DB boundary (optional hardening, cheap). — TASK-S3, `drizzle/migrations/0004_enum_check_constraints.sql` covers **6 tables** (`trees.visibility`, `tree_members.role`, `tree_shares.role` + `status`, `relations.kind`, `people.gender` (NULL-permitting), `auth_tokens.kind`). 8 driver-rejection tests in `tests/integration/schema-check-constraints.test.ts`. **Remote apply user-gated per D7.**

### P2 — backlog / operational
- [x] Wire the `deleteExpiredSessions` helper (`lib/session-cleanup.ts`) to a Cloudflare cron trigger so session IP/UA PII is purged on schedule. — TASK-S4, `src/worker/index.ts` `scheduled()` export + `wrangler.jsonc` `triggers.crons=["0 * * * *"]` + 2 unit tests (happy path + fails-closed-on-error). Deploy verification (cron visible in CF dashboard) is a post-deploy step for the operator.
- [ ] Consider moving the per-IP / per-tree image rate-limiter to a Durable Object for true atomic increments (documented tolerated race today). — **Intentionally deferred per decision D5** (separate planning round; scope is larger than the single-file changes in this workstream).
- [x] Document (or narrow) the `/api/tree/:slug` cache-key policy — either strip query strings at cache write time or have the purge delete all keys matching the path, not just the no-query variant. — TASK-S5, `src/worker/routes/tree.ts:60-62` now strips `search` on both read and write; aligns with `cache-purge.ts`'s existing path-only delete. 2 regression tests in `tests/integration/security-cache-invalidation.test.ts` (S5-T1 variant-share + S5-T2 purge-clears-all-variants).

### Dependency audit (hygiene, added to this workstream)
- [x] Patch/minor bump 7 packages (`@vitest/ui`, `vitest`, `vite`, `react-router-dom`, `@cloudflare/vite-plugin`, `@cloudflare/workers-types`, `wrangler`) — TASK-S6. `pnpm audit --json` → 0 vulns across 270 deps (info/low/moderate/high/critical all 0). Major bumps (`react` 18→19, `zod` 3→4, `typescript` 5→6, `@types/node`) intentionally deferred.

---

## Methodology

Four Explore sub-agents ran in parallel, each scoped to one concern and given the full hard-exclusion list (DoS / secrets-on-disk / rate-limit hardening / theoretical races / React auto-escape / client-side authz / dependency CVEs). Each returned a severity-ranked markdown block with file:line citations. The lead auditor then:

1. Cross-checked each finding against the live code (not sub-agent summaries) to confirm file/line accuracy.
2. Applied the "> 0.8 confidence" threshold and hard-exclusion rules uniformly — any finding the sub-agent rated 7 or below was dropped; any finding that was hardening-only or required out-of-threat-model prerequisites was dropped.
3. Re-verified the surviving HIGH finding end-to-end by tracing:
   - how `is_public` can reach `1` (migration 0002 backfill, seed inserts, admin CLI)
   - how `visibility` can then diverge (API `PATCH /:slug/visibility` touches only `visibility`)
   - how the img route reads it (direct `is_public` lookup, no `canAccessTree` call)
   - how an attacker reaches the R2 key (tree-query emits `avatarKey`, photo keys are deterministic).

No dynamic testing (running the worker, probing endpoints) was performed — this is a static code audit against commit `997e845`. The existing `tests/integration/` and `tests/e2e/` suites plus `playwright-report/` show the remediation of prior findings; no new regressions were introduced in recent work.
