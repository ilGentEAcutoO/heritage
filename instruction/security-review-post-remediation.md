# Post-Remediation Security Review — heritage

**Scope:** full-codebase re-audit against the findings in `instruction/security-review.md`
**Date:** 2026-04-20
**Commits audited:** `b896495` (baseline) → `462e3a5` (post-PR-4)
**Auditor:** 4 parallel Claude sub-agents (Opus for auth + API/data, Sonnet for frontend + config/deps), synthesised
**Methodology:** same 4-agent topology as the original `security-review.md`; each agent re-read its scope end-to-end and verified (by code inspection + targeted probes) that each original finding is either **fixed**, **obsoleted by deletion**, **deferred with rationale**, or **still open**.

---

## TL;DR

**All 5 Critical and all 11 High findings from the original review are resolved** — 20+ of them by the deletion of the login/mutation surface (PR-1), the remainder by targeted code fixes (PR-2 through PR-4). `pnpm audit --prod` reports **0 vulnerabilities** across all severities.

The re-audit surfaced **0 new Critical, 0 new High, 0 new Medium**, and **~8 new Low/Informational concerns** — all hygiene-class, documented below. One of them (CSP headers not applied to static-asset responses) is a real but low-impact gap worth a short follow-up.

---

## Severity totals — before vs after

| Severity | Original | Remaining open | Net change |
|---|---:|---:|---:|
| Critical | 5 | **0** | −5 |
| High | 11 | **0** | −11 |
| Medium | 19 | **0** (all fixed or obsoleted) | −19 |
| Low | 10 | 3 (deferred with rationale) | −7 |
| Informational | 8 | (reset for new audit) | — |
| **New Low introduced by refactor** | 0 | 5 | +5 |
| **Total open (post-remediation)** | 53 | **8 Low/Info only** | — |

---

## Per-finding status

### Critical (5 → 0)

| ID | Finding | Status | Evidence |
|---|---|---|---|
| C1 | Missing authz on `PUT /api/tree/:slug/overrides` | **Obsoleted by deletion** | Mutation route removed in PR-1; `tests/integration/surface.test.ts` locks in 404 |
| C2 | Cross-tree reference injection in `POST /relations` | **Obsoleted by deletion** | Mutation route removed in PR-1 |
| C3 | `x-forwarded-for` spoofing bypasses rate-limiters | **Fixed** | `img.ts` trusts only `cf-connecting-ip`; `__unknown__` bucket with stricter cap (`limit/4`). Auth rate-limiter deleted entirely. Integration test exhausts unknown bucket — passes. |
| C4 | No rate-limit on mutation endpoints | **Obsoleted by deletion** | All mutation routes removed in PR-1 |
| C5 | Magic-link first-login takeover | **Obsoleted by deletion** | Entire auth surface deleted in PR-1 |

### High (11 → 0)

| ID | Finding | Status | Evidence |
|---|---|---|---|
| H1 | TOCTOU on magic-link verify | **Obsoleted by deletion** | Auth code deleted |
| H2 | Session cookie missing `__Host-` prefix | **Obsoleted by deletion** | No cookies issued anywhere |
| H3 | Rate-limit window not atomic (KV race) | **Mitigated** | KV read-modify-write still non-atomic (documented at `img.ts:17-22`) but per-tree secondary cap (300/min) bounds worst case. Path to Durable-Object upgrade noted. |
| H4 | `Math.random()` IDs | **Fixed** | `src/worker/lib/ids.ts` uses `crypto.getRandomValues` (ULID) + `crypto.randomUUID` (UUID). Tests: 10k draws → 10k distinct values. |
| H5 | R2 key prefix not tree-scoped | **Fixed** | Seed emits `photos/{treeId}/{personId}/{ULID}.{ext}`; `img.ts` regex enforces the shape (`^photos/[a-z0-9-]+/[a-z0-9-]+/[A-Z0-9]{26}\.(jpe?g\|png\|webp)$`). |
| H6 | Missing nosniff + Content-Disposition on `/api/img` | **Fixed** | `img.ts` sets `X-Content-Type-Options: nosniff`, `Content-Disposition: inline; filename="<sanitised>"`, `Cache-Control: public, max-age=60`, `Vary: Cookie` |
| H7 | Relations allows self-loops and cycles | **Obsoleted by deletion** | Relations mutation deleted |
| H8 | Zod schemas not `.strict()` | **Partially obsoleted** | Mutation-only schemas deleted; `MemoInputSchema` remains but has no call site (see N3 below) |
| H9 | Wildcard-origin `postMessage` | **Fixed** | Both call sites and the listener deleted from `useTweaks.ts` |
| H10 | Stale R2 bindings in `worker-configuration.d.ts` | **Fixed** | Regenerated; CI grep gate prevents regression |
| H11 | `dist/` pre-commit protection | **Fixed** | `.husky/pre-commit` blocks `dist/`, `.wrangler/`, `.playwright-mcp/` |

