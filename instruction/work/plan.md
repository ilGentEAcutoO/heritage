# Plan — Magic-link login via Cloudflare Email Service

> Created: 2026-04-23 17:30 (+07)
> Source: `requirements.md` (same dir)
> Workers Paid plan: ✅ confirmed by user 2026-04-23 17:25 (+07)

---

## Architecture — what changes, what stays

```
┌────────────────────────────────────────────────────────────────────┐
│ AUTH SURFACE (additions marked ← NEW)                              │
│  POST /api/auth/signup             (unchanged; password path)      │
│  POST /api/auth/verify             (unchanged; kind='verify')      │
│  POST /api/auth/login              (unchanged; password path)      │
│  POST /api/auth/request-reset      (unchanged; kind='reset')       │
│  POST /api/auth/reset              (unchanged)                     │
│  POST /api/auth/logout             (unchanged)                     │
│  GET  /api/auth/me                 (unchanged)                     │
│  POST /api/auth/magic/request      ← NEW  — issues magic token     │
│  POST /api/auth/magic/consume      ← NEW  — consumes, issues sess  │
│  GET  /auth/magic                  ← NEW  (SPA route) — landing    │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ D1 SCHEMA DELTA                                                    │
│  auth_tokens.kind CHECK  IN ('verify','reset')                     │
│                        → IN ('verify','reset','magic')  ← migration 0005 │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ INFRA (wrangler.jsonc + CF account)                                │
│  send_email: [{ name: "EMAIL" }]                                   │
│             → [{ name: "EMAIL", remote: true }]  ← Email Service   │
│  +  onboard jairukchan.com in CF Email Sending (outbound)          │
│  +  enable CF Email Routing (inbound, catch-all)                   │
│  +  DNS: SPF, DKIM, DMARC (outbound) + MX x5 (Email Routing)       │
│  +  Routing rule: *@jairukchan.com → suanwin.paows@gmail.com       │
│                                                                    │
│  FROM: "Heritage" <heritage@jairukchan.com>                        │
│  Reply-To: heritage@jairukchan.com (replies forward to owner via   │
│                                     Email Routing catch-all)       │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ FRONTEND                                                           │
│  Login.tsx   — add tab "Send magic link" alongside password form   │
│  Magic.tsx   ← NEW — landing page for /auth/magic?token=…          │
│  App.tsx     — register <Route path="/auth/magic" />               │
└────────────────────────────────────────────────────────────────────┘
```

**Unchanged:** session issuance (`issueSession`), origin-check CSRF, scrypt password hashing, token CAS helper, `__Host-session` cookie attributes, Zod schemas on existing routes, security headers, cron session-cleanup.

---

## Sequencing — seven phases, TDD-first

**M0 (prep) ▸ M1 (infra) ‖ M2 (migration) ▸ M3 (backend) ‖ M4 (frontend) ‖ M5 (email) ▸ M6 (verify) ▸ M7 (ship)**

Legend: `▸` = sequential, `‖` = parallel.

After M0 + M1 + M2 land, the three implementation phases (M3/M4/M5) run as three parallel sub-agents. M6 gates on all three. M7 ships.

---

## Phase M0 — Preflight (coordinator-only, no code)

**Goal:** get both CF email products live on `jairukchan.com` — **Email Service** for outbound sending and **Email Routing** for inbound reply capture — before any code references them.

### Current state (probed via CF API + public DNS on 2026-04-23 17:45)

**✅ Already in place — DO NOT duplicate:**

| Item | State | Source |
|------|-------|--------|
| Email Routing enabled on zone `jairukchan.com` | `status: "ready", synced: true` since 2021-12 | `GET /zones/{zone_id}/email/routing` |
| Email Routing MX | `amir.mx.cloudflare.net` (26), `isaac.mx.cloudflare.net` (40), `linda.mx.cloudflare.net` (84) | `dig MX jairukchan.com` |
| SPF at root | `v=spf1 include:_spf.mx.cloudflare.net ~all` | `dig TXT jairukchan.com` |
| DKIM | `cf2024-1._domainkey` published (2048-bit RSA) | `dig TXT cf2024-1._domainkey.jairukchan.com` |
| Destination `suanwin.paows@gmail.com` | verified (used in 2 existing rules) | `GET /accounts/{id}/email/routing/addresses` |
| Existing forward rules | `solucky/kanchanawadi/suanlomphai/suansinphut@jairukchan.com` | `GET /zones/{zone_id}/email/routing/rules` |

