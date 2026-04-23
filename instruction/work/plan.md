# Plan: Re-introduce Auth (email+password) + Google-Drive Sharing + Demo Perf

> Created: 2026-04-21 18:10 (+07)
> Source: `requirements.md`; research in `agent-temp/research-00[1-5]-*.md`
> Sequencing: Parallel two-track (Track A = auth+share, Track B = perf) per user request

---

## Architecture

### Track A — Auth, Email, Sharing

```
┌──────────────────────────────────────────────────────────────┐
│  Browser  ──►  __Host-session cookie (HttpOnly, Secure, Lax) │
└──────────────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│  Hono middleware stack                                       │
│    1. securityHeaders      (outermost, existing)             │
│    2. dbMiddleware         (existing)                        │
│    3. sessionMiddleware    (NEW — reads __Host-session,      │
│                              sets c.var.user | null)         │
│    4. routes                                                 │
│       • /api/auth/*        csrf() + RL_LOGIN + RL_LOGIN_IP   │
│       • /api/tree/:slug    canAccessTree(visibility, user)   │
│       • /api/tree/:slug/*  owner-gate (shares, visibility)   │
│       • /api/trees         requireAuth                       │
└──────────────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│  D1 schema delta                                             │
│   users         + password_hash, password_salt,              │
│                   failed_login_count, locked_until,          │
│                   email_verified_at                          │
│   sessions      (no change — already correctly shaped)       │
│   auth_tokens   REPURPOSED → password-reset + email-verify   │
│                   tokens (same shape: token_hash, email,     │
│                   expires_at, used_at)                       │
│   trees         + visibility enum ('public'|'private'|       │
│                   'shared'); is_public retained for one      │
│                   migration cycle                            │
│   tree_shares   NEW (id, tree_id, email, user_id NULL,       │
│                   role, status, invited_by, timestamps)      │
│   tree_members  DEAD — leave untouched                       │
│   lineage_members  + INDEX on (lineage_id)  ← perf Fix 3     │
└──────────────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│  Cloudflare bindings (wrangler.jsonc)                        │
│   DB            D1 (existing)                                │
│   KV_RL         KV (existing, for img rate-limit)            │
│   PHOTOS        R2 (existing)                                │
│   ASSETS        Workers Assets (existing)                    │
│   EMAIL         send_email binding (NEW — CF Email Service)  │
│   RL_LOGIN      ratelimits binding, key=email (NEW)          │
│   RL_LOGIN_IP   ratelimits binding, key=IP (NEW)             │
│   SESSION_SECRET  wrangler secret (NEW)                      │
└──────────────────────────────────────────────────────────────┘
```

### Track B — Perf (three fixes)

1. Edge-cache `/api/tree/:slug` — `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` + `caches.default` put. **Only when** the tree is `public` AND the request has no `__Host-session` cookie (prevents `Vary: Cookie` split).
2. `immutable` cache on hashed assets — override `Cache-Control` for `/assets/*` in the Worker asset branch.
3. `db.batch()` + index on `lineage_members.lineage_id` — collapse 4 D1 RTTs → 1.

### Cross-track decision — cache-key strategy (THE critical coordination point)

`/api/tree/:slug` is the one route that Track A and Track B both modify. Resolution:

- If request has **no session cookie** and `tree.visibility='public'` → cache-hit path; Worker strips any `Vary: Cookie` for this response; writes to `caches.default` keyed by URL only.
- If request has **session cookie** → skip cache entirely (read from D1 with the `canAccessTree` gate). Cost: slightly slower for logged-in users viewing public trees (acceptable trade).

This means: **Fix 1 (edge-cache) and the gate rewrite ship in the same task** (TASK-C3) to guarantee consistency.

---

## Security considerations

Must re-consult `instruction/security-review.md` and `instruction/security-review-post-remediation.md` before shipping. Every H/M finding from the pre-remediation review needs a countermeasure here:

