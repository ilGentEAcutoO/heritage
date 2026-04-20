# Active Tasks — Security Remediation & Login Removal

> Last updated: 2026-04-20 09:55 (+07)
> Plan: `./plan.md`
> Requirements: `./requirements.md`

Legend: ⚪ pending · 🔵 in_progress · ✅ tested · 🟢 completed · 🔴 blocked · ⚫ deleted

---

## Meta

### TASK-000: Archive prior build artefacts
- Status: 🟢 completed (2026-04-20 09:49)
- Owner: main
- Notes: `instruction/work/{plan,todos,requirements}.md` moved to `instruction/archive/01-heritage-initial-build/`.

---

## PR-1 — Login removal (P0)

> Branch: `feat/remove-login-and-mutations`
> Goal: delete the entire auth surface + auth-gated mutation surface. Resolves 20+ security-review findings by deletion.
> PR acceptance criteria: see `plan.md` § PR-1 Exit criteria.

### TASK-101: Delete worker auth routes & middleware
- Status: ⚪ pending
- Owner: Sub-agent B1 (Sonnet 4.6)
- Files: `src/worker/routes/auth.ts`, `src/worker/middleware/session.ts`, `src/worker/middleware/csrf.ts`, `src/worker/lib/tokens.ts`, `src/worker/lib/email.ts`, `src/worker/index.ts`, `src/worker/types.ts`
- Sub-tasks:
  - [ ] Delete `src/worker/routes/auth.ts`
  - [ ] Delete `src/worker/middleware/session.ts`
  - [ ] Delete `src/worker/middleware/csrf.ts`
  - [ ] Delete `src/worker/lib/tokens.ts`
  - [ ] Delete `src/worker/lib/email.ts`
  - [ ] Edit `src/worker/index.ts` — remove imports, middleware, routes; keep `dbMiddleware`, `/api/health`, mount `tree` (read-only) + `img`
  - [ ] Edit `src/worker/types.ts` — drop `user` from `Variables`; drop `SESSION_SECRET`, `EMAIL`, `EMAIL_FROM`, `EMAIL_DEV_STUB` from `Env`
  - [ ] `pnpm typecheck` green
- Resolves: C5, H1, H2, M1, M3, M4, M5, L1 (all via deletion)
- Dependencies: none

### TASK-102: Trim tree routes to read-only
- Status: ⚪ pending
- Owner: Sub-agent B2 (Sonnet 4.6)
- Files: `src/worker/routes/tree.ts`, `src/shared/schemas.ts`
- Sub-tasks:
  - [ ] Keep only `GET /:slug` in `tree.ts`
  - [ ] Delete `POST /`, `PATCH /:slug`, and all people/relations/stories/overrides mutation routes
  - [ ] Delete helpers `getTreeRole`, `hasRole`, `newId`, `requireAuth` import
  - [ ] Delete mutation-only schemas: `PersonInputSchema`, `StoryInputSchema`, `RelationInputSchema`, `PositionOverridesInputSchema`
  - [ ] `pnpm typecheck` green
- Resolves: C1, C2, C4, H4 (partial), H7, H8, L2, L4 (all via deletion)
- Dependencies: TASK-101 (needs updated index.ts shape)

### TASK-103: Delete upload route
- Status: ⚪ pending
- Owner: Sub-agent B3 (Sonnet 4.6)
- Files: `src/worker/routes/upload.ts`, `src/worker/index.ts`
- Sub-tasks:
  - [ ] Delete `src/worker/routes/upload.ts`
  - [ ] Ensure `src/worker/index.ts` no longer imports/mounts it
  - [ ] `pnpm typecheck` green
- Resolves: H5 (partial), M6, M7, L3, L6 (all via deletion)
- Dependencies: TASK-101 (for index.ts)

### TASK-104: Delete frontend auth + mutation UI
- Status: ⚪ pending
- Owner: Sub-agent C1 (Sonnet 4.6)
- Files: `src/app/pages/Login.tsx`, `src/app/pages/AuthVerify.tsx`, `src/app/hooks/useSession.ts`, `src/app/hooks/useUpload.ts`, `src/app/App.tsx`, `src/app/pages/Landing.tsx`, `src/app/pages/TreeView.tsx`, `src/app/lib/api.ts`
- Sub-tasks:
  - [ ] Delete `src/app/pages/Login.tsx` + `AuthVerify.tsx`
  - [ ] Delete `src/app/hooks/useSession.ts` + `useUpload.ts`
  - [ ] Edit `App.tsx` — remove `/login`, `/auth/verify` routes
  - [ ] Edit `Landing.tsx` — remove login CTA; keep demo
  - [ ] Edit `TreeView.tsx` — remove any edit UI; pure read-only
  - [ ] Edit `src/app/lib/api.ts` — delete `login`, `logout`, `me`, `uploadPhoto`, mutation helpers; keep reads
  - [ ] `pnpm typecheck` green
