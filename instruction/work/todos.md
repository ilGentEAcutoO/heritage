# Active Tasks — Magic-link login via Cloudflare Email Service

> Last updated: 2026-04-23 17:30 (+07)
> Plan ref: `instruction/work/plan.md`
> Requirements ref: `instruction/work/requirements.md`

## Approval gate

User must say **"ลุย"** / **"go"** / **"approve"** (or specify overrides) before TASK-M0 enters in_progress.

---

## TASK-M0 — Preflight: outbound (Email Service) + inbound (Email Routing) setup

- Status: ⚪ pending
- Model: Opus 4.6 (coordinator — interacts with user + CF API)
- Dependencies: —
- Files touched: none (CF dashboard + DNS only)

### ✅ Already in place (verified 2026-04-23 17:45 via CF API + public DNS)
- Email Routing enabled on zone; MX `amir/isaac/linda.mx.cloudflare.net` live
- SPF `v=spf1 include:_spf.mx.cloudflare.net ~all` at root (covers both products)
- DKIM `cf2024-1._domainkey` published
- Destination `suanwin.paows@gmail.com` already verified
- 4 existing forward rules (`solucky/kanchanawadi/suanlomphai/suansinphut@`)

### M0a — Outbound (Email Service) — **USER-ONLY in CF Dashboard**
- Sub-tasks:
  - [ ] Agent: confirm current 401 on `GET /accounts/{id}/email/sending/domains` → means not onboarded yet
  - [ ] **USER:** Dashboard → Account → **Email Sending** → Onboard domain `jairukchan.com`
  - [ ] **USER:** approve CF-proposed DNS records:
    - [ ] DMARC TXT at `_dmarc.jairukchan.com` (currently missing)
    - [ ] Any additional DKIM selector CF proposes (e.g., `cf2024-2._domainkey`)
    - [ ] Bounce MX on `cf-bounce.jairukchan.com` if proposed
  - [ ] Agent: curl `GET .../email/sending/domains/jairukchan.com` → assert `"verified": true`

### M0b — Inbound routing: catch-all forward (option B, user-confirmed 2026-04-23 17:50)
- Sub-tasks:
  - [ ] **USER:** Dashboard → zone `jairukchan.com` → Email → Email Routing → **Catch-all address** → Edit
    - Toggle Enable **ON**
    - Forward to: `suanwin.paows@gmail.com`
  - [ ] Agent or user: send test email from external inbox → `heritage@jairukchan.com` → confirm arrives at `suanwin.paows@gmail.com`

### Acceptance M0
- Outbound: `verified: true` in Email Sending API
- Inbound: test email to `heritage@jairukchan.com` arrives at owner Gmail
- DMARC TXT live at `_dmarc.jairukchan.com`

**Blocker protocol:** if plan/beta blocks access → pause + escalate (Q9: no fallback without asking).

---

## TASK-M1 — Switch `EMAIL` binding to Email Service (`remote: true`)

- Status: ⚪ pending
- Model: Sonnet 4.6
- Dependencies: TASK-M0 verified
- Files (exclusive lock):
  - `wrangler.jsonc` (modify)
  - `worker-configuration.d.ts` (regenerated via `cf-typegen`)
- Sub-tasks:
  - [ ] Edit `send_email` block → add `"remote": true`
  - [ ] `pnpm cf-typegen`
  - [ ] `pnpm typecheck` clean
  - [ ] `pnpm test` 379/379 still green (no binding-adjacent tests should break)
- Acceptance: typecheck clean; tests unchanged; binding config reflects Email Service.

---

## TASK-M2 — Migration 0005: add `'magic'` to `auth_tokens.kind`

- Status: ⚪ pending
- Model: Sonnet 4.6
- Dependencies: —  (parallel with M1)
- Files (exclusive lock):
  - `drizzle/migrations/0005_extend_auth_tokens_kind.sql` (create — hand-written)
  - `drizzle/migrations/meta/0005_snapshot.json` (via `pnpm db:generate` or manual)
  - `drizzle/migrations/meta/_journal.json` (regenerated)
  - `src/db/schema.ts` (modify enum type)
  - `tests/integration/auth-magic-schema.test.ts` (create — 3 tests)
- Sub-tasks:
  - [ ] RED: write M2-T1/T2/T3, confirm T1 fails on current schema
  - [ ] Hand-write migration 0005 using 3-phase rebuild pattern from 0004
  - [ ] Update Drizzle `authTokens.kind` enum to include `'magic'`
  - [ ] `pnpm db:migrate:local` applies cleanly
  - [ ] Tests GREEN; full suite still green
  - [ ] `pnpm typecheck` clean