| Threat | Countermeasure |
|---|---|
| Brute-force login | `RL_LOGIN` 5/min per email + `RL_LOGIN_IP` 20/min per IP (native binding, atomic — kills finding H3) |
| Credential stuffing | Per-email rate limit |
| Timing attacks / user enumeration | Dummy `scryptSync` on unknown email; identical error shape; `timingSafeEqual` |
| Password storage | `node:crypto.scryptSync` N=16384 r=8 p=1, per-user 16-byte salt |
| Session fixation | New token on every login; invalidate old sessions on logout |
| Session hijacking | `__Host-session`; HttpOnly; Secure; SameSite=Lax; 14d sliding |
| CSRF | Hono `csrf()` (Origin + Sec-Fetch-Site) on all `/api/auth/*` mutations |
| XSS | Existing CSP + HttpOnly cookie (unchanged) |
| Pre-verification share claim | Backfill `tree_shares.user_id` **only at email verify**, never at signup |
| Tree enumeration | 404 for private/shared-without-access (never 401); same for `img.ts` |
| CF-Connecting-IP spoofing | Trust CF edge header only; never X-Forwarded-For |

Security sub-agent checks off each threat before sign-off.

---

## Test Specifications (TDD — red first, then green)

Test files must be written BEFORE implementation per skill rules.

### Unit — `tests/unit/`

- `password.test.ts` — hash/verify round-trip; `verifyPassword` fails fast on wrong salt; timing parity ±5 ms between valid-user and unknown-email paths
- `tokens.test.ts` — session token generation is 256-bit entropy; `sha256Hex` round-trips; base64url URL-safe charset
- `email.test.ts` — `sendVerificationEmail` calls binding.send with correct shape, subject, URL; same for reset
- `canAccessTree.test.ts` — all four visibility states × three user states (anonymous, owner, non-owner-with-share, non-owner-no-share)

### Integration — `tests/integration/`

- `auth-signup.test.ts` — open signup; creates unverified user; sends verify email (mocked binding); returns 201
- `auth-verify.test.ts` — valid token sets `email_verified_at`, issues session, backfills pending tree_shares; expired token → 410; used token → 410
- `auth-login.test.ts` — valid creds issue session; wrong password → 401 (same shape as unknown email); rate limit kicks in at 6th attempt
- `auth-logout.test.ts` — deletes session row; clears cookie
- `auth-reset.test.ts` — request-reset always 204 (no enumeration); valid reset token allows password change, invalidates prior sessions
- `auth-me.test.ts` — returns user when authed; 401 when not
- `surface.test.ts` — UPDATE existing to match new auth + share routes
- `tree-read.test.ts` — updated for visibility enum; canAccessTree for shared trees with pending+accepted shares
- `shares.test.ts` — owner CRUD on shares; non-owner 403; pending share auto-accepts on already-verified existing user; case-insensitive email
- `trees-list.test.ts` — `GET /api/trees` returns owned + shared-with-me, deduped
- `perf-cache.test.ts` — public tree without cookie → 200 w/ `Cache-Control: public, s-maxage=60`; with cookie → bypasses cache

### E2E — Playwright (after backend green)

- Signup → inbox (dev: inspect EMAIL binding log) → click verify → landed on /trees
- Login + logout happy path
- Forgot password round-trip
- Owner creates tree, sets to `shared`, invites `bob@example.com`; Bob signs up separately, sees the tree
- Public demo tree loads without login
- Private tree without access → 404
- Perf: demo tree FCP measured, compared against baseline (must be faster)

---

## Implementation Phases (parallel-friendly)

```
PHASE 0  Foundation (2 agents parallel, must all land before Phase 1)
  ├── TASK-F1  Schema migration + new indexes
  └── TASK-F2  Wrangler bindings + Env types

PHASE 1  Libs (3 agents parallel, after Phase 0)
  ├── TASK-L1  Password hashing lib (password.ts + tests)
  ├── TASK-L2  Email lib (email.ts + tests)
  └── TASK-L3  Token lib (tokens.ts + tests)

PHASE 2  Middleware + worker routes (4 agents parallel, after Phase 1)
  ├── TASK-W1  Session middleware (session.ts + tests)
  ├── TASK-W2  Auth routes (auth.ts — signup/verify/login/logout/me/reset + tests)
  ├── TASK-W3  Tree gate + perf Fix 1 (tree.ts, img.ts, tree-query.ts + tests)
  │            └─ INCLUDES: visibility enum reads, canAccessTree, edge cache
  └── TASK-W4  Share routes (shares.ts + trees-list + tests)

PHASE 3  Parallel perf-only + frontend (4 agents parallel, after Phase 2)
  ├── TASK-P1  Perf Fix 2 — immutable assets in worker/index.ts
  ├── TASK-P2  Perf Fix 3 — db.batch() in tree-query.ts
  ├── TASK-F-AUTH  Frontend auth (Login, Signup, Verify, Reset pages + useSession)
  └── TASK-F-SHARE Frontend sharing (My Trees, ShareDialog, TreeView integration)

PHASE 4  Verification (serial, after Phase 3)
  ├── TASK-V1  surface.test.ts + regression coverage update
  ├── TASK-V2  Security review consult (Opus, cross-check all threat rows)
  ├── TASK-V3  Playwright E2E on changed pages  ← see TASK-V3 PLAN below
  └── TASK-V4  Perf re-measurement (FCP, API TTFB before/after table)

---

## TASK-V3 PLAN — Playwright E2E (added 2026-04-23, awaiting approval)

**Tooling:** Add `@playwright/test` + `playwright` as dev dependencies. No MCP
Playwright / claude-in-chrome is available in this session, so the durable
path is to land a real Playwright config in-repo. Same config runs locally
and in CI later.

- `tests/e2e/playwright.config.ts` — `baseURL` from env (default
  `https://heritage.jairukchan.com`), `use: { storageState: ... }` for authed
  suites, chromium-only for v1.