**⚠ Still to add for this plan:**

| Gap | Action | Where |
|-----|--------|-------|
| **DMARC record missing** | CF Email Sending onboarding auto-proposes it | CF Dashboard |
| **Email Sending domain not onboarded** | API `/email/sending/domains` returned 401 — Email Service not enabled for `jairukchan.com` yet | CF Dashboard (user-only) |
| **Possibly additional DKIM selector** | CF may propose `cf2024-2` or similar during onboarding | CF Dashboard |
| **Possibly cf-bounce MX** | CF may propose during onboarding (not present today) | CF Dashboard |
| **Routing rule for `heritage@jairukchan.com`** | Currently catch-all is **disabled + drop** — mail to `heritage@` silently lost today | CF Dashboard |

### M0a — Outbound (CF Email Service) — USER action

1. CF Dashboard → **Account → Email Sending** (not zone-level Email Routing!) → Onboard domain `jairukchan.com`.
2. CF stages DNS records — **user approves + publishes** via the dashboard prompt. Expected additions:
   - DMARC TXT at `_dmarc.jairukchan.com` (e.g., `v=DMARC1; p=none; rua=...`)
   - Possibly `cf2024-2._domainkey` TXT
   - Possibly `cf-bounce.jairukchan.com` MX
   - SPF stays unchanged — the existing `_spf.mx.cloudflare.net` include already covers Email Service.
3. After publish: **agent verifies** `GET /accounts/{id}/email/sending/domains/jairukchan.com` returns `"verified": true`.

### M0b — Inbound routing: enable catch-all forward (user-confirmed option B, 2026-04-23 17:50)

- Dashboard → zone `jairukchan.com` → Email → Email Routing → **Catch-all address** → Edit
  - Toggle Enable **ON**
  - Action: Send to → `suanwin.paows@gmail.com`
- Rationale: future-proof for multi-service senders (`support@`, `billing@`, etc.) + recovers silently-dropped typo mail.
- Existing 4 explicit forwards stay intact (rule priority 0 > catch-all priority 2147483647), so their behavior is unchanged.

**Smoke test:** send mail from external inbox → `heritage@jairukchan.com` → arrives at `suanwin.paows@gmail.com` within ~2 min.

### Acceptance for M0

- Outbound: `GET .../email/sending/domains/jairukchan.com` returns `"verified": true`.
- Inbound: `heritage@jairukchan.com` → owner Gmail smoke passes.
- DMARC TXT present at `_dmarc.jairukchan.com`.

**If M0 fails** (plan blocks / beta not rolled out / DNS conflict): pause, report, ask user for direction. **Q9 default (no fallback without asking)** still stands.

---

## Phase M1 — Switch `EMAIL` binding to Email Service

**Depends on:** M0 complete. **Parallel with:** M2.

### Implementation steps

1. **`wrangler.jsonc`** — edit the `send_email` block:
   ```jsonc
   "send_email": [
     { "name": "EMAIL", "remote": true }
   ]
   ```
2. **Regenerate worker types:** `pnpm cf-typegen`. Confirm `Env.EMAIL` stays assignable to our `SendEmailBinding` interface in `lib/email.ts`.
3. **No change needed in `lib/email.ts`** — the structural type already matches; `binding.send()` signature is compatible.
4. **Deploy to staging (preview alias)** — use `wrangler versions upload --preview` then smoke-test send from a preview URL if available; otherwise gate this on M7 prod deploy.

### Acceptance for M1

- `pnpm typecheck` clean after `cf-typegen` regen.
- `pnpm test` still 379/379 (no test touches the binding directly — all tests inject a fake `SendEmailBinding`).
- Deployed build can send to a **non-verified** recipient (tested in M7 smoke).

---

## Phase M2 — Migration 0005: extend `auth_tokens.kind` CHECK