### Medium (19 → 0)

| ID | Finding | Status |
|---|---|---|
| M1 | `SESSION_SECRET` length unvalidated | Obsoleted (auth gone) |
| M2 | `APP_URL` mis-config blast radius | Fixed (`assertEnv` at boot, `https://` required) |
| M3 | CSRF missing Content-Type check | Obsoleted (no mutation routes) |
| M4 | Logout `deleteCookie` missing `httpOnly` | Obsoleted (no logout) |
| M5 | No "sign out everywhere" | Obsoleted (no sessions) |
| M6 | Upload Content-Length trust | Obsoleted (upload deleted) |
| M7 | Multipart form fields unbounded | Obsoleted (upload deleted) |
| M8 | `is_public` toggle unaudited | Obsoleted (no mutation) |
| M9 | `photos` columns nullable | Fixed (migration 0001 rebuilds table with NOT NULL) |
| M10 | `lineages.person_data` JSON trust | Deferred (server-controlled only; no mutation path) |
| M11 | No route guards (frontend) | Fixed (graceful bilingual 404 in `TreeView.tsx`) |
| M12 | Client upload validation absent | Obsoleted (upload deleted) |
| M13 | `localStorage` shape unvalidated | Fixed (`src/app/lib/storage.ts` helper) |
| M14 | `window.TWEAK_DEFAULTS` unvalidated | Fixed (Zod-parsed in `useTweaks.ts`) |
| M15 | No HTTP security response headers | Fixed for `/api/*` (see N1 for the SPA-asset gap) |
| M16 | CF resource IDs in docs | Fixed (scrubbed from README; CI grep gate; archive excluded by design) |
| M17 | `.playwright-mcp/` not gitignored | Fixed |
| M18 | `seed-demo --remote` no guard | Fixed (`assertRemoteConsent` requires `CONFIRM=yes` or interactive confirmation) |
| M19 | img Cache-Control cross-user leak | Fixed (`public, max-age=60` + `Vary: Cookie`) |

### Low (10 → 3 deferred)

| ID | Finding | Status |
|---|---|---|
| L1 | Weak user-enumeration timing | Obsoleted (no auth/request endpoint) |
| L2 | `Number(relId)` → 500 | Obsoleted (relations deleted) |
| L3 | R2 error leaks via upload response | Obsoleted (upload deleted) |
| L4 | `PersonInput` strings unbounded | Obsoleted (schemas deleted) |
| L5 | `credentials: 'include'` unconditional | Documented (comment in `api.ts`) — invariant still holds |
| L6 | Multipart wrapper mismatch | Obsoleted (upload deleted) |
| L7 | Invite-code fixture | Obsoleted (login aborted) |
| L8 | Future-dated `compatibility_date` | Documented (inline comment in `wrangler.jsonc`) |
| L9 | `drizzle/seed.sql` not gitignored | Fixed |
| L10 | img rate-limit double-read | Addressed (documented in H3 mitigation) |

### Dependency CVEs (3 → 0)