- Acceptance: M2-T1/T2/T3 green; S3 existing schema-constraint tests still green.

---

## TASK-M3 — Backend: `/api/auth/magic/{request,consume}` routes

- Status: ⚪ pending
- Model: Sonnet 4.6
- Dependencies: TASK-M2 GREEN (needs `kind='magic'` DB support)
- Files (exclusive lock):
  - `src/worker/routes/auth.ts` (modify — append two new routes)
  - `tests/integration/auth-magic.test.ts` (create — 13 tests)
- Sub-tasks:
  - [ ] RED: write M3-T1…T13 test suite; confirm all fail
  - [ ] Implement `POST /api/auth/magic/request` (Zod, RL_LOGIN, RL_LOGIN_IP, constant-time branch, createEmailToken, sendMagicLinkEmail)
  - [ ] Implement `POST /api/auth/magic/consume` (Zod, hashToken, CAS UPDATE with kind='magic', issueSession)
  - [ ] Add timing-neutral hash on no-user branch (burn CPU to match happy-path latency)
  - [ ] All 13 tests GREEN
  - [ ] `pnpm typecheck` clean
  - [ ] Full suite still green
- Acceptance: 13/13 new integration tests pass; existing auth tests unchanged.
- Note: route registration order matters for Hono — add both routes inside the existing `/api/auth` router mount.

---

## TASK-M4 — Frontend: Login tab + `/auth/magic` page

- Status: ⚪ pending
- Model: Sonnet 4.6
- Dependencies: TASK-M3 (stub OK; mock API while M3 ripens)
- Files (exclusive lock):
  - `src/app/pages/Login.tsx` (modify — tab switcher)
  - `src/app/pages/Magic.tsx` (create)
  - `src/app/App.tsx` (modify — add route)
  - `src/app/lib/api.ts` (modify — add 2 client helpers)
  - `tests/e2e/10-magic-link.spec.ts` (create — 5 tests)
- Sub-tasks:
  - [ ] Design: paper-sketch tab UI matching existing form styling
  - [ ] `Login.tsx` tab switcher (Password | Magic link); preserve default = Password
  - [ ] `Magic.tsx`: auto-consume on mount, spinner while pending, redirect or error UI
  - [ ] Route registration in `App.tsx`
  - [ ] `api.ts`: `requestMagicLink(email)`, `consumeMagicLink(token)`
  - [ ] Playwright specs M4-T1…T5
  - [ ] Run local Playwright against `pnpm dev` — all green
  - [ ] Existing login/signup/reset e2e still green
- Acceptance: 5/5 new e2e green; 18/18 prior e2e still green; no console errors.

---

## TASK-M5 — Email template: `sendMagicLinkEmail` + sender switch

- Status: ⚪ pending
- Model: Sonnet 4.6
- Dependencies: —  (parallel with M3, M4)
- Files (exclusive lock):
  - `src/worker/lib/email.ts` (modify — sender constants + add export)
  - `tests/unit/email.test.ts` (create if missing — 3 tests + 1 regression for new FROM)
- Sub-tasks:
  - [ ] Update constants: `FROM_ADDRESS = 'heritage@jairukchan.com'`, add `REPLY_TO = 'heritage@jairukchan.com'`
  - [ ] Add `replyTo: REPLY_TO` to existing `sendVerificationEmail` + `sendPasswordResetEmail` calls
  - [ ] Clone `sendVerificationEmail` structure for new `sendMagicLinkEmail`
  - [ ] Change TTL copy ("15 นาที / 15 minutes")
  - [ ] Different accent color (not green, not orange — suggest blue `#4a7fa8`)
  - [ ] Link to `${appUrl}/auth/magic?token=${encodeURIComponent(token)}`
  - [ ] TH/EN bilingual body
  - [ ] Test M5-T0 regression: verify + reset emails now include `replyTo` + use new FROM
  - [ ] Tests M5-T1/T2/T3 green for magic-link template
- Acceptance: 4/4 unit tests green; all 3 email functions use new sender + include replyTo.

---

## TASK-M6 — Verification (coordinator, pre-deploy)

- Status: ⚪ pending
- Model: Opus 4.6 (coordinator)
- Dependencies: M3 + M4 + M5 all GREEN
- Files: none modified
- Sub-tasks:
  - [ ] `pnpm typecheck` clean
  - [ ] `pnpm test` green (~396 total expected)
  - [ ] `pnpm e2e` against `localhost:8787` — 23/23 green (18 prior + 5 new)
  - [ ] `pnpm audit --json` — 0 vulns
  - [ ] `pnpm build` clean
  - [ ] Local smoke via `cloudflared` tunnel: request + receive + click magic link → land at `/trees` with session
