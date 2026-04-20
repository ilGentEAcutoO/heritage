# Work Session Summary — Security Remediation & Login Removal

> Completed: 2026-04-20 12:02 (+07)
> Branch: `main` · HEAD: `d1cb938`
> Archive target: `instruction/archive/02-security-remediation-login-removal/`

---

## Goal

Fix all findings in `instruction/security-review.md` (5 Critical / 11 High / 19 Medium / 10 Low / 8 Info) + resolve all `pnpm audit` advisories. Executed as 4 sequential PR tiers (P0→P1→P2→P3), plus two follow-up fix commits surfaced during post-audit verification.

---

## Tasks completed

| ID | Task | Status |
|---|---|---|
| **TASK-000** | Archive prior build docs | ✅ |
| **TASK-101** | Delete worker auth routes & middleware | ✅ |
| **TASK-102** | Trim tree routes to read-only | ✅ |
| **TASK-103** | Delete upload route | ✅ |
| **TASK-104** | Delete frontend auth + mutation UI | ✅ |
| **TASK-105** | Update wrangler/dev-vars config + regen types | ✅ |
| **TASK-106** | Refactor test suite + run typecheck/tests | ✅ |
| **TASK-107** | PR-1 final verification + commit | ✅ |
| **TASK-201** | Harden img.ts — IP trust, atomicity, response headers | ✅ |
| **TASK-202** | Crypto-random ID generator | ✅ |
| **TASK-203** | R2 key prefix includes treeId | ✅ |
| **TASK-204** | Remove wildcard postMessage + validate storage | ✅ |
| **TASK-205** | Pre-commit hook blocking build/dev artefacts | ✅ |
| **TASK-206** | Dep upgrades — drizzle, vitest/vite, esbuild | ✅ |
| **TASK-207** | PR-2 final verification | ✅ |
| **TASK-301** | Security-headers middleware | ✅ |
| **TASK-302** | APP_URL startup validation | ✅ |
| **TASK-303** | Frontend storage shape validation | ✅ |
| **TASK-304** | Graceful 404 / read-only notice | ✅ |
| **TASK-305** | Schema notNull + migration | ✅ |
| **TASK-306** | Gitignore + CF ID scrub + seed-demo guard | ✅ |
| **TASK-307** | PR-3 final verification | ✅ |
| **TASK-401** | GitHub Actions CI workflow | ✅ |
| **TASK-402** | L-series cleanup + docs rationale | ✅ |
| **TASK-403** | Docs + SECURITY.md | ✅ |
| **TASK-404** | Post-remediation audit (4 agents + synthesis) | ✅ |
| **Fix 1** | `run_worker_first: true` so security headers reach SPA | ✅ |
| **Fix 2** | `depth()` cycle guard for mutual-spouse pairs | ✅ |

**28/28 tasks complete.** All verified on prod.

---

## Test results

| Check | Result |
|---|---|
| `pnpm test` | **161/161 pass** across 13 test files |
| `pnpm typecheck` | **clean** (no errors) |
| `pnpm audit --prod` | **0 vulnerabilities** |
| `pnpm audit` (full) | **0 vulnerabilities** |

Regression tests added during this session:
- `tests/integration/surface.test.ts` (11 scenarios — every deleted route returns 404)
- `tests/integration/tree-read.test.ts` (refactored; adds `is_public` gate)
- `tests/integration/img-read.test.ts` (hardened headers + key-shape + rate-limit)
- `tests/integration/security-headers.test.ts` (5 scenarios)
- `tests/integration/schema-constraints.test.ts` (NOT NULL enforcement)
- `tests/unit/ids.test.ts` (crypto-random uniqueness)
- `tests/unit/useTweaks.test.ts` (Zod validation + no postMessage)
- `tests/unit/storage.test.ts` (read/write helpers)
- `tests/unit/config.test.ts` (APP_URL assertion)
- `tests/unit/seed-demo-guard.test.ts` (--remote confirmation guard)
- `tests/unit/TreeView.test.tsx` (graceful 404)
- `tests/unit/layout.test.ts` (new: mutual-spouse cycle safety)

---

## Security review

| Severity | Original | Open after remediation |
|---|---:|---:|
| Critical | 5 | **0** |
| High | 11 | **0** |
| Medium | 19 | **0** |
| Low | 10 | 3 deferred w/ rationale |
| Dependency CVEs | 1 high + 3 moderate | **0** |

**Key fixes:**
- Dep upgrades: drizzle-orm 0.36→0.45.2, drizzle-kit 0.27→0.31.10, vitest 2→4.1.4, vite 5→8.0.8, esbuild pinned ≥0.25.0
- Security headers on every response (CSP, HSTS, X-CTO, Referrer-Policy, Permissions-Policy)
- Removed entire auth/mutation surface (20+ findings obsoleted by deletion)
- KV rate-limiter hardened (dropped x-forwarded-for trust; per-tree cap)
- R2 key layout tree-scoped with regex enforcement
- Pre-commit hook blocks build/dev artefacts
- Schema `photos.object_key/mime/bytes` tightened to NOT NULL
- CI gate: typecheck + test + `pnpm audit --prod` + CF-ID/stale-binding grep

**Recommendations:** see `instruction/security-review-post-remediation.md` § "Residual cleanup status" — N4 (DROP TABLE migration for deleted auth tables) and N6–N8 (defence-in-depth polish) are deferred with documented rationale.

---

## Commits on `origin/main`