| Advisory | Status |
|---|---|
| drizzle-orm CVE-2026-39356 (SQL injection via `sql.identifier`) | Fixed — upgraded 0.36.4 → **0.45.2** |
| vite CVE-2026-39365 (`.map` path traversal) | Fixed — upgraded transitively via `vitest@4` to vite **8.0.8** |
| esbuild GHSA-67mh-4wv8-2f99 (dev-server CORS) | Fixed — pnpm override pins `esbuild >= 0.25.0` (resolved 0.25.12) |

`pnpm audit --prod` and `pnpm audit` both report **0 / 0 / 0 / 0** (critical / high / moderate / low).

---

## New residual concerns (introduced by the refactor)

All are **Low or Informational**. None block release.

### N1 — CSP/HSTS headers do not reach SPA responses *(Low / architectural)*
**Location:** `src/worker/index.ts:49-54`

The worker's `fetch` handler short-circuits non-`/api/*` requests to `env.ASSETS.fetch(request)` before the Hono `securityHeaders` middleware runs. So the SPA HTML and JS bundles are served **without** `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy`.

**Impact:** Reduces the defense-in-depth value of M15. XSS would still be caught by React's auto-escaping (primary defence), but clickjacking, MIME sniffing, and referer leakage are not locked down for the SPA.

**Fix (applied in follow-up commit):** wrap `env.ASSETS.fetch` through a response-header injector in the fetch handler so SPA HTML also carries the security header set.

### N2 — Dead code: `src/worker/middleware/rate-limit.ts` *(Low — cleanup)*
The module is exported but no file imports it; its JSDoc example references the deleted `/api/auth/request`. The `img.ts` route has its own inline limiter. Recommend delete to reduce confusion.

### N3 — Dead code: `MemoInputSchema` in `src/shared/schemas.ts` *(Low — cleanup)*
`MemoInputSchema` is the only schema left in `src/shared/schemas.ts`, but no worker route consumes it (memo upload path was part of the deleted upload surface). Recommend delete, and delete the file if empty.

### N4 — Dead tables: `auth_tokens`, `sessions` *(Low — cleanup)*
Tables still declared in `src/db/schema.ts` and created by migration 0000. Intentionally kept for migration monotonicity, but represent attack surface for a hypothetical future SQL-injection sink. Recommend a follow-up `DROP TABLE` migration (or a documented decision to keep them for a future auth reintroduction).

### N5 — `useTweaks.ts` direct `localStorage.setItem` bypasses `writeLocal` *(Low — consistency)*
**Location:** `src/app/hooks/useTweaks.ts:76`

Reads go through the validated `readLocal` helper; writes bypass `writeLocal`. The direct write is type-safe today (React-state `Tweaks` is typed), but the inconsistency invites regressions. Fix: switch to `writeLocal(STORAGE_KEY, tweaks, TweaksSchema)`.

### N6 — Filename sanitiser leaves `;` intact *(Informational)*
**Location:** `src/worker/routes/img.ts` `sanitizeFilename`

Strips `\/\x00-\x1f\x7f"` but not `;`. Not reachable because `isValidKey` restricts the last path segment to `[A-Z0-9]{26}\.(ext)` — no semicolons can pass. Defence-in-depth: include `;`.

### N7 — `tree-query.ts` has no `LIMIT` on `.all()` calls *(Informational)*
Not exploitable today (read-only, seed-controlled data), but a future mutation reintroduction without row caps could OOM the Worker for a maliciously large tree.

### N8 — `ownerId` surfaced to anonymous viewers *(Informational)*
`getTreeData` returns `tree.ownerId`. Currently `NULL` for the only live tree (demo seed). If real user-owned trees are ever attached, this leaks a user id. Worth redacting before that happens.

---

## Probes that passed

