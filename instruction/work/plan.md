# Plan — Security Remediation & Login Removal

> Created: 2026-04-20 09:52 (+07)
> Requirements: `./requirements.md`
> Findings reference: `../security-review.md`
> Archive of prior build: `../archive/01-heritage-initial-build/`

---

## TL;DR

Four PRs, one per priority tier. PR-1 deletes the entire login/mutation surface (resolves 20+ findings by deletion). PR-2 patches the remaining read-only surface and fixes the dep-audit CVEs. PR-3 adds defense-in-depth headers and input-shape validation. PR-4 closes Low-severity and hygiene items and adds CI.

TDD throughout: each Critical / High fix lands with a failing regression test **in the same PR, committed first**.

---

## Architecture — before / after login removal

### Before (current)

```
Worker (Hono)
├─ dbMiddleware
├─ sessionMiddleware      ← reads __Host-heritage_session cookie, sets c.var.user
├─ csrf (on /api/*)       ← Origin check for mutation verbs
├─ /api/health            GET
├─ /api/auth/request      POST  (rate-limited IP + email)
├─ /api/auth/verify       GET
├─ /api/auth/logout       POST
├─ /api/auth/me           GET
├─ /api/tree/:slug        GET (public) + POST/PATCH/PUT/DELETE (auth + role)
├─ /api/tree/:slug/people POST/PATCH/DELETE (editor+)
├─ /api/tree/:slug/stories POST (editor+)
├─ /api/tree/:slug/relations POST/DELETE (editor+)
├─ /api/tree/:slug/overrides PUT  ← MISSING AUTHZ (C1)
├─ /api/upload            POST (auth)
└─ /api/img/:key          GET (rate-limited)

D1 tables: users, sessions, auth_tokens, trees, tree_members, people, relations, stories, photos, lineages, lineage_members, position_overrides
R2: PHOTOS bucket (writes via /api/upload)
KV: KV_RL (rate-limit counters)
Email: CF Email Service binding
```

### After (post-refactor)

```
Worker (Hono)
├─ dbMiddleware
├─ securityHeaders (NEW — applies to every response)
├─ /api/health   GET
├─ /api/tree/:slug  GET only (public or 404 for now; is_public gate stays as a schema flag but all live trees are public)
└─ /api/img/:key  GET (rate-limited, with nosniff/Cache-Control/Content-Disposition)

D1 tables: users, trees, tree_members, people, relations, stories, photos, lineages, lineage_members, position_overrides
  - sessions/auth_tokens rows retained in schema.ts (dead) to keep migrations monotone; no code path reads or writes them.
R2: PHOTOS bucket — read-only for the worker; seeded externally via R2 CLI / seed-demo.ts uploading fixtures.
KV: KV_RL (only /api/img rate-limit remains)
No email binding.
```

### Net reduction

| Surface | Before | After | Δ |
|---|---|---|---|
| Routes | 11 | 3 | −8 |
| Middlewares | 3 + csrf | 2 | rem csrf + session |
| Frontend pages | 5 | 3 (drop Login, AuthVerify) | −2 |
| Worker secrets | `SESSION_SECRET` | none (runtime-only) | −1 |
| External bindings | D1 + R2 + KV + EMAIL | D1 + R2 + KV | −1 |
| Lines of code | ~2200 worker+frontend | ~1200 | ≈ −45% |

---

## Test specifications — write these FIRST

Per decision #7, these tests must exist as **failing** tests before implementation lands. They become the acceptance criteria.

### PR-1 regression tests

**Unit / integration (vitest):**

- `tests/integration/surface.test.ts` (new)
  - `GET /api/health` → 200 `{ok:true}`
  - `GET /api/auth/request` → 404 (route removed)
  - `POST /api/auth/request` → 404
  - `GET /api/auth/verify` → 404
  - `POST /api/auth/logout` → 404
  - `GET /api/auth/me` → 404
  - `POST /api/tree/:slug/people` → 404
  - `POST /api/upload` → 404
  - `PUT /api/tree/:slug/overrides` → 404
