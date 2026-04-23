# Active Tasks

> Last updated: 2026-04-23 11:30 (+07)

## Current phase: Phase 4 complete — V3 green 18/18 (FCP 844ms on demo tree)

- Phase 0 ✅ (schema + bindings landed)
- Phase 1 ✅ (password/email/tokens libs landed)
- Phase 2 ✅ (session mw + auth routes + tree gate/edge cache + share routes landed)
- Phase 3 ✅ DONE 2026-04-23 09:40 — 297/297 tests green, typecheck clean
- Phase 4: V1 ✅, V2 ✅, V2-FIX ✅ (355/355), V3 ✅ (18/18 e2e, FCP 844ms), V4 ✅
- Phase 5: Deploy ✅ LIVE at heritage.jairukchan.com (2026-04-23 10:42 + CSP/testid re-deploy 11:12)
  - SESSION_SECRET set on heritage-worker-api
  - D1 migrations 0001 + 0002 applied to prod (heritage-d1-main)
  - Smoke test: /api/health 200, /api/tree/wongsuriya cold 629ms / warm 358ms (cf-cache=HIT + x-cache=HIT), /api/auth/me 401, /api/auth/signup (forged Origin) 403 forbidden_origin

---

## TASK-V3 — Playwright E2E plan (awaiting user approval)

See plan.md § "TASK-V3 PLAN" for the full scenario list + tooling choice.
Summary:

- Add `@playwright/test` + `playwright` as dev deps; chromium only for v1.
- `tests/e2e/` config + specs; `baseURL=https://heritage.jairukchan.com`.
- 18 scenarios grouped Tier 1 (must pass, 11) + Tier 2 (should pass, 7).
- Email tokens read from prod D1 via `wrangler d1 execute --remote` helper.
- Test-user emails scoped to `e2e-%@example.com`; teardown purges them.
- Known risks: RL_LOGIN_IP is tenant-global (serialize login-failure specs);
  no email inbox so tokens sourced from D1.

**Approve to proceed** → say "ลุย" / "go" / "approve" and I execute.

---

## Research tasks — ALL COMPLETE

- RESEARCH-001 ✅ auth stack on Workers 2026 → `agent-temp/research-001-auth.md`
- RESEARCH-002 ✅ demo tree perf measurement → `agent-temp/research-002-perf.md`
- RESEARCH-003 ✅ codebase audit for auth reintro → `agent-temp/research-003-codebase.md`
- RESEARCH-004 ✅ Cloudflare Email Service → `agent-temp/research-004-cf-email.md`
- RESEARCH-005 ✅ tree sharing model → `agent-temp/research-005-sharing.md`

---

## Phase 0 — Foundation ✅ DONE

### TASK-F1: Schema migration + indexes
- Status: 🟢 implemented (2026-04-21 19:40) — migration `0002_odd_molecule_man.sql`; 5/5 roundtrip tests green

### TASK-F2: Wrangler + Env types
- Status: 🟢 implemented (2026-04-21 19:55) — 169/169 tests green; typecheck clean

---

## Phase 1 — Core libs ✅ DONE

### TASK-L1: Password hashing lib
- Status: 🟢 implemented (2026-04-21 20:10) — 8/8 tests green; ~30-40ms/scrypt on Mac

### TASK-L2: Email lib (CF Email Service)
- Status: 🟢 implemented (2026-04-21 20:10) — 5/5 tests green; Thai+English dual-language

### TASK-L3: Token lib
- Status: 🟢 implemented (2026-04-21 20:10) — 13/13 tests green (NIST SHA-256 vectors pass)

---

## Phase 2 — Middleware + worker routes ✅ DONE

### TASK-W1: Session middleware
- Status: ✅ tested (2026-04-22) — `src/worker/middleware/session.ts`; sliding-refresh, waitUntil-aware

### TASK-W2: Auth routes
- Status: ✅ tested (2026-04-22) — `src/worker/routes/auth.ts`; signup/verify/login/logout/request-reset/reset/me
- Includes CSRF origin check, RL_LOGIN + RL_LOGIN_IP rate limits, pending-share backfill on verify

### TASK-W3: Tree gate rewrite + perf Fix 1 (edge cache)
- Status: ✅ tested (2026-04-22) — visibility enum, canAccessTree, caches.default put for public+no-cookie

### TASK-W4: Share routes + My Trees
- Status: ✅ tested (2026-04-22) — `src/worker/routes/shares.ts`, `src/worker/routes/trees.ts`

---

## Phase 3 — Perf-only + frontend (4 agents, after Phase 2)

### TASK-P1: Perf Fix 2 — immutable assets
- Status: 🟢 implemented (2026-04-23 09:25)
- Model: Sonnet 4.6
- Files (exclusive): `src/worker/index.ts` (asset branch), `tests/integration/asset-cache.test.ts` (new)
- Sub-tasks:
  - [x] After `applySecurityHeaders(assetRes)`, if `url.pathname.startsWith('/assets/')` → override `Cache-Control: public, max-age=31536000, immutable`
  - [x] Integration test verifying header on `/assets/*` and NOT on `/` or `/index.html` — 4/4 tests green; typecheck clean