- Resolves: M12 (via deletion), part of M11 (UI now read-only)
- Dependencies: none (file-disjoint from B1/B2/B3)

### TASK-105: Update wrangler/dev-vars config and regenerate types
- Status: ⚪ pending
- Owner: Sub-agent D1 (Sonnet 4.6)
- Files: `wrangler.jsonc`, `.dev.vars.example`, `worker-configuration.d.ts`
- Sub-tasks:
  - [ ] Remove `send_email` from `wrangler.jsonc`
  - [ ] Remove any vars that referenced auth (`EMAIL_FROM`, `EMAIL_DEV_STUB`)
  - [ ] Edit `.dev.vars.example` — drop `SESSION_SECRET`, `EMAIL_DEV_STUB`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
  - [ ] Run `pnpm cf-typegen` and commit regenerated `worker-configuration.d.ts`
  - [ ] Grep check: no `R2_ACCESS_KEY_ID` or `SESSION_SECRET` appears in committed types
- Resolves: H10
- Dependencies: none (can run in parallel with 101–104)

### TASK-106: Refactor and trim test suite
- Status: ⚪ pending
- Owner: Sub-agent T1 (Sonnet 4.6)
- Files: `tests/integration/auth.test.ts` (delete), `tests/integration/upload.test.ts` (delete), `tests/unit/tokens.test.ts` (delete), `tests/integration/tree-api.test.ts` → `tree-read.test.ts`, `tests/integration/surface.test.ts` (new), `tests/integration/img-read.test.ts` (new), `tests/helpers/mock-env.ts`
- Sub-tasks:
  - [ ] Delete `tests/integration/auth.test.ts`
  - [ ] Delete `tests/integration/upload.test.ts`
  - [ ] Delete `tests/unit/tokens.test.ts`
  - [ ] Rename/trim `tree-api.test.ts` → `tree-read.test.ts` — only GET tests
  - [ ] Create `tests/integration/surface.test.ts` — assert 404 on every deleted route
  - [ ] Create `tests/integration/img-read.test.ts` — happy path + path-traversal negative
  - [ ] Update `tests/helpers/mock-env.ts` — drop auth bindings, email
  - [ ] `pnpm test` green
- Dependencies: TASK-101, TASK-102, TASK-103, TASK-104, TASK-105

### TASK-107: PR-1 final verification + docs
- Status: ⚪ pending
- Owner: Main agent (Opus)
- Files: `README.md`, `CLAUDE.md`, other docs
- Sub-tasks:
  - [ ] Update `README.md` to reflect read-only posture
  - [ ] Remove auth references from `CLAUDE.md` if any
  - [ ] Scrub CF IDs from README (move to wrangler.jsonc only) — addresses M16 early
  - [ ] Playwright MCP smoke: landing + demo tree + lineage view render cleanly
  - [ ] Open PR `feat/remove-login-and-mutations`
- Dependencies: TASK-106

---

## PR-2 — Remaining security + npm audit (P1)

> Branch: `feat/security-hardening-p1`
> Goal: patch read-only surface; resolve all npm audit CVEs.
> Prereq: PR-1 merged to `main`.