**Depends on:** none. **Parallel with:** M1.

### Test specifications (RED tests)

New file `tests/integration/auth-magic-schema.test.ts`:

1. **M2-T1** — Insert `auth_tokens.kind='magic'` with valid token row → success (currently fails: CHECK reject).
2. **M2-T2** — Insert `auth_tokens.kind='bogus'` → still fails (regression guard).
3. **M2-T3** — Existing rows with `kind='verify'` and `kind='reset'` still work (migration is additive).

### Implementation steps

1. **Hand-write migration `drizzle/migrations/0005_extend_auth_tokens_kind.sql`** — same 3-phase rebuild pattern used in 0004:
   ```sql
   PRAGMA defer_foreign_keys = ON;
   CREATE TABLE "__new_auth_tokens" (
     `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
     `token_hash` text NOT NULL,
     `email` text,
     `expires_at` integer,
     `used_at` integer,
     `created_at` integer DEFAULT (unixepoch()) NOT NULL,
     `kind` text DEFAULT 'verify' NOT NULL
       CHECK (`kind` IN ('verify','reset','magic'))
   );
   INSERT INTO "__new_auth_tokens" SELECT * FROM "auth_tokens";
   DROP TABLE "auth_tokens";
   ALTER TABLE "__new_auth_tokens" RENAME TO "auth_tokens";
   PRAGMA defer_foreign_keys = OFF;
   ```
2. **`src/db/schema.ts`** — update the Drizzle enum type for `authTokens.kind` to `'verify' | 'reset' | 'magic'`.
3. **`pnpm db:migrate:local`** — apply locally.
4. Run S3's existing schema-roundtrip + check-constraints tests — confirm green.

### Acceptance for M2

- M2-T1/T2/T3 all pass.
- `pnpm test` green (≥ 382/382).
- `pnpm typecheck` clean.
- Migration applies cleanly on local D1.

---

## Phase M3 — Backend routes (request + consume)

**Depends on:** M2 GREEN.

### Test specifications (RED first)

New file `tests/integration/auth-magic.test.ts`:

**Request endpoint (`POST /api/auth/magic/request`):**
1. **M3-T1** — Valid body `{ email }` for existing verified user → 200 `{ message: "If an account exists, we sent a link" }`; DB has one new `auth_tokens` row with `kind='magic', expires_at = now + 15min`; email binding was called once.
2. **M3-T2** — Unknown email → **same 200 response**, no row inserted, binding NOT called (but identical response time must be within 50ms of T1 — record and assert).
3. **M3-T3** — Unverified user (exists but `verified_at IS NULL`) → same neutral 200, no row inserted.
4. **M3-T4** — Malformed email → 400 Zod error (same shape as other auth endpoints).
5. **M3-T5** — 6th request from same email within 60s → 429 (reuses `RL_LOGIN`).
6. **M3-T6** — 21st request from same IP within 60s → 429 (reuses `RL_LOGIN_IP`).
7. **M3-T7** — Origin-check: POST with `Origin: https://evil.com` → 403 (middleware guard).

**Consume endpoint (`POST /api/auth/magic/consume`):**
8. **M3-T8** — Valid token → 200 with user JSON, `__Host-session` cookie set, `auth_tokens.used_at` flipped, matching `sessions` row inserted.
9. **M3-T9** — Expired token → 400 `{ message: "Link expired or already used" }`.
10. **M3-T10** — Already-used token (replay) → 400 same neutral copy.
11. **M3-T11** — Wrong kind (pass a `verify` token to `/magic/consume`) → 400 neutral copy (CAS filters by `kind='magic'`).
12. **M3-T12** — Garbage token (random hex) → 400 neutral copy.
13. **M3-T13** — Missing body → 400 Zod error.

### Implementation steps