- Acceptance: every gate green; local smoke end-to-end works with a real email.
- **Blocker protocol:** if local smoke fails (e.g., Email Service rejects for unverified recipient) → back to M0 verification, diagnose in dashboard.

---

## TASK-M7 — Ship (coordinator)

- Status: ⚪ pending
- Model: Opus 4.6 (coordinator)
- Dependencies: M6 GREEN
- Files:
  - `instruction/security-review.md` (informational note — no new findings expected)
- Sub-tasks:
  - [ ] `git commit` M1+M2+M3+M4+M5 as one feature bundle (no AI signature)
  - [ ] `git push origin main` → CI green
  - [ ] `gh workflow run deploy.yml` → Deploy green
  - [ ] `pnpm db:migrate:remote` applies migration 0005 (verify via CF D1 API post-apply)
  - [ ] Prod smoke:
    - [ ] `/api/health` 200
    - [ ] UI: request magic link → real inbox → click → logged in
    - [ ] Password login regression check
  - [ ] `pnpm e2e` against prod — 23/23 green
  - [ ] Update `instruction/security-review.md` with magic-link note
- Acceptance: everything acceptance in requirements.md satisfied; prod smoke end-to-end working with a real email.

---

## File Lock Registry

| File | Locked by | Task | Status |
|------|-----------|------|--------|
| `wrangler.jsonc` | — | TASK-M1 | pending |
| `worker-configuration.d.ts` | — | TASK-M1 | pending |
| `drizzle/migrations/0005_extend_auth_tokens_kind.sql` | — | TASK-M2 | pending |
| `drizzle/migrations/meta/0005_snapshot.json` | — | TASK-M2 | pending |
| `drizzle/migrations/meta/_journal.json` | — | TASK-M2 | pending |
| `src/db/schema.ts` | — | TASK-M2 | pending |
| `tests/integration/auth-magic-schema.test.ts` | — | TASK-M2 | pending |
| `src/worker/routes/auth.ts` | — | TASK-M3 | pending |
| `tests/integration/auth-magic.test.ts` | — | TASK-M3 | pending |
| `src/app/pages/Login.tsx` | — | TASK-M4 | pending |
| `src/app/pages/Magic.tsx` | — | TASK-M4 | pending |
| `src/app/App.tsx` | — | TASK-M4 | pending |
| `src/app/lib/api.ts` | — | TASK-M4 | pending |
| `tests/e2e/10-magic-link.spec.ts` | — | TASK-M4 | pending |
| `src/worker/lib/email.ts` | — | TASK-M5 | pending |
| `tests/unit/email.test.ts` | — | TASK-M5 | pending |
| `instruction/security-review.md` | — | TASK-M7 | pending |

Parallel groups:
- **Sequential chain:** M0 → (M1 ‖ M2) → {M3 ‖ M4 ‖ M5} → M6 → M7
- **M0** coordinator-only (gates on user DNS approval)
- **M1 ‖ M2** can run as two independent agents
- **M3 ‖ M4 ‖ M5** can run as three independent agents once M2 is GREEN
- **M6** + **M7** coordinator-only

---

## Confirmed user decisions (ref: requirements.md Q1–Q9)

- **Q1** ✅ Coexist with email+password
- **Q2** ✅ Workers Paid plan (confirmed 2026-04-23 17:25 +07)
- **Q3** ✅ Migrate verify + reset emails to new Email Service at same time (M1 covers this via `remote: true` on shared binding)
- **Q4** ✅ Agent stages, user approves DNS publish
- **Q5** ✅ `noreply@jairukchan.com`
- **Q6** ✅ 15-min TTL, single-use, reuse RL_LOGIN / RL_LOGIN_IP
- **Q7** ✅ Skip DO rate-limiter
- **Q8** ✅ Skip major dep bumps
- **Q9** ✅ No fallback without asking

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------:|--------|------------|
| Email Service beta API changes mid-build | low | medium | Use structural interface in `lib/email.ts` so binding swap is localised |
| DNS propagation slow (>30 min) | low | low | CF-managed zone, typically <5 min |
| Legitimate user rate-limited due to shared RL bucket with login | low | low | RL_LOGIN is 5/min/email — rarely hit organically |
| User enumeration via timing | medium | low-medium | Constant-time hash on no-user path (M3 step 2) |
| Prod migration 0005 reject due to existing bogus `kind` rows | near zero | high if hit | Current prod `auth_tokens` has 1 row, `kind='verify'` — safe |