### TASK-P2: Perf Fix 3 — db.batch() for lineage_members
- Status: 🟢 implemented (2026-04-23 09:25)
- Model: Sonnet 4.6
- Files (exclusive): `src/worker/lib/tree-query.ts`, `tests/integration/tree-query-batch.test.ts` (new)
- Sub-tasks:
  - [x] Replace `Promise.all(lineageIds.map(...))` with drizzle `inArray` — single SQL IN query
  - [x] Red test first: counter shim on `d1.prepare()` confirmed 4 queries before fix → 1 after
  - [x] 297/297 tests green, typecheck clean

### TASK-F-AUTH: Frontend auth
- Status: 🟢 implemented (2026-04-23 09:35)
- Model: Sonnet 4.6
- Files (exclusive):
  - `src/app/pages/Login.tsx` (new) ✅
  - `src/app/pages/Signup.tsx` (new) ✅
  - `src/app/pages/Verify.tsx` (new) ✅
  - `src/app/pages/ResetRequest.tsx` (new) ✅
  - `src/app/pages/ResetPassword.tsx` (new) ✅
  - `src/app/hooks/useSession.ts` (new) ✅
  - `src/app/lib/api.ts` ✅ auth methods added — lock RELEASED for TASK-F-SHARE
  - `src/app/App.tsx` ✅ auth routes wired — lock RELEASED for TASK-F-SHARE
- 297/297 tests green, typecheck clean

### TASK-F-SHARE: Frontend sharing + demo URL alias
- Status: 🟢 implemented (2026-04-23 09:40)
- Model: Sonnet 4.6
- Files changed:
  - `src/app/pages/Trees.tsx` (new) ✅
  - `src/app/components/ShareDialog.tsx` (new) ✅
  - `src/app/pages/TreeView.tsx` (share button in header-actions) ✅
  - `src/app/pages/Landing.tsx` (session-aware CTAs) ✅
  - `src/app/App.tsx` (/trees route added) ✅
  - `src/app/lib/api.ts` (TreeSummary, Share types + listTrees/getShares/addShare/revokeShare/setVisibility) ✅
  - `src/app/lib/types.ts` (visibility replaces isPublic on Tree; inviteCode removed; TreeData.meta.visibility added) ✅
  - `tests/fixtures/wongsuriya.ts` (inviteCode → visibility: 'public') ✅
- 297/297 tests green, typecheck clean, all file locks RELEASED

---

## Phase 3 ✅ DONE (2026-04-23 09:40)

---

## Phase 4 — Verification (parallel but controlled, after Phase 3)

### TASK-V1: Regression test suite update
- Status: 🟢 implemented (2026-04-23 09:48)
- surface.test.ts: no stale assertions found; all expectations already match live auth routes (401/403/404 as appropriate)
- Added `tests/helpers/fixtures.ts`: `seedUser`, `seedSession`, `seedShare` helpers
- Added `tests/integration/fixtures.test.ts`: 11 new tests exercising all 3 fixtures end-to-end
- Test count: 297 → 308 (all green), typecheck clean

### TASK-V2: Security review consult (CRITICAL — Opus)
- Status: 🟢 implemented (2026-04-23 09:55)
- Model: Opus 4.6
- Verdict: **GO WITH NOTES**
- Report: `agent-temp/security-review-round3.md`
- New adversarial tests: `tests/integration/security-adversarial.test.ts` (25 tests) + `tests/integration/security-cache-invalidation.test.ts` (2 tests); 335/335 tests green
- Key findings (full detail in report):
  - **N-R3-3 (High):** `PATCH /:slug/visibility` does not purge the edge cache — public→private transition leaves tree visible to anonymous users for up to 6 min. Recommended blocker for public launch with real private trees.
  - **N-R3-1 (Medium):** Login returns `403 email_not_verified` for unverified accounts — enumeration vector distinguishing "exists-but-unverified" from "unknown email"; should return 401 `invalid_credentials` for parity.
  - **N-R3-2 (Medium, defense-in-depth):** Hono `csrf()` does not inspect `application/json`; shares/trees routers lack csrf entirely. Current SameSite=Lax + implicit CORS preflight cover it, but the protection is fragile.
  - **N-R3-4..8 (Low/Info):** TOCTOU on token consumption, `ownerId` leak to anon viewers, unvalidated slug/email formats, session IP/UA retention — polish items.
- No production source files were modified.