- `tests/integration/tree-read.test.ts` (refactor from existing tree-api.test.ts)
  - `GET /api/tree/demo-wongsuriya` → 200 with people + relations
  - `GET /api/tree/nonexistent` → 404
  - Anonymous request succeeds (no auth required)
- `tests/integration/img-read.test.ts` (refactor from existing upload.test.ts, minus upload half)
  - `GET /api/img/:key` → 200 when photo row exists
  - `GET /api/img/../secret` → 404 (no path traversal)
  - Response headers assertions (see PR-2)

**Deleted:**
- `tests/integration/auth.test.ts` — whole file removed
- `tests/integration/upload.test.ts` — whole file removed
- `tests/unit/tokens.test.ts` — whole file removed

### PR-2 regression tests

- `img.ts` rate-limiter uses only `cf-connecting-ip` (C3):
  - Test in `tests/integration/img-read.test.ts`: request with spoofed `x-forwarded-for: 9.9.9.9` and no `cf-connecting-ip` → falls into `unknown` bucket with aggressive cap
- `img.ts` atomic rate-limit (H3):
  - Concurrent burst test: 20 parallel requests → at most `limit + 1` succeed (documents current tolerance; upgrade to CAS would tighten)
- `tree.ts` `newId()` is crypto-random (H4):
  - `tests/unit/ids.test.ts` — assert `newId()` returns 26-char ULID shape; 10,000 invocations yield 10,000 distinct values
- `img.ts` response headers (H6):
  - Asserts `X-Content-Type-Options: nosniff`, `Content-Disposition: inline; filename="..."`, `Cache-Control: private, max-age=60`, `Vary: Cookie`
- `useTweaks.ts` postMessage removal (H9):
  - Vitest + jsdom test: mount component, change tweak, assert `window.parent.postMessage` is NOT called; listener no longer registered
- `worker-configuration.d.ts` is regenerated (H10):
  - Scripted grep in CI — fails if `R2_ACCESS_KEY_ID` appears
- Pre-commit hook blocking `dist/` (H11):
  - `tests/ci/precommit.test.sh` — stages `dist/noop.txt` and asserts hook exits non-zero
- npm audit CVEs:
  - CI step: `pnpm audit --prod` must return 0 vulnerabilities
  - CI step: `pnpm audit` high/critical count == 0 (moderates allowed only in devDeps with documented exception)

### PR-3 regression tests