- `tests/e2e/*.spec.ts` — one file per scenario group.
- `pnpm playwright install chromium` (first run).
- Email verify: no inbox available (CF Email not onboarded yet). The specs
  read the raw verify token directly from D1 via a tiny helper that shells to
  `wrangler d1 execute --remote --command "SELECT token_hash, email …"` and
  matches by the most-recent `kind='verify'` row for the test email. This is
  test-scaffolding only; it lives under `tests/e2e/helpers/`.
- Test user hygiene: each spec generates `e2e-${uuid}@example.com` so D1 is
  not polluted by stale rows. Teardown prunes users whose email matches
  `e2e-%@example.com` after each suite.

**Scenarios (Tier 1 = must pass, Tier 2 = should pass):**

| # | Tier | Scenario | Assert |
|---|---|---|---|
| S1 | 1 | Landing (anon) | CTA "ดู demo tree" → /demo/wongsuriya; "เข้าสู่ระบบ" link visible |
| S2 | 1 | Demo tree (/demo/wongsuriya) | Canvas renders ≥ 1 person; no console errors/warnings; FCP measured |
| S3 | 1 | Signup with valid email+password | UI shows "check inbox" copy; 201 from API |
| S4 | 1 | Signup short password (<12) | Inline validation error; no POST fired (or 422) |
| S5 | 1 | Verify flow | Fetch token from D1 → visit /auth/verify?token=… → redirect to /trees logged-in; `GET /api/auth/me` → 200 |
| S6 | 1 | Login valid | /login → right creds → /trees; session cookie `__Host-session` set |
| S7 | 1 | Login wrong password | Generic error copy; stays on /login |
| S8 | 1 | Login unknown email | Same generic error (no enumeration) |
| S9 | 1 | Logout | /api/auth/me after → 401; redirected to /login or landing |
| S10 | 1 | Reset request | /auth/reset → submit → "if email exists" copy regardless |
| S11 | 1 | Reset confirm | Fetch reset token from D1 → /auth/reset/confirm?token=… → submit new pw → land on /login |
| S12 | 2 | /trees as anon | Redirect to /login (or Navigate) |
| S13 | 2 | /tree/<bogus-slug> | 404 UI (no console error); JSON response 404 |
| S14 | 2 | Create test tree via API | `POST /api/trees` with test session → 201; appears in /trees |
| S15 | 2 | Share dialog opens for owner | On /tree/<owned-slug>, "แชร์" button visible → opens modal with 3 radios |
| S16 | 2 | Visibility flip purges edge cache | Owner flips public→private; anon fetch → 404 (regression for N-R3-3) |
| S17 | 2 | Invite email auto-accept flow | Verified user A invites verified user B by email; B sees tree in /trees immediately |
| S18 | 2 | Forged Origin from browser console | `fetch('/api/auth/logout', {method: 'POST', headers: {Origin: 'https://evil'}})` → 403 |

**Out of scope for V3** (defer to follow-up):
- Screenshot-visual regression (looks/colors) — requires Percy/Chromatic.
- Cross-browser (Firefox, WebKit).
- Accessibility (axe-core) — low value while UI is still skeleton.
- Mobile viewports — demo tree's canvas isn't responsive yet.

**Risks to call out before approval:**
1. Prod E2E creates real D1 rows in `users`, `sessions`, `auth_tokens`,
   `tree_shares`. Cleanup runs after each suite but a crashing spec can leave
   drift. Mitigation: teardown idempotent + a `pnpm e2e:cleanup` script that
   purges `e2e-%@example.com` across all auth tables.