### TASK-201: Harden `img.ts` — IP trust, atomicity, response headers
- Status: ⚪ pending · 🔒 P1 blocker
- Owner: Sub-agent B1 (Opus 4.6 — security-critical)
- Files: `src/worker/routes/img.ts`, `tests/integration/img-read.test.ts`
- Sub-tasks (test-first):
  - [ ] Write failing test: spoofed `x-forwarded-for` doesn't bypass limiter
  - [ ] Write failing test: response includes `X-Content-Type-Options: nosniff`, `Content-Disposition: inline; filename=...`, `Cache-Control: private, max-age=60`, `Vary: Cookie`
  - [ ] Write failing test: burst of 20 concurrent → documented at-most-(limit+1) outcome
  - [ ] Implement: drop `x-forwarded-for` fallback in `getClientIp`; `'unknown'` bucket with `limit/4`
  - [ ] Implement: set response headers listed above; sanitize filename (strip `/\`, control chars)
  - [ ] Implement: add secondary per-tree hard cap
  - [ ] All new tests pass
- Resolves: C3, H3, H6, M19, L10
- Dependencies: none (first PR-2 task)

### TASK-202: Crypto-random ID generator
- Status: ⚪ pending
- Owner: Sub-agent B2 (Sonnet 4.6)
- Files: `src/worker/lib/ids.ts` (new), `scripts/seed-demo.ts`, `tests/unit/ids.test.ts` (new)
- Sub-tasks (test-first):
  - [ ] Write failing test: 10k `newId()` calls yield 10k distinct ULID-shaped values
  - [ ] Implement `newId` backed by `crypto.randomUUID()` or `ulidLite` using `crypto.getRandomValues`
  - [ ] Replace any remaining usage (seed-demo, anywhere else) with this import
  - [ ] Delete old `Math.random` helper if still present
- Resolves: H4
- Dependencies: none

### TASK-203: R2 key prefix includes tree id
- Status: ⚪ pending
- Owner: Sub-agent B3 (Sonnet 4.6)
- Files: `scripts/seed-demo.ts`, `src/worker/routes/img.ts`, `drizzle/seed.sql` (regen)
- Sub-tasks (test-first):
  - [ ] Write failing test: `img.ts` regex rejects old-format keys missing `treeId`
  - [ ] Implement new R2 key shape `photos/${treeId}/${personId}/${ulid}.${ext}`
  - [ ] Update regex in `img.ts`
  - [ ] Re-seed R2 with new layout (demo only — safe to wipe)
  - [ ] All tests green
- Resolves: H5
- Dependencies: TASK-202 (uses new id helper)

### TASK-204: Remove wildcard postMessage + validate storage in `useTweaks`
- Status: ⚪ pending
- Owner: Sub-agent C1 (Sonnet 4.6)
- Files: `src/app/hooks/useTweaks.ts`, `tests/unit/useTweaks.test.ts` (new if missing)
- Sub-tasks (test-first):
  - [ ] Write failing test: toggling a tweak does NOT call `window.parent.postMessage`; no `message` listener is installed
  - [ ] Write failing test: malformed `localStorage['heritage-tweaks']` JSON → falls back to defaults
  - [ ] Write failing test: `window.TWEAK_DEFAULTS = { theme: '<script>' }` → rejected, defaults applied
  - [ ] Implement: delete both postMessage call sites
  - [ ] Implement: delete or gate the incoming `message` listener
  - [ ] Implement: Zod schema `TweaksSchema`; parse localStorage + `window.TWEAK_DEFAULTS` before use
- Resolves: H9, M14, partial M13
- Dependencies: none

### TASK-205: Pre-commit hook blocking build/dev artefacts
- Status: ⚪ pending
- Owner: Sub-agent D1 (Sonnet 4.6)
- Files: `.husky/pre-commit`, `package.json`
- Sub-tasks:
  - [ ] Add `husky` as devDependency (or use a lightweight custom git hook)
  - [ ] `.husky/pre-commit` refuses staged paths under `dist/`, `.wrangler/`, `.playwright-mcp/`
  - [ ] Test: stage a file under each blocked dir → hook exits non-zero
  - [ ] Document in README
- Resolves: H11, part of M17
- Dependencies: none

### TASK-206: Dep upgrades — drizzle, vitest/vite, esbuild
- Status: ⚪ pending · 🔒 must run solo (owns lockfile)
- Owner: Sub-agent D2 (Sonnet 4.6)
- Files: `package.json`, `pnpm-lock.yaml`
- Sub-tasks:
  - [ ] `pnpm up drizzle-orm@^0.45` + smoke-test `onConflictDoUpdate`, `.batch`, `.get`, `sql`, `eq/and/isNull/gt/inArray`
  - [ ] `pnpm up drizzle-kit@latest`; run `pnpm db:generate` dry-run; snapshot diff
  - [ ] `pnpm up vitest@latest` — pulls modern `vite`
  - [ ] `pnpm audit --prod` → 0
  - [ ] `pnpm audit` → 0 high/critical
  - [ ] If esbuild still flagged: `pnpm.overrides.esbuild >= 0.25.0`
  - [ ] `pnpm typecheck` green
  - [ ] `pnpm test` green (existing trimmed suite from PR-1)
  - [ ] Commit lockfile + package.json together
- Resolves: drizzle-orm CVE-2026-39356, vite CVE-2026-39365, esbuild GHSA-67mh-4wv8-2f99
- Dependencies: TASK-201..205 (so lockfile commit lands cleanly last)

### TASK-207: PR-2 final verification
- Status: ⚪ pending
- Owner: Main agent (Opus)
- Sub-tasks:
  - [ ] Review each PR-2 commit against test acceptance criteria
  - [ ] Playwright MCP: demo tree photos still render; headers visible via DevTools
  - [ ] Open PR `feat/security-hardening-p1`
- Dependencies: TASK-206

---

## PR-3 — Defense in depth (P2)

> Branch: `feat/security-hardening-p2`
> Prereq: PR-2 merged.

### TASK-301: Security-headers middleware
- Status: ⚪ pending
- Owner: Sub-agent B1 (Opus 4.6)
- Files: `src/worker/middleware/security-headers.ts` (new), `src/worker/index.ts`, `tests/integration/security-headers.test.ts` (new)
- Sub-tasks (test-first):
  - [ ] Failing test: `/api/health` response carries `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`, `X-Frame-Options` (or CSP `frame-ancestors 'none'`)
  - [ ] Implement middleware; mount as outermost in `index.ts`
- Resolves: M15
- Dependencies: none

### TASK-302: APP_URL startup validation
- Status: ⚪ pending
- Owner: Sub-agent B2 (Sonnet 4.6)
- Files: `src/worker/index.ts` (or new `src/worker/lib/config.ts`), tests
- Sub-tasks (test-first):
  - [ ] Failing test: mocked env with `APP_URL=http://bad` → first request returns 500
  - [ ] Implement `assertConfig(env)` — require `https://` prefix, valid URL shape
- Resolves: M2
- Dependencies: none

### TASK-303: Frontend storage shape validation
- Status: ⚪ pending
- Owner: Sub-agent C1 (Sonnet 4.6)
- Files: `src/app/lib/storage.ts` (new), refactor `useTweaks.ts`, `TreeCanvas.tsx`
- Sub-tasks (test-first):
  - [ ] Failing test: bad JSON in `heritage-node-overrides` → ignored, app still renders
  - [ ] Implement typed `readLocal<T>(key, schema)` helper
  - [ ] Refactor consumers
- Resolves: M13
- Dependencies: TASK-204 (don't conflict on `useTweaks.ts`)

### TASK-304: Graceful 404 / read-only notice
- Status: ⚪ pending
- Owner: Sub-agent C2 (Sonnet 4.6)
- Files: `src/app/pages/TreeView.tsx`, related components
- Sub-tasks (test-first):
  - [ ] Failing test: `fetch('/api/tree/nope')` → 404 → UI shows friendly message with link to demo
  - [ ] Implement
- Resolves: M11
- Dependencies: none

### TASK-305: Schema notNull tighten + migration
- Status: ⚪ pending · 🔒 must run solo (owns migrations)
- Owner: Sub-agent A1 (Sonnet 4.6)
- Files: `src/db/schema.ts`, `drizzle/migrations/*`
- Sub-tasks (test-first):
  - [ ] Failing test: drizzle insert with `mime: null` → throws
  - [ ] Edit schema: `photos.object_key/mime/bytes` → `.notNull()`
  - [ ] Run `pnpm db:generate` — commit new migration
  - [ ] `pnpm db:migrate:local` — assert it applies
- Resolves: M9
- Dependencies: TASK-301..304 (don't conflict on test files, but holds migrations)

### TASK-306: Gitignore + CF ID scrub + seed-demo guard
- Status: ⚪ pending
- Owner: Sub-agent D1 (Sonnet 4.6)
- Files: `.gitignore`, `README.md`, `scripts/seed-demo.ts`
- Sub-tasks:
  - [ ] `.gitignore` — add `.playwright-mcp/`, `drizzle/seed.sql`, `*.tsbuildinfo`
  - [ ] `README.md` — replace account/database/KV IDs with `<see wrangler.jsonc>` placeholders
  - [ ] `scripts/seed-demo.ts` — when `--remote` passed, require `CONFIRM=yes` env or interactive y/N
  - [ ] CI grep check `.github/workflows/ci.yml` (added in PR-4) will enforce no CF IDs in docs
- Resolves: M16, M17, M18, L9
- Dependencies: none

### TASK-307: PR-3 final verification
- Status: ⚪ pending
- Owner: Main agent (Opus)
- Sub-tasks:
  - [ ] Manual curl `/api/health` + `/api/img/:key` — verify headers
  - [ ] Open PR `feat/security-hardening-p2`
- Dependencies: TASK-301..306

---

## PR-4 — Lows, CI, docs (P3)

> Branch: `feat/security-hardening-p3`
> Prereq: PR-3 merged.

### TASK-401: GitHub Actions CI workflow
- Status: ⚪ pending
- Owner: Sub-agent D1 (Sonnet 4.6)
- Files: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml` (optional)
- Sub-tasks:
  - [ ] `ci.yml` on `pull_request` + `push to main`: checkout → `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm test` → `pnpm audit --prod` (fail on any) → `wrangler deploy --dry-run`
  - [ ] Add grep step: fails if CF IDs appear in `README.md` or `instruction/`
  - [ ] Add grep step: fails if `SESSION_SECRET` or `R2_ACCESS_KEY_ID` appears in `worker-configuration.d.ts`
  - [ ] (Optional) `deploy.yml` — manual dispatch; requires approval env
- Resolves: Informational items; also future-proofs against regressions
- Dependencies: none

### TASK-402: L-series cleanup batch
- Status: ⚪ pending
- Owner: Sub-agent B1 (Sonnet 4.6)
- Sub-tasks:
  - [ ] L5: add comment-guard in `src/app/lib/api.ts` explaining `credentials: 'include'` invariant
  - [ ] L8: add comment in `wrangler.jsonc` explaining pinned `compatibility_date`
  - [ ] Confirm L2, L4, L6, L7, L9 are resolved (most by deletion in PR-1/PR-3)
  - [ ] Add a one-line rationale in `instruction/security-review.md` for any deferred Low
- Dependencies: none

### TASK-403: Documentation sweep + SECURITY.md
- Status: ⚪ pending
- Owner: Main agent (Opus)
- Files: `README.md`, `SECURITY.md` (new)
- Sub-tasks:
  - [ ] `README.md` — describe current read-only posture, remove login references, add "threat model & scope" section linking to `instruction/security-review.md` and `security-review-post-remediation.md`
  - [ ] `SECURITY.md` — responsible disclosure + threat-model summary + supported versions
  - [ ] Update `CLAUDE.md` only if something is stale
- Dependencies: TASK-401, TASK-402

### TASK-404: Post-remediation audit
- Status: ⚪ pending
- Owner: Main agent dispatches 4 sub-agents (same topology as `instruction/security-review.md`)
- Files: `instruction/security-review-post-remediation.md` (new)
- Sub-tasks:
  - [ ] Dispatch auth/API/frontend/config audits in parallel (expect shorter reports given surface reduction)
  - [ ] Synthesize into post-remediation report
  - [ ] Confirm every original finding is either fixed, obsolete, or explicitly deferred
  - [ ] Open PR `feat/security-hardening-p3`
- Dependencies: TASK-401, TASK-402, TASK-403

---

## File Lock Registry

| File | Locked by | Task | Since | Until |
|------|-----------|------|-------|-------|
| — | — | — | — | — |

Rules:
- Sub-agents must grab a lock before editing and release when their TASK completes.
- `package.json` / `pnpm-lock.yaml` → only TASK-206 in PR-2
- `drizzle/migrations/**` / `src/db/schema.ts` → only TASK-305 in PR-3
- `src/worker/index.ts` → owned per-PR by whichever task is designated (TASK-101 in PR-1, TASK-301 in PR-3)
- `wrangler.jsonc` → TASK-105 in PR-1 only
- `src/app/hooks/useTweaks.ts` → TASK-204 (PR-2) first, then TASK-303 (PR-3) — must run sequentially across PRs

---

## Task count & rough effort

| PR | Tasks | Est. hours | Parallelism |
|---|---|---|---|
| PR-1 | 7 | 6–8 h | 5 tasks in parallel, 2 sequential |
| PR-2 | 7 | 8–10 h | 5 in parallel + 1 solo + 1 final |
| PR-3 | 7 | 5–6 h | 5 in parallel + 1 solo + 1 final |
| PR-4 | 4 | 3–4 h | mostly sequential |
| **Total** | **25** | **22–28 h** | |

---

## Status summary

- PR-1: 0/7 tasks complete
- PR-2: 0/7 tasks complete
- PR-3: 0/7 tasks complete
- PR-4: 0/4 tasks complete
- Meta: 1/1 complete (TASK-000 archive done)

Next action: user reviews this plan. On approval ("ลุย" / "ทำเลย" / "approved") → `workflow-work` skill dispatches the PR-1 team.