```
d1cb938 fix(layout): guard depth() against mutual-spouseOf cycles
76ab731 fix(worker): run_worker_first=true so security headers reach SPA
8067a17 docs+chore: post-remediation audit report + N1/N2/N3/N5 cleanup
462e3a5 feat: PR-4 CI, docs, L-series close-out
f959534 feat: PR-3 defense-in-depth — headers, config, validation, notNull
47405ba feat: PR-2 security hardening + dep CVE fixes
c0ef28f feat: remove login + mutation surface (PR-1 of security remediation)
b896495 chore: initial heritage build
```

**Aggregate diff** (baseline → HEAD): **−3 090 / +2 897 LOC** across worker, frontend, tests, config, docs. Net −193 LOC despite adding ~1 800 LOC of tests and docs — PR-1's deletion-first strategy dominates.

---

## Files changed (high-level)

**Deleted (worker):**
- `src/worker/routes/auth.ts`
- `src/worker/routes/upload.ts`
- `src/worker/middleware/session.ts`
- `src/worker/middleware/csrf.ts`
- `src/worker/middleware/rate-limit.ts`
- `src/worker/lib/tokens.ts`
- `src/worker/lib/email.ts`
- `src/shared/schemas.ts` + directory

**Created (worker):**
- `src/worker/middleware/db.ts` (extracted from session.ts)
- `src/worker/middleware/security-headers.ts`
- `src/worker/lib/ids.ts`
- `src/worker/lib/config.ts`

**Deleted (frontend):**
- `src/app/pages/Login.tsx`
- `src/app/pages/AuthVerify.tsx`
- `src/app/hooks/useSession.ts`
- `src/app/hooks/useUpload.ts`

**Created (frontend):**
- `src/app/lib/storage.ts`

**Modified:**
- `src/worker/index.ts` (routes, middleware, security-headers on ASSETS)
- `src/worker/routes/tree.ts` (read-only + `is_public` gate)
- `src/worker/routes/img.ts` (major hardening)
- `src/worker/types.ts`
- `src/app/App.tsx`, `src/app/lib/api.ts`, `src/app/hooks/useTweaks.ts`, `src/app/components/TreeCanvas.tsx`, `src/app/pages/TreeView.tsx`, `src/app/pages/Landing.tsx`
- `src/app/lib/layout.ts` (cycle guard in `depth()`)
- `src/db/schema.ts` (`photos` NOT NULL)
- `scripts/seed-demo.ts` (tree-scoped R2 keys + `--remote` consent)

**Created (config/infra):**
- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`
- `.husky/pre-commit`
- `SECURITY.md`
- `drizzle/migrations/0001_daffy_wendell_vaughn.sql`

**Modified (config):**
- `wrangler.jsonc` (removed send_email; `run_worker_first: true`)
- `.dev.vars.example` (minimised)
- `worker-configuration.d.ts` (regenerated)
- `.gitignore` (.playwright-mcp/, drizzle/seed.sql, *.tsbuildinfo)
- `package.json`, `pnpm-lock.yaml` (upgrades + husky + esbuild override)
- `README.md` (read-only posture + threat-model section)

**Created (docs):**
- `instruction/security-review.md` (original 53-finding audit)
- `instruction/security-review-post-remediation.md`
- `instruction/work/{requirements,plan,todos}.md`

---

## Production verification

Deployed via GitHub Actions `Deploy` workflow (3 successful runs this session). Playwright MCP verified on `https://heritage.jairukchan.com`:

| Path | Result |
|---|---|
| `/` | 200 + full security header set |
| `/demo/wongsuriya` | 200 + tree renders (16 people, 4 generations) + sidebar + pathfinder |
| `/login` | 200 → SPA fallback → NotFound page (no login form) |
| `/api/health` | 200 + security headers |
| `/api/tree/wongsuriya` | 200 |

Remaining console warnings on prod: Cloudflare's own bot-challenge inline script and `static.cloudflareinsights.com/beacon.min.js` are blocked by CSP — **accepted posture** (tracking/fingerprinting probes from CF; not app-critical).

---

## Methodology notes

- **4 PR tiers** (P0→P1→P2→P3) ran as sequential commits on `main` (no feature branches after the initial PR-1) per the user's "ยกเลิกการทำ pr ... ไปเลยให้จบ" directive.
- **Parallel sub-agents** (5 in PR-1, 5 in PR-2, 5 in PR-3, 3 in PR-4) with strict file-lock discipline — zero merge conflicts, zero cross-stepping.
- **Cross-review pattern** (implementer agent + tester agent) caught 2 real bugs I introduced as coordinator: `data.meta.isPublic` typo and the silent CSP-reaching-SPA gap.
- **TDD strictly enforced** for all Critical / High fixes — failing tests landed in the same commit as the fix.

---

## Deferred / open

- **N4** — DROP TABLE migration for `auth_tokens`, `sessions` (tables retained for possible future auth reintroduction)
- **N6** — Filename-sanitiser `;` strip (defence-in-depth, not reachable via `isValidKey`)
- **N7** — `tree-query.ts` `LIMIT` caps (no mutation path to exploit)
- **N8** — `ownerId` redaction for anonymous viewers (currently NULL in live tree)
- **Future auth reintroduction** — explicitly deferred per user decision; see `instruction/work/plan.md` § "Deferred / future tasks"

---

## Recommendation

**Ship.** All original Critical + High + Medium findings resolved; all dependency CVEs patched; CI gates future regressions; prod verified end-to-end.