2. Rate-limit bindings (`RL_LOGIN`: 5/min/email, `RL_LOGIN_IP`: 20/min/IP)
   will block rapid repeated login specs. Mitigation: each spec uses a fresh
   email; login-failure specs are scoped so the 5/min bucket for any one
   email is not exhausted. IP limit is tenant-global though — if CI runs
   many specs from one runner IP, we hit it. Mitigation: accept 429 as a
   valid "rate limit is working" assertion in the one spec that tests it;
   serialize other specs.
3. No email inbox means we read verify / reset tokens from D1. Acceptable
   for E2E; production verify/reset still goes through email.

**What "pass" looks like for TASK-V3:**
- All Tier 1 scenarios green on `pnpm e2e` against prod.
- All Tier 2 scenarios green OR explicitly skipped with reason.
- Zero uncaught console errors on any page.
- Report in `agent-temp/e2e-run-2026-04-23.md` with timings + screenshots of
  any failures.

PHASE 5  Ship prep (serial, after Phase 4 — USER CONFIRMS BEFORE EACH)
  ├── TASK-S1  CF Email domain onboard + DNS verify
  ├── TASK-S2  wrangler secret put SESSION_SECRET
  ├── TASK-S3  Deploy to prod (via CI, not CLI — see deploy skill)
  └── TASK-S4  Follow-up migration to DROP is_public  (optional, deferred)