### TASK-V2-FIX: Security remediation (all findings) — Sonnet 4.7 (1M)
- Status: 🟢 implemented (2026-04-23 10:27)
- Report: `agent-temp/security-review-round3.md` § 6 "Remediation applied (2026-04-23)"
- Fixes landed: **8/8** (N-R3-1 through N-R3-8)
  - N-R3-1: unverified-login → 401 `invalid_credentials` (`src/worker/routes/auth.ts:348-353`)
  - N-R3-3: edge cache purged on visibility / share mutations (new `src/worker/lib/cache-purge.ts`; wired in shares.ts)
  - N-R3-2: new `originCheck` middleware covers all mutation content-types (new `src/worker/middleware/origin-check.ts`; wired in `src/worker/index.ts`; hono/csrf removed from auth.ts)
  - N-R3-4: atomic `UPDATE ... RETURNING` with `used_at IS NULL` CAS on `/verify` and `/reset`
  - N-R3-5: `ownerId` redacted to `null` on anonymous public reads (`src/worker/routes/tree.ts`)
  - N-R3-6: zod slug validator on `POST /api/trees` (regex + length + lowercase)
  - N-R3-7: zod email+role validator on `POST /:slug/shares` (trim-then-email via `.pipe()`)
  - N-R3-8: `deleteExpiredSessions` helper in new `src/worker/lib/session-cleanup.ts` + audit comment in `issueSession`
- Tests: 335 → 355 (all green); typecheck clean
- Constraints honoured: no AI signatures, no new deps, `wrangler.jsonc` untouched (RL_WRITE deferred)

### TASK-V3: Playwright E2E
- Status: 🟢 implemented (2026-04-23 11:30)
- Model: Sonnet 4.6 (execution)
- Scenarios: **18/18 green** (S1–S18). FCP on demo tree = **844ms** (vs 4292ms baseline).
- Tooling: `@playwright/test@1.59.1` + `playwright@1.59.1`, chromium only, targets prod URL.
- Specs: `tests/e2e/{01-landing,02-signup,03-verify,04-login,05-logout,06-reset,07-trees,08-share,09-security}.spec.ts`.
- Helpers: `tests/e2e/helpers/{d1,signup,cleanup,cleanup-cli,console,global-teardown}.ts`.
- Source fixes landed mid-run (re-deployed via `pnpm wrangler deploy`):
  - `src/worker/middleware/security-headers.ts` — CSP updated to allow Cloudflare-injected Bot Management inline script + Web Analytics beacon (`'unsafe-inline'` on script-src, `static.cloudflareinsights.com` allow-listed). Without this, every page load in Chrome logged 2 CSP violations.
  - `src/app/components/TreeCanvas.tsx` — added `data-testid="tree-canvas"` for spec S2.
  - `src/app/pages/Landing.tsx` — added logout button (product gap: no logout UI existed; required for S9).
  - `tests/integration/{security-headers,asset-cache}.test.ts` — updated CSP expectations to match new policy.
- Report: `agent-temp/e2e-run-2026-04-23.md`.

### TASK-V4: Perf re-measurement
- Status: 🟢 implemented (2026-04-23 11:35) — warm TTFB 258–358ms (median 282ms), 4/5 cache-hit rate; cold median 488ms vs 2500ms baseline (~5× improvement); assets now immutable. Full report: `agent-temp/perf-after.md`.

---

## Phase 5 — Ship prep (serial, USER approves each)

### TASK-S1: CF Email domain onboard
- Status: ⚪ pending (user-driven)

### TASK-S2: Set SESSION_SECRET
- Status: ⚪ pending

### TASK-S3: Deploy via CI (not CLI)
- Status: ⚪ pending

### TASK-S4 (optional, deferred): Drop `is_public` column
- Status: ⚪ pending (deferred)

---

## File Lock Registry

| File | Locked by | Task | Since |
|------|-----------|------|-------|
| `src/worker/index.ts` | — | P1 DONE | released 2026-04-23 09:25 |
| `src/worker/lib/tree-query.ts` | — | P2 DONE | released 2026-04-23 09:25 |
| `src/app/pages/Login.tsx` (new) | — | F-AUTH DONE | released 2026-04-23 09:35 |
| `src/app/pages/Signup.tsx` (new) | — | F-AUTH DONE | released 2026-04-23 09:35 |
| `src/app/pages/Verify.tsx` (new) | — | F-AUTH DONE | released 2026-04-23 09:35 |
| `src/app/pages/ResetRequest.tsx` (new) | — | F-AUTH DONE | released 2026-04-23 09:35 |
| `src/app/pages/ResetPassword.tsx` (new) | — | F-AUTH DONE | released 2026-04-23 09:35 |
| `src/app/hooks/useSession.ts` (new) | — | F-AUTH DONE | released 2026-04-23 09:35 |
| `src/app/App.tsx` | — | F-SHARE DONE | released 2026-04-23 09:40 |
| `src/app/lib/api.ts` | — | F-SHARE DONE | released 2026-04-23 09:40 |
| `src/app/lib/types.ts` | — | F-SHARE DONE | released 2026-04-23 09:40 |
| `src/app/pages/Trees.tsx` (new) | — | F-SHARE DONE | released 2026-04-23 09:40 |
| `src/app/components/ShareDialog.tsx` (new) | — | F-SHARE DONE | released 2026-04-23 09:40 |
| `src/app/pages/Landing.tsx` | — | F-SHARE DONE | released 2026-04-23 09:40 |
| `src/app/pages/TreeView.tsx` | — | F-SHARE DONE | released 2026-04-23 09:40 |