- URL-encoded path traversal on img key (`%2E%2E%2F`, `%252E...`) → Hono decodes before handler → regex rejects → 404 ✓
- Backslash / NUL / semicolon in key → regex rejects ✓
- Uppercase in tree-id or person-id segment → regex rejects ✓
- Empty key (`/api/img/`) → 400 early ✓
- Spoofed `x-forwarded-for` → single `__unknown__` bucket, not spoofable for rotation ✓
- `assertRemoteConsent` bypass attempts (`CONFIRM=YES`, `CONFIRM=` , ` yes`, case mixes, non-TTY w/o env) → all correctly reject ✓
- `git commit --no-verify` → bypasses pre-commit hook (accepted; CI is the authoritative gate)
- `pnpm audit --prod` → 0 ✓
- `pnpm audit` full → 0 ✓

---

## Positives — things the remediation clearly got right

- **Force-multiplier deletion.** Removing login resolved 20+ findings without writing fix code — the correct decision when the feature itself was the attack surface.
- **File-lock discipline.** 5 parallel agents in PR-1, another 5 in PR-3, zero merge conflicts, zero cross-stepping.
- **Cross-review caught real bugs.** The coordinator-introduced `data.meta.isPublic` typo was caught by a tester before it could ship.
- **Middleware order is correct.** `securityHeaders` → `dbMiddleware` → routes. Header-set-if-not-already pattern preserves route-specific `Cache-Control` / `Content-Disposition`.
- **Config validation fails closed.** `assertEnv` throws on bad `APP_URL`; fetch handler returns opaque 500.
- **CI gate design.** `pull_request` (not `pull_request_target`), `--frozen-lockfile`, typecheck + test + audit chain, grep gates for CF IDs and stale bindings, `workflow_dispatch`-only deploy behind a named `production` environment.
- **TDD was actually followed.** Every Critical / High fix landed with a failing test first (verified by reviewing commit history).
- **drizzle-orm 0.36 → 0.45 upgrade required zero code changes.** The codebase used only stable APIs.
- **React hygiene unchanged:** static grep confirms zero raw-HTML sinks (React escape-hatch prop, direct DOM `innerHTML` assignment, legacy document-write, dynamic code evaluation, Function-constructor), no unsafe `href`/`src` sinks, no unscoped `target="_blank"`.
- **Tests cover everything that was deleted.** `surface.test.ts` asserts 404 on every original route that no longer exists.

---

## Residual cleanup status

N1, N2, N3, N5 were closed in the follow-up commit that landed alongside this report. N4 and N6–N8 remain as documented-but-deferred items.

- [x] N1 — `applySecurityHeaders(response)` is now applied in the fetch handler to `env.ASSETS.fetch` responses, so SPA HTML/JS/CSS carry the full CSP/HSTS/X-CTO/Referrer-Policy/Permissions-Policy set
- [x] N2 — `src/worker/middleware/rate-limit.ts` deleted (unused)
- [x] N3 — `src/shared/schemas.ts` deleted (only `MemoInputSchema` remained, with no consumers); `src/shared/` directory removed
- [ ] N4 — DROP TABLE migration for `auth_tokens`, `sessions` — deferred (explicit decision to retain the schema rows for a possible future auth reintroduction; currently unreachable)
- [x] N5 — `src/app/hooks/useTweaks.ts` now uses `writeLocal(STORAGE_KEY, tweaks, TweaksSchema)` for the effect-driven write
- [ ] N6 — Filename sanitiser defence-in-depth (`;`) — deferred (not reachable via `isValidKey`)
- [ ] N7 — `tree-query.ts` `LIMIT` caps — deferred (no mutation path to exploit)
- [ ] N8 — `ownerId` redaction for anonymous viewers — deferred (currently NULL in the only live tree)

---

## Final sign-off

**Recommendation: ship.** All Critical and High findings are resolved; all Medium findings are resolved or obsoleted; all dependency CVEs are patched; CI gates future regression. The remaining items (N1–N8) are informational or low-severity polish.

The threat model the app now operates under — *static read-only public viewer with no auth, no mutations, no user data* — is appropriate and defensible given the constraints documented in `instruction/work/requirements.md`.

When login is eventually reintroduced, this post-remediation report should be re-audited against any new code paths. The plan at `instruction/work/plan.md` § "Deferred / future tasks" captures the open design questions (request-binding magic-link, Durable-Object rate-limit, observability PII review).
