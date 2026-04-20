# Requirements — Security Remediation & Login Removal

> Created: 2026-04-20 09:50 (+07)
> Supersedes: `instruction/archive/01-heritage-initial-build/requirements.md`
> Source of findings: `instruction/security-review.md` (5 Critical / 11 High / 19 Medium / 10 Low / 8 Info) and `pnpm audit` output from 2026-04-20.

---

## User request (verbatim)

> "plan to fix all `@instruction/security-review.md` and all npm audit"

## Decisions agreed on 2026-04-20

| # | Question | Decision |
|---|---|---|
| 1 | Scope | **(d)** All security findings + all npm audit fixes |
| 2 | Existing `instruction/work/` | Archive to `instruction/archive/01-heritage-initial-build/` (done) **and** add archival step as a plan task |
| 3 | C5 magic-link takeover | **Remove the login feature entirely for now** (not a remediation — a feature rollback) |
| 4 | C4 + H3 rate-limit | **(a)** KV-based per-user limiter |
| 5 | H2 cookie rename (`__Host-`) | Accepted — all users logged out (moot since login is removed) |
| 6 | drizzle-orm CVE upgrade | Upgrade 0.36 → 0.45.2+ |
| 7 | TDD strictness | Yes — write failing tests first for Critical and High fixes; batch Medium/Low |
| 8 | Staging | **(a)** One PR per priority tier (4 PRs: P0 → P1 → P2 → P3) |
| 9 | L7 invite code fixture | N/A — login removed |

---

## Agreed scope

### In-scope

- **Login-removal refactor** (consequential simplification; drops ~40% of worker surface)
  - Delete: magic-link request/verify, session middleware, CSRF middleware, logout, `/me`, tokens lib, email lib
  - Delete: auth-gated mutation endpoints — all `POST/PATCH/PUT/DELETE` handlers on `tree.ts` and the entire `upload.ts`
  - Delete: `Login.tsx`, `AuthVerify.tsx`, `useSession.ts`, session hook usage
  - Delete: Cloudflare Email Service binding, `SESSION_SECRET` secret, auth-rate-limit on `/auth/request`
  - Keep: `auth_tokens` / `sessions` schema rows (harmless, keeps migrations monotone); they become unused
- **Security fixes** for everything that survives the refactor:
  - C3 — `x-forwarded-for` trust in `img.ts` rate-limiter
  - H3 — rate-limit atomicity (for `img.ts`)
  - H4 — replace `Math.random` `newId()` in `tree.ts` (used by seed-demo)
  - H5 — tree-scoped R2 key prefix (only relevant if any R2 writes remain for seeding)
  - H6 — `X-Content-Type-Options: nosniff` + `Content-Disposition` on `/api/img`
  - H9 — remove wildcard-origin `postMessage` and unvalidated listener in `useTweaks.ts`
  - H10 — regenerate `worker-configuration.d.ts` (drop stale R2 env bindings)
  - H11 — pre-commit hook blocking `dist/**` and `.wrangler/**`
  - M2 — `APP_URL` startup validation (still used to build absolute URLs)
  - M8 — `is_public` audit log (moot if mutations removed; skip)
  - M9 — tighten `photos.object_key/mime/bytes` to `notNull()`
  - M11 — frontend: no auth → no route guards needed, but add a graceful 404/read-only notice on `/tree/:slug` errors
  - M13–M14 — validate `localStorage` and `window.TWEAK_DEFAULTS` shapes
  - M15 — security response-header middleware (CSP, X-Frame-Options ≡ `frame-ancestors 'none'`, X-CTO, Referrer-Policy, HSTS)
  - M16 — scrub CF IDs from `README.md` / `instruction/` docs
  - M17 — add `.playwright-mcp/` to `.gitignore`
  - M18 — seed-demo `--remote` confirmation guard (or remove the code path)
  - M19 — `Cache-Control` on `/api/img`
  - All L-series items that remain applicable after refactor