1. **`src/worker/routes/auth.ts`** — add two new routes alongside existing auth. Reuse `RL_LOGIN` and `RL_LOGIN_IP` middlewares.

   ```ts
   // POST /api/auth/magic/request
   // Zod: { email: z.string().email() }
   // - rate-limit email + IP
   // - lookup user; if missing/unverified: return neutral 200 WITHOUT sending
   //   (but sleep for constant-time bound; see below)
   // - if user found: createEmailToken(), insert row kind='magic', expires 15min,
   //   sendMagicLinkEmail(c.env.EMAIL, { to, token, appUrl })
   // - return { message: "If an account exists, we sent a link" }

   // POST /api/auth/magic/consume
   // Zod: { token: z.string().min(32).max(128) }
   // - hashToken(raw) → token_hash
   // - UPDATE auth_tokens SET used_at = now
   //     WHERE token_hash = ? AND kind='magic' AND used_at IS NULL AND expires_at > now
   //     RETURNING email
   // - if no row: return 400 "Link expired or already used"
   // - lookup user by email; if missing → 400 (shouldn't happen but guard)
   // - issueSession(c, user.id) → sets cookie
   // - return { user: { id, email, displayName } }
   ```

2. **Timing-safe neutrality** — both endpoints must have comparable response times for user-exists vs not. Cheap fix: always run a constant-time `hashToken` call on the happy path; on the no-user path, also do one `hashToken` of a synthetic value to burn the same CPU. Not cryptographically rigorous but adequate to blur timing enumeration for our scale.

3. **No change needed** to `lib/tokens.ts` — `createEmailToken()` already returns `{ raw, hash }` usable as-is.

### Acceptance for M3

- M3-T1…T13 all green (13 tests).
- `pnpm typecheck` clean.
- No change to existing auth routes' behavior.

---

## Phase M4 — Frontend UI (`/login` tab + `/auth/magic` landing)

**Depends on:** M3 routes exist (stub is fine for parallel work).

### Test specifications

New Playwright e2e spec `tests/e2e/10-magic-link.spec.ts`:

1. **M4-T1** — From `/login`, user clicks "Send magic link" tab → form shows only email field; submitting a valid email shows neutral "Check your inbox" copy.
2. **M4-T2** — Visiting `/auth/magic?token=<valid>` shows "Signing you in…" spinner, then redirects to `/trees` after ~1s with `__Host-session` cookie set.
3. **M4-T3** — Visiting `/auth/magic?token=<expired>` shows "Link expired or already used" error + "Request a new link" button linking to `/login?tab=magic`.
4. **M4-T4** — Visiting `/auth/magic` without `?token=` → redirects to `/login?tab=magic`.
5. **M4-T5** — Cross-feature regression: existing `/login` password flow still works (S6 from prior suite).

### Implementation steps

1. **`src/app/pages/Login.tsx`** — add a tab switcher above the form. Two tabs: "Password" (existing default) and "Magic link". The magic tab shows only an email input + submit; on submit calls `POST /api/auth/magic/request` and shows the neutral success copy inline.
2. **`src/app/pages/Magic.tsx`** (new) — auto-posts `{ token: searchParams.get('token') }` to `/api/auth/magic/consume` on mount. On 200 → `navigate('/trees')`. On 400 → show error UI with a retry link.
3. **`src/app/App.tsx`** (or wherever react-router routes live) — register `<Route path="/auth/magic" element={<Magic />} />`.
4. **`src/app/lib/api.ts`** — add two client helpers: `requestMagicLink(email)` and `consumeMagicLink(token)`. Keep the existing `api` fetch wrapper conventions.
5. **Styling** — match existing login form's visual language; no new CSS system.

### Acceptance for M4

- M4-T1…T5 green via Playwright (run locally against dev server, then against prod in M7).
- No console errors on any of the three flows.
- Existing `04-login.spec.ts` + `05-logout.spec.ts` + `06-reset.spec.ts` still green.

---

## Phase M5 — Email template (`sendMagicLinkEmail`) + sender switch

### Sender change (all three templates)

- `src/worker/lib/email.ts`:
  - `FROM_ADDRESS = 'heritage@jairukchan.com'` (was `noreply@jairukchan.com`)
  - `FROM_NAME = 'Heritage'` (unchanged)
  - Add `REPLY_TO = 'heritage@jairukchan.com'` and include it in every `binding.send({ replyTo: REPLY_TO, ... })` so reply chains land back in the Email Routing catch-all → owner Gmail