- Security response headers (M15):
  - For every response, assert `Content-Security-Policy`, `X-Frame-Options: DENY` (or CSP `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security`
- `APP_URL` startup validation (M2):
  - Worker rejects `APP_URL=http://evil.com` at first request → 500 with log line
- `localStorage` shape validation (M13, M14):
  - `useTweaks.ts` + `TreeCanvas.tsx` tests: bad JSON in `localStorage` → falls back to defaults, doesn't crash
- `photos.object_key/mime/bytes` notNull (M9):
  - Drizzle migration test: inserting with `mime = null` fails
- CF ID scrub (M16):
  - CI grep: `grep -r "a24ce30584273b42" README.md instruction/` must be empty
- `.playwright-mcp/` gitignored (M17):
  - CI: `git check-ignore .playwright-mcp/foo` must succeed

### PR-4 regression tests

- `PersonInputSchema` strings bounded (L4):
  - **N/A** — PersonInputSchema is part of mutation routes deleted in PR-1; only remove from shared schema if unused
- Remaining L-items: case-by-case regression tests
- CI workflow (`.github/workflows/ci.yml`):
  - `typecheck`, `test`, `audit`, `build` all pass

---

## Implementation — by PR tier

### PR-1 — Login removal (P0) — resolves 20+ findings by deletion

**Branch:** `feat/remove-login-and-mutations`

**Resolves by deletion:** C1, C2, C4, C5, H1, H2, H7, H8 (partially), M1, M2 (partially), M3, M4, M5, M6, M7, M8, M12, L1, L3, L6, L7 — plus most of the rate-limit concerns (auth-side).

**Explicitly keeps as issues for PR-2:** C3, H3, H4, H5, H6, H9, H10, H11, M9, M13, M14, M15, M16, M17, M18, M19 + all npm audit items.

#### Work items

1. **Delete worker auth surface** (Sub-agent B1, Sonnet)
   - Delete `src/worker/routes/auth.ts`
   - Delete `src/worker/middleware/session.ts`
   - Delete `src/worker/middleware/csrf.ts`
   - Delete `src/worker/lib/tokens.ts`
   - Delete `src/worker/lib/email.ts`
   - Update `src/worker/index.ts`:
     - Remove auth route, csrf, sessionMiddleware
     - Remove imports
     - Keep `dbMiddleware` (db is still needed)
     - Keep `/api/health`
     - Mount only `treeRouter` (read-only) and `imgRouter`
   - Update `src/worker/types.ts`:
     - Remove `user` from `Variables`; remove `SESSION_SECRET`, `EMAIL`, `EMAIL_FROM`, `EMAIL_DEV_STUB` from `Env`

2. **Trim tree routes to read-only** (Sub-agent B2, Sonnet)
   - In `src/worker/routes/tree.ts`:
     - Keep `GET /:slug` (public read)
     - **Delete:** `POST /`, `PATCH /:slug`, `POST /:slug/people`, `PATCH /:slug/people/:id`, `DELETE /:slug/people/:id`, `POST /:slug/relations`, `DELETE /:slug/relations/:id`, `POST /:slug/stories`, `PUT /:slug/overrides`
     - Delete helpers: `getTreeRole`, `hasRole`, `newId` (keep in a separate util if reused by seed scripts)
     - Remove `requireAuth` import
     - `tree-query.ts` — keep, it's read-only
   - Update `src/shared/schemas.ts`:
     - Delete `PersonInputSchema`, `StoryInputSchema`, `RelationInputSchema`, `PositionOverridesInputSchema` (all were mutation-only)
     - Keep any read-schema types that are used by the frontend

3. **Delete upload route** (Sub-agent B3, Sonnet)
   - Delete `src/worker/routes/upload.ts`
   - Remove from `src/worker/index.ts`
   - `src/worker/routes/img.ts` stays (read-only)

4. **Delete frontend auth + mutation UI** (Sub-agent C1, Sonnet)
   - Delete `src/app/pages/Login.tsx`
   - Delete `src/app/pages/AuthVerify.tsx`
   - Delete `src/app/hooks/useSession.ts`
   - Delete `src/app/hooks/useUpload.ts`
   - Update `src/app/App.tsx`:
     - Remove `/login` and `/auth/verify` routes
     - Remove any auth-conditional rendering
   - Update `src/app/pages/Landing.tsx`:
     - Remove any "login" CTA; keep "view demo"
   - Update `src/app/pages/TreeView.tsx`:
     - Remove any edit UI (if present); pure read-only view
     - On 404 / network error, show graceful "tree not found" state
   - Update `src/app/lib/api.ts`:
     - Delete `login()`, `logout()`, `me()`, `uploadPhoto()`, `createPerson()`, etc.
     - Keep `getTree()`, `getImg()` equivalents

5. **Update config** (Sub-agent D1, Sonnet)
   - Edit `wrangler.jsonc`:
     - Remove `send_email` section
     - Remove any env var that referenced auth
   - Edit `.dev.vars.example`:
     - Remove `SESSION_SECRET`, `EMAIL_DEV_STUB`, R2_* lines (already flagged stale by H10)
   - Run `pnpm cf-typegen` to regenerate `worker-configuration.d.ts`
   - Commit the regenerated file

6. **Rewrite tests** (Sub-agent T1, Sonnet — blocked by 1–5)
   - Delete `tests/integration/auth.test.ts`, `tests/integration/upload.test.ts`
   - Delete `tests/unit/tokens.test.ts`
   - Refactor `tests/integration/tree-api.test.ts` → `tests/integration/tree-read.test.ts` (only GET tests)
   - New `tests/integration/surface.test.ts` — assert every deleted route returns 404
   - Update `tests/helpers/mock-env.ts` to drop auth bindings

7. **Update documentation** (Main agent, after 1–6 merge locally)
   - Update `README.md` to reflect read-only posture
   - Delete stale auth instructions
   - Update `CLAUDE.md` if it referenced auth flows
   - Scrub CF IDs from public docs (M16)

**Blockers / dependencies inside PR-1:** items 1–5 are file-disjoint and can run in parallel. Item 6 blocks on 1–5. Item 7 runs last.

**Exit criteria:**
- `pnpm typecheck` clean
- `pnpm test` green (reduced suite)
- Manual Playwright MCP smoke: landing + demo tree viewer + a lineage page render without errors
- All route-404 assertions pass
- No import of deleted modules remains (CI grep)

---

### PR-2 — Remaining security fixes + npm audit (P1)

**Branch:** `feat/security-hardening-p1`
**Prereq:** PR-1 merged to `main`.

**Resolves:** C3, H3, H4, H5, H6, H9, H10, H11 + all npm audit findings.

#### Work items (all runnable in parallel across sub-agents)

1. **`img.ts` — fix IP trust + atomicity + headers** (Sub-agent B1, Opus — security-critical)
   - `getClientIp` in `img.ts`: drop `x-forwarded-for` fallback; on missing `cf-connecting-ip` bucket under literal `'unknown'` with a stricter cap (e.g. `limit / 4`)
   - Replace read-modify-write with:
     - **Option A (chosen):** keep KV but document known race; add a secondary hard cap via a per-tree bucket to bound worst-case
     - **Option B (stretch):** behind a flag, pipe through a Durable Object — not required for P1
   - Response headers:
     - `X-Content-Type-Options: nosniff`
     - `Content-Disposition: inline; filename="<sanitized>"` — sanitize filename by stripping `/\`, control chars
     - `Cache-Control: private, max-age=60`
     - `Vary: Cookie` (defensive even without cookies)
   - Regression tests in `tests/integration/img-read.test.ts`

2. **Seeded IDs (H4)** (Sub-agent B2, Sonnet)
   - If any `newId()` remains used by seed scripts / seed-demo, replace with `crypto.randomUUID()` or import `ulidLite` from a new `src/worker/lib/ids.ts`
   - Add `tests/unit/ids.test.ts` — uniqueness over 10k draws

3. **R2 key prefix (H5)** (Sub-agent B3, Sonnet)
   - `src/worker/routes/img.ts` + `scripts/seed-demo.ts`: adopt `photos/${treeId}/${personId}/${ulid}.${ext}`
   - Update regex that validates keys
   - If legacy keys exist in R2, write a one-shot migration script `scripts/r2-rekey.ts` OR wipe demo R2 and re-seed (demo only, safe)

4. **`useTweaks.ts` — remove postMessage + add shape validation** (Sub-agent C1, Sonnet)
   - Delete `window.parent.postMessage(_, '*')` calls
   - Delete or gate the listener (remove entirely — nothing listens anymore)
   - Add a Zod schema for `Tweaks` in the same file; validate `localStorage` read and `window.TWEAK_DEFAULTS` before use (addresses M13/M14 early)
   - Regression tests via vitest+jsdom

5. **Pre-commit hook (H11)** (Sub-agent D1, Sonnet)
   - Add `.husky/pre-commit` that runs a short script:
     ```sh
     if git diff --cached --name-only | grep -E '^(dist|\.wrangler|\.playwright-mcp)/'; then
       echo "Refusing to commit build/dev artefacts"; exit 1
     fi
     ```
   - Add `husky` + `lint-staged` (or a lighter custom setup) to `package.json`
   - Document in README

6. **Dep upgrades — npm audit fixes** (Sub-agent D2, Sonnet — must run solo; touches lockfile)
   - Upgrade `drizzle-orm` → `^0.45.2` (per CVE-2026-39356). Verify:
     - `onConflictDoUpdate` API unchanged
     - `.batch()` unchanged
     - `.get()` single-row unchanged
     - `sql` / `eq` / `and` / `isNull` / `gt` / `inArray` unchanged
     - Drizzle-Kit `generate` still emits compatible migrations (run `pnpm db:generate --dry-run` if supported; else compare snapshot)
   - Upgrade `drizzle-kit` to latest compatible
   - Upgrade `vitest` to latest v3 → pulls modern `vite` (≥ 6.4.2) transitively (per CVE-2026-39365)
   - If `esbuild` still flagged: add `pnpm.overrides` pinning `esbuild` to `>=0.25.0`
   - Run `pnpm install`, `pnpm audit`, `pnpm typecheck`, `pnpm test` — all must pass

7. **`worker-configuration.d.ts` regen (H10)** (Sub-agent D3, Sonnet)
   - If not already done in PR-1, run `pnpm cf-typegen` now
   - Commit with message noting that stale R2 bindings are gone
   - Add a `typecheck:envs` script / CI step that fails if `R2_ACCESS_KEY_ID` appears in the types

**Exit criteria:**
- `pnpm audit --prod` → 0 vulns of any severity
- `pnpm audit` → 0 high/critical (moderates only in devDeps with documented justification)
- All PR-2 regression tests green
- Playwright MCP: re-verify `/demo/wongsuriya` photo rendering works (nosniff+Content-Disposition path)

---

### PR-3 — Defense-in-depth (P2)

**Branch:** `feat/security-hardening-p2`
**Prereq:** PR-2 merged.

**Resolves:** M9, M11, M13, M14, M15, M16, M17, M18, M19 + anything surfaced during PR-2 regression.

#### Work items

1. **Security response headers middleware (M15)** (Sub-agent B1, Opus)
   - New file `src/worker/middleware/security-headers.ts` — Hono middleware that sets:
     ```
     Content-Security-Policy: default-src 'self'; img-src 'self' blob: data:; font-src 'self' fonts.gstatic.com; style-src 'self' 'unsafe-inline' fonts.googleapis.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none';
     X-Content-Type-Options: nosniff
     Referrer-Policy: strict-origin-when-cross-origin
     Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
     ```
   - Mount in `index.ts` as the outermost middleware
   - Integration test asserting headers on `/api/health` and on a non-API path through the ASSETS fetch (via a small proxy shim)

2. **APP_URL startup validation (M2)** (Sub-agent B2, Sonnet)
   - Add `assertConfig(env)` call at first request; throws if `APP_URL` doesn't start with `https://` in prod or doesn't parse as a URL
   - Regression test: mock env with bad URL → 500

3. **Frontend shape validation (M13, M14)** (Sub-agent C1, Sonnet)
   - Add `src/app/lib/storage.ts` with typed read helpers that Zod-validate before returning
   - Refactor `useTweaks.ts`, `TreeCanvas.tsx` to use it
   - Tests

4. **Frontend graceful 404 / read-only notice (M11)** (Sub-agent C2, Sonnet)
   - `TreeView.tsx` — on `fetch` error, show a friendly read-only message with a back-to-demo link

5. **Schema tighten (M9)** (Sub-agent A1, Sonnet — must run solo; touches migrations)
   - `src/db/schema.ts` — `object_key`, `mime`, `bytes` → `notNull()`
   - `pnpm db:generate` → new drizzle migration file
   - Add a migration-apply test that exercises the non-null constraint

6. **Repo scrubs (M16, M17)** (Sub-agent D1, Sonnet)
   - `.gitignore` → add `.playwright-mcp/`, `drizzle/seed.sql` (L9)
   - Scrub CF IDs from `README.md` and `instruction/` — replace with placeholders; the values still live in `wrangler.jsonc` (required by wrangler) and in `.dev.vars.example` as comments only

7. **seed-demo remote guard (M18)** (Sub-agent D2, Sonnet)
   - `scripts/seed-demo.ts` — when `--remote` flag is set, require `CONFIRM=yes` env var OR interactive y/N prompt; abort otherwise

**Exit criteria:**
- PR-3 regression tests green
- Manual curl on `/api/health` → shows all security headers
- `.gitignore` grep check passes

---

### PR-4 — Lows, docs, CI (P3)

**Branch:** `feat/security-hardening-p3`
**Prereq:** PR-3 merged.

**Resolves:** L-series, CI setup, residual docs.

#### Work items

1. **GitHub Actions CI** (Sub-agent D1, Sonnet)
   - `.github/workflows/ci.yml`:
     - Triggers: `pull_request`, `push to main`
     - Steps: checkout → pnpm install --frozen-lockfile → `pnpm typecheck` → `pnpm test` → `pnpm audit --prod` (fail on any) → `wrangler deploy --dry-run`
   - `.github/workflows/deploy.yml` (optional, manual dispatch) — wraps `pnpm deploy` with a required approval env

2. **L-series items** (Sub-agent B1, Sonnet — batch)
   - L2 `Number(relId)` → removed (mutation route deleted)
   - L4 string maxlen → removed (schemas deleted)
   - L5 credentials:'include' — document invariant in a comment in `src/app/lib/api.ts`
   - L8 compatibility_date — add a comment explaining why it's pinned
   - L9 seed.sql gitignore — done in PR-3
   - L10 img rate-limit double-read — address inside PR-2's img.ts changes; confirm here

3. **Docs sweep** (Main agent)
   - Update `README.md` — describe current read-only posture, remove references to login
   - Add `SECURITY.md` — responsible-disclosure note and link to `instruction/security-review.md`
   - Update `CLAUDE.md` only if truly stale; leave unchanged otherwise

---

## Security considerations

### What the refactor does NOT fix

- **Physical / logical access to the demo:** the demo tree is intentionally world-readable. If we want stronger access control later, it must come back with a new auth design.
- **Cloudflare account compromise:** still the ultimate blast-radius. Out of scope for code audit; flagged for operator.
- **Supply-chain attack post-merge:** `pnpm audit` in CI catches known CVEs only. Consider adding a Dependabot / Renovate config as a future task.

### New risks introduced by the refactor

- **All trees become effectively public.** The D1 `is_public` column is now dead flag-wise; any private row would be inaccessible (no route to read it). This is safe, but document clearly to avoid future confusion.
- **No per-user rate-limit means a single IP could hammer `/api/tree/:slug` or `/api/img`.** Mitigated by the `img.ts` IP-based limiter and by Cloudflare's free-tier DDoS protection. Escalation path: enable CF Rate Limiting rules at the edge.
- **drizzle-orm upgrade (H4 + audit):** potential for subtle behavior changes in D1 dialect. Mitigation: run full integration suite + manual Playwright before merging PR-2.

### Threat model after remediation

| Threat | Mitigation | Residual risk |
|---|---|---|
| DoS via `/api/img` flood | IP-bucketed KV limiter + CF edge | Rate-limit race (tolerated per H3) |
| XSS via photo content-type | `nosniff` + magic-byte validation **on upload side (removed)** so only seeded photos; tighten by storing known MIME at seed time | Low |
| Supply-chain (dep) | CI `pnpm audit --prod` gate | Zero-days between CI runs |
| Information disclosure via `/api/tree` | All trees public by design | Acceptable |
| CSRF | N/A — no state-changing endpoints | None |
| Secrets leak | `.gitignore` + pre-commit hook + CI grep | Human error on `git add -A` blocked |
| Stolen session | N/A — no sessions | None |

---

## Dependency risk analysis

| Upgrade | Delta | Risk | Mitigation |
|---|---|---|---|
| drizzle-orm 0.36 → 0.45 | 9 minor versions | **Medium** — API stable for our patterns, but subtle behavior changes possible (e.g. dialect-specific returning types) | Run full test suite, compare snapshot vs. prod-verified screenshots before PR-2 merge |
| drizzle-kit | minor bump | Low | Regenerate migrations, commit diff separately if any |
| vitest 2 → 3 | major | Low-Medium — APIs stable, but reporter / config tweaks possible | Keep `vitest.config.ts` minimal; only bump if v3 is required to pull vite ≥ 6.4.2, otherwise stay on 2.x with `pnpm overrides` on vite |
| esbuild transitive | patch | Low | `pnpm overrides` if indirect upgrades don't cover it |

---

## Parallel execution design

```
PR-1 (all sub-tasks in parallel):
  B1: delete auth worker routes & middleware
  B2: trim tree routes to read-only
  B3: delete upload route
  C1: delete frontend auth + mutation UI
  D1: update config (wrangler, .dev.vars.example, cf-typegen)
      ↓
  T1: refactor tests (blocks on B1+B2+B3+C1)
      ↓
  Main: docs sweep, final verification

PR-2 (all in parallel except D2 which holds the lockfile lock):
  B1 (Opus): img.ts security (IP, headers, docs race)
  B2 (Sonnet): ID generation
  B3 (Sonnet): R2 key prefix
  C1 (Sonnet): frontend postMessage removal + storage validation
  D1 (Sonnet): pre-commit hook
  D3 (Sonnet): cf-typegen
  D2 (Sonnet, solo): dep upgrades — runs alone, last, to own the lockfile

PR-3 (all in parallel except A1 which holds migrations):
  B1 (Opus): security-headers middleware
  B2 (Sonnet): APP_URL validation
  C1 (Sonnet): frontend shape validation
  C2 (Sonnet): graceful 404 UI
  D1 (Sonnet): gitignore + CF ID scrubs
  D2 (Sonnet): seed-demo remote guard
  A1 (Sonnet, solo): schema notNull + migration

PR-4 (mostly sequential):
  D1: CI workflows
  B1: L-series batch
  Main: docs + SECURITY.md
```

**File-lock rules:**
- `package.json` / `pnpm-lock.yaml` → only D2 in PR-2
- `drizzle/migrations/**` / `src/db/schema.ts` → only A1 in PR-3
- `src/worker/index.ts` → single owner per PR (B1 in PR-1 and PR-3)
- `wrangler.jsonc` → single owner per PR (D1 in PR-1)

---

## Rollback plan

- **PR-1 rollback:** revert merge commit. No data loss — tables retained. Users who were in-session at cutover lose their sessions, which is intended.
- **PR-2 drizzle upgrade rollback:** revert the dep-upgrade commit separately from other PR-2 commits (keep it as an isolated commit) so it can be reverted without losing the img/header fixes.
- **PR-3 headers rollback:** if a header breaks Google Fonts or the SPA, relax the CSP `font-src`/`style-src` before reverting entirely.
- **PR-4 CI rollback:** disable the workflow via GitHub UI if flaky, revert later.

---

## Review gates

Each PR must be approved by the **main agent (Opus)** acting as security reviewer before it can merge. For PR-1 and PR-2, a second review pass by a security-focused sub-agent (Opus) is required because both touch sensitive code paths.

A final **end-of-engagement audit** re-runs the static security-review methodology (same 4-agent topology as in `instruction/security-review.md`) against the post-PR-4 codebase; its report lands as `instruction/security-review-post-remediation.md`.

---

## Deferred / future tasks (not in this plan)

- Reintroduce login with request-bound magic-link or OAuth (explicitly deferred by user)
- Durable-Object rate-limiter (flagged in H3)
- Self-host Google Fonts (Informational)
- Dependabot / Renovate config (extension of PR-4 CI work)
- Observability review: ensure `observability: enabled: true` doesn't log PII
- Stretch: add route-level automated security tests (e.g. per-endpoint CSP assertion)