- **npm audit fixes:**
  - `drizzle-orm` 0.36.4 → ≥ 0.45.2 (HIGH — CVE-2026-39356)
  - `vite` 5.4.21 (via `vitest`) → ≥ 6.4.2 (MODERATE — CVE-2026-39365)
  - `esbuild` ≤ 0.24.2 (transitive via drizzle-kit and vitest) → ≥ 0.25.0 (MODERATE — GHSA-67mh-4wv8-2f99)
  - Plan: upgrade direct deps (`vitest`, `drizzle-kit`) to pull modern transitives; add `pnpm overrides` only if upgrades don't transitively fix esbuild
- **Hardening:**
  - Add GitHub Actions CI: `pnpm typecheck`, `pnpm test`, `pnpm audit --prod`, `wrangler deploy --dry-run` gates
  - Regenerate `worker-configuration.d.ts` after wrangler-config edits

### Out-of-scope (deferred)

- **Reintroducing login** — user said "abort login for now". A future plan will redesign auth (candidates: magic-link with request-binding cookie / OAuth / Cloudflare Access) — tracked as a placeholder in `archive/` once this remediation merges.
- **Durable-Object rate-limiting** — KV-based limiter is the chosen stop-gap (decision 4a). Revisit if/when login returns.
- **Google Fonts self-hosting** — Informational; deferred to a future perf/privacy pass.
- **Full observability / PII audit** — present `observability: enabled: true` in `wrangler.jsonc` remains; a future pass should confirm no PII flows into logs.
- **M8 `is_public` audit log** — mutations are deleted, so the concern evaporates for now.

---

## Non-negotiable constraints

1. **No AI signatures in commits** — per project `CLAUDE.md`.
2. **Tests first** for Critical / High — failing test lands in the same commit (or just before) the fix.
3. **One PR per priority tier** (P0 → P1 → P2 → P3). Each PR must land with green CI before the next opens.
4. **No destructive git operations** (`push --force`, `reset --hard`, `branch -D`) without explicit user approval.
5. **Update `todos.md`** with `YYYY-MM-DD HH:mm` timestamp on every status change.
6. **File-lock registry** respected — sub-agents must not edit the same file concurrently.
7. **Main agent is Opus 4.6/4.7**; sub-agents Sonnet 4.6 for implementation, Opus 4.6 for security-critical tasks.

---

## Success criteria

- [ ] All 5 Critical findings are fixed OR made obsolete by the auth-removal refactor — documented in each PR description.
- [ ] All 11 High findings fixed OR obsoleted.
- [ ] All 19 Medium findings fixed OR obsoleted.
- [ ] All 10 Low findings reviewed — fixed, obsoleted, or explicitly deferred with rationale.
- [ ] `pnpm audit --prod` reports **0** vulnerabilities.
- [ ] `pnpm audit` (dev + prod) reports **0 high**, **0 critical**; moderates only allowed if they are dev-only and documented.
- [ ] `pnpm typecheck` clean.
- [ ] `pnpm test` — existing suite trimmed to reflect removed auth; remaining tests green; **new regression tests exist for every Critical / High fix**.
- [ ] Security-response-header middleware exercised by at least one integration test (asserts headers present on `/api/*` and `/`).
- [ ] GitHub Actions workflow runs on PR and on `main` push.
- [ ] `wrangler.jsonc` + `worker-configuration.d.ts` are consistent (regenerated types).
- [ ] No regression on the demo tree viewer — manual verification via Playwright MCP and screenshot comparison against `ft-01-landing.png` / `ft-02-demo-napa.png` / `ft-03-lineage-wipa.png`.

---

## Stakeholders & ownership

- **Product decision (auth removal):** user — confirmed 2026-04-20.
- **Security lead:** Claude main agent (Opus 4.7).
- **Implementation:** sub-agents (Sonnet 4.6 for routine, Opus 4.6 for security-critical).
- **Final review:** Claude main agent + user sign-off before each PR merges.