- Applies to `sendVerificationEmail`, `sendPasswordResetEmail`, and the new `sendMagicLinkEmail` — one sender identity across all three for deliverability consistency.



**Depends on:** none (standalone export, M1 migration must land before deploy).

### Test specifications

Extend `tests/unit/email.test.ts` (create if missing):

1. **M5-T1** — `sendMagicLinkEmail(fake, { to, token, appUrl })` calls `fake.send` once with `to === options.to`, `from.email === FROM_ADDRESS`, subject in both TH/EN, link contains `/auth/magic?token=<encoded>`.
2. **M5-T2** — Link URL-encoding: special chars in token (e.g., `+/=`) are percent-encoded.
3. **M5-T3** — HTML body has **no** interpolation of user-controlled content beyond the sanitised URL (XSS guard — token is already `[A-Za-z0-9_-]+` from `createEmailToken`, but regression-guard the escape).

### Implementation steps

1. **`src/worker/lib/email.ts`** — first switch the shared constants (see "Sender change" above), then add a third exported function `sendMagicLinkEmail` mirroring the existing two:
   - bilingual TH/EN body
   - 15-min TTL messaging
   - primary CTA button styled with a distinct accent color (to differentiate from verify/reset at a glance)
   - link to `${appUrl}/auth/magic?token=${encodeURIComponent(token)}`
   - `replyTo: REPLY_TO` included in `binding.send(...)`

### Acceptance for M5

- M5-T1/T2/T3 green.
- New function exports cleanly; `lib/email.ts` retains no duplication (shared HTML shell extracted as an internal helper if repetition crosses 3 copies, otherwise inline).

---

## Phase M6 — Verification (coordinator, pre-deploy)

Run top-to-bottom after M3 / M4 / M5 all GREEN:

1. `pnpm typecheck` → clean.
2. `pnpm test` → all green; record total (expect ~379 + ~17 new = ~396).
3. `pnpm e2e` → all green against `E2E_BASE_URL=http://localhost:8787` (local wrangler dev).
4. `pnpm audit --json` → 0 vulns preserved.
5. `pnpm build` → clean.
6. Local smoke with `wrangler dev --local` + a real inbox you control (tunneled via `cloudflared` if needed):
   - Signup → receive verify email → verify → login (existing password) → works.
   - Request magic link → receive magic email → click → land at `/trees` with session.

---

## Phase M7 — Ship

1. **Push** commits to `main`. GH Actions CI runs — must stay green.
2. **Trigger Deploy workflow** via `gh workflow run deploy.yml`.
3. **Apply migration 0005** to prod D1: `pnpm db:migrate:remote` (user-gated per D7 from prior session — but as long as we preserve the prior override reasoning (prod D1 low-risk), apply immediately after deploy).
4. **Prod smoke:**
   - `curl https://heritage.jairukchan.com/api/health` → 200
   - Request magic link via UI → receive email at a real test inbox → click → signed in
   - Existing password login still works (regression guard)
5. **Run `pnpm e2e`** against prod (18 prior + 5 new = 23 total) — all green.
6. **Update `instruction/security-review.md`** with a "2026-04-MM — magic-link feature ships, CF Email Service verified live" note.

---

## Security considerations

**Reused primitives (kept intact):**

- `__Host-session` cookie, scrypt hashes, origin-check CSRF, rate-limit bindings, Zod on every input, token CAS via `UPDATE ... RETURNING`.

**New considerations introduced by this plan:**