```

### File-lock notes (prevents parallel-agent collisions)

| File | Exclusive owner |
|---|---|
| `src/db/schema.ts` | TASK-F1 then TASK-S4 |
| `drizzle/migrations/*` | TASK-F1 then TASK-S4 |
| `wrangler.jsonc` | TASK-F2 |
| `worker-configuration.d.ts` | regenerated by TASK-F2; other tasks read-only |
| `src/worker/types.ts` | TASK-F2 |
| `src/worker/lib/password.ts` | TASK-L1 |
| `src/worker/lib/email.ts` | TASK-L2 |
| `src/worker/lib/tokens.ts` | TASK-L3 |
| `src/worker/middleware/session.ts` | TASK-W1 |
| `src/worker/routes/auth.ts` | TASK-W2 |
| `src/worker/routes/tree.ts` | TASK-W3 |
| `src/worker/routes/img.ts` | TASK-W3 |
| `src/worker/lib/tree-query.ts` | TASK-W3, then TASK-P2 (serialize) |
| `src/worker/routes/shares.ts` | TASK-W4 |
| `src/worker/index.ts` | serialise: TASK-W2 → TASK-W3 → TASK-W4 → TASK-P1 (each appends new mount lines) |
| `src/app/App.tsx` | serialise: TASK-F-AUTH → TASK-F-SHARE |
| `src/app/pages/Landing.tsx` | TASK-F-SHARE |
| `src/app/pages/TreeView.tsx` | TASK-F-SHARE |
| `src/app/pages/Login.tsx` (new) | TASK-F-AUTH |
| `src/app/pages/Signup.tsx` (new) | TASK-F-AUTH |
| `src/app/pages/Verify.tsx` (new) | TASK-F-AUTH |
| `src/app/pages/ResetPassword.tsx` (new) | TASK-F-AUTH |
| `src/app/pages/Trees.tsx` (new) | TASK-F-SHARE |
| `src/app/components/ShareDialog.tsx` (new) | TASK-F-SHARE |
| `src/app/hooks/useSession.ts` (new) | TASK-F-AUTH |
| `src/app/lib/api.ts` | serialise: TASK-F-AUTH → TASK-F-SHARE |
| `src/app/lib/types.ts` | TASK-F-SHARE (adds visibility to TreeMeta, removes inviteCode) |
| `tests/helpers/sqlite-d1.ts` | TASK-F1 (INLINE_DDL update) |
| `tests/helpers/mock-env.ts` | TASK-F2 (SESSION_SECRET + EMAIL + RL bindings in mock) |
| `tests/integration/*.test.ts` | per-task owner; surface.test.ts updated by TASK-V1 |

---

## Key technical decisions (finalised from research)

| Area | Decision | Source |
|---|---|---|
| Password hash | `node:crypto.scryptSync` N=16384 r=8 p=1 keylen=64 | R001 §1 |
| Session token | 32-byte random → base64url cookie → sha256 hex → `sessions.token_hash` | R001 §2 |
| Cookie name/flags | `__Host-session; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=1209600` | R001 §2 |
| Session lifetime | 14d sliding; refresh when < 7d remain | R001 §2, requirements Q2 |
| CSRF | `hono/csrf` (Origin + Sec-Fetch-Site) on auth sub-router only | R001 §3 |
| Rate limit | CF `ratelimits` bindings `RL_LOGIN` (email, 5/min) + `RL_LOGIN_IP` (IP, 20/min) | R001 §4 |
| Email sending | CF Email Service `send_email` binding `EMAIL`, from `noreply@jairukchan.com` | R004 §1-2 |
| Verify token TTL | 24 h | R004 §8 + standard |
| Password-reset token TTL | 1 h | R004 §9 |
| Token storage | Reuse `auth_tokens` table (token_hash, email, expires_at, used_at) — distinguish purpose by a new `kind` column or token prefix (decide: add `kind` column = simpler) | R003 + R001 |
| Signup flow | Open, email verification required before first login can establish session | requirements Q1 |
| Pending-share resolution | In **verify handler**, after `email_verified_at` set | R005 §8 |
| Unknown-tree / no-access | Always 404 (anti-enumeration); unify tree.ts + img.ts | R005 §7 |
| Visibility enum | `public | private | shared`; keep `is_public` one migration cycle, drop later | R005 §4 |
| Share roles | Schema enum = `viewer | editor`; UI exposes only `viewer` in v1 | R005 §5 |
| Edge cache policy | Public tree + no session cookie → `s-maxage=60, stale-while-revalidate=300` + `caches.default` | R002 §4 Fix 1 + cross-track decision |
| Asset cache | `max-age=31536000, immutable` for `/assets/*` | R002 §4 Fix 2 |
| DB batch | Use `db.batch()` for `lineage_members` fan-out + add index | R002 §4 Fix 3 |
| Demo URL | `/demo/wongsuriya` kept as alias; `/tree/wongsuriya` added as canonical | R005 §3 |
| MailChannels | Do NOT consider — dead since 2024-08. Resend is the only fallback if CF Email flakes | R004 §10 |

---

## Agent staffing (who does what, which model)

| Task | Model | Agent type | Parallel group |
|---|---|---|---|
| TASK-F1 | Sonnet 4.6 | general-purpose | Phase 0 |
| TASK-F2 | Sonnet 4.6 | general-purpose | Phase 0 |
| TASK-L1 | Sonnet 4.6 | general-purpose | Phase 1 |
| TASK-L2 | Sonnet 4.6 | general-purpose | Phase 1 |
| TASK-L3 | Sonnet 4.6 | general-purpose | Phase 1 |
| TASK-W1 | Sonnet 4.6 | general-purpose | Phase 2 |
| TASK-W2 | Sonnet 4.6 | general-purpose | Phase 2 |
| TASK-W3 | Sonnet 4.6 | general-purpose | Phase 2 |
| TASK-W4 | Sonnet 4.6 | general-purpose | Phase 2 |
| TASK-P1 | Sonnet 4.6 | general-purpose | Phase 3 |
| TASK-P2 | Sonnet 4.6 | general-purpose | Phase 3 |
| TASK-F-AUTH | Sonnet 4.6 | general-purpose | Phase 3 |
| TASK-F-SHARE | Sonnet 4.6 | general-purpose | Phase 3 |
| TASK-V1 | Sonnet 4.6 | general-purpose | Phase 4 |
| TASK-V2 | **Opus 4.6** | general-purpose | Phase 4 (security — critical) |
| TASK-V3 | Sonnet 4.6 | general-purpose | Phase 4 |
| TASK-V4 | Sonnet 4.6 | general-purpose | Phase 4 |

Main agent (coordinator, Opus 4.6) reviews each phase before dispatching next.

---

## Success criteria

- All unit + integration tests green
- Playwright E2E covers: signup → verify → login → create tree → share → logout → login-as-invitee → see shared tree
- FCP on demo tree improves measurably vs baseline (current 4292 ms); user said "just faster, no hard number" but we target < 2500 ms cold
- `/api/tree/wongsuriya` TTFB drops from 400–2500 ms → < 20 ms on warm edge cache
- Security-review checklist: every H/M row from pre-remediation has a passing test
- `dist/` and `worker-configuration.d.ts` regenerated and CI green