1. **Enumeration resistance on `/magic/request`** — neutral response copy + constant-time hash on the no-user path. Not perfect timing isolation but closes the obvious gap.
2. **Magic-link is a password-equivalent** — treat the raw token as a high-value secret. Never log it (even in `console.log` on error paths). Never include in error messages.
3. **HTTPS-only link** — `appUrl` comes from `getValidatedEnv()` which already enforces `https://`. Double-check in the email template.
4. **Token entropy** — `createEmailToken` already yields 256 bits (base64url, 43 chars). No change.
5. **Single-use** — CAS via `UPDATE auth_tokens SET used_at = now WHERE used_at IS NULL` ensures exactly one consume.
6. **TTL** — 15 min, short enough that a leaked email (intercepted, forwarded) has a narrow window. Longer than reset (1h) is tempting for UX but security wins.
7. **Rate-limiter scope** — reusing `RL_LOGIN` (per-email 5/min) means a legitimate user stuck in a reset loop could also lock out magic. Accept this — both are the same "proving email control" bucket.
8. **Cross-kind CAS guard** — `UPDATE ... WHERE kind='magic'` in the consume endpoint prevents a verify- or reset-link from being replayed as a magic login.
9. **DNS safety** — agent does NOT publish DNS records directly. Only after user approves the staged records in the CF dashboard. Revert path: remove DNS records via dashboard.
10. **Email deliverability** — CF Email Service manages sender reputation; no action for us beyond publishing SPF/DKIM/DMARC which CF auto-stages.
11. **Reply leak risk** — catch-all routing forwards **every** `*@jairukchan.com` to owner Gmail. Malicious senders could use this to spam the owner. Mitigate by: (a) keeping the destination an owner-controlled Gmail with standard spam filter; (b) optionally tightening to explicit rule `heritage@...` after multi-service need is actually real, not speculative. Start permissive (catch-all) since the attack surface here is just spam, not data exposure.
12. **Inbound scope** — Email Routing is inbound only, no outbound from the routed address (CF disallows "reply-from" on routed inboxes). Replies appear to come from the owner's real Gmail when the owner responds — acceptable for a single-owner product.

---

## Parallel-execution plan

```
M0 (coordinator only; user gates M0 completion)
 │
 ▼
M1 (one agent, Sonnet 4.6) ─┐
M2 (one agent, Sonnet 4.6) ─┤── can run in parallel after M0
                            ▼
                  M2 GREEN opens M3
                            │
 ┌──────────────────────────┼──────────────────────────┐
 ▼                          ▼                          ▼
M3 (Sonnet 4.6)         M4 (Sonnet 4.6)         M5 (Sonnet 4.6)
 backend routes          frontend UI             email template
   + tests                 + e2e                   + unit tests
 │                          │                          │
 └──────────────────────────┴──────────────────────────┘
                            │
                            ▼
                  M6 (coordinator; Opus 4.6)
                  full verify suite
                            │
                            ▼
                  M7 (coordinator; Opus 4.6)
                  ship + smoke
```

**File locks (disjoint, no overlap):**
- M1: `wrangler.jsonc`, `worker-configuration.d.ts` (regenerated)
- M2: `drizzle/migrations/0005_*.sql`, `src/db/schema.ts`, `tests/integration/auth-magic-schema.test.ts`
- M3: `src/worker/routes/auth.ts`, `tests/integration/auth-magic.test.ts`
- M4: `src/app/pages/Login.tsx`, `src/app/pages/Magic.tsx` (new), `src/app/App.tsx`, `src/app/lib/api.ts`, `tests/e2e/10-magic-link.spec.ts`
- M5: `src/worker/lib/email.ts`, `tests/unit/email.test.ts`
- M6/M7: no file changes except `instruction/security-review.md` in M7

---

## Reference to security-checklist

This plan does NOT introduce new P0/P1/P2 items to the security review — it extends auth with a new mechanism that reuses the already-audited primitives. After M7 ships, `instruction/security-review.md` gets an informational note about the magic-link addition (no new findings expected).

## Reference to decisions

User-confirmed defaults (2026-04-23 17:25–17:40 +07):
- **Q1** Coexist with email+password
- **Q2** Workers Paid plan ✅
- **Q3** Migrate verify + reset emails to Email Service in same plan
- **Q4** Agent stages DNS, user approves before publish
- **Q5** `heritage@jairukchan.com` (product-scoped; anticipates future multi-service senders)
- **Q5b** Inbound replies: CF Email Routing catch-all `*@jairukchan.com` → `suanwin.paows@gmail.com`
- **Q6** 15-min TTL, single-use, reuse RL_LOGIN (5/min/email) + RL_LOGIN_IP (20/min/IP)
- **Q7** Skip DO rate-limiter (separate plan)
- **Q8** Skip major dep bumps (separate plan)
- **Q9** No third-party fallback without asking
