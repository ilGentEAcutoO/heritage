# Work Session Summary — Magic-link login via CF Email Service

> Completed: 2026-05-02 15:55 (+07)
> Workstream: TASK-M0 → TASK-M7
> Commits: `41052d6` (feature bundle) · `15247f0` (CLI audit) · `b040960` (post-deploy docs)
> Production: `https://heritage.jairukchan.com` — Deploy run `25248096502`

---

## Tasks Completed

| Task | Status | Notes |
|------|--------|-------|
| TASK-M0 | ✅ tested | Email Sending onboarded for `jairukchan.com`; DMARC `p=reject` + DKIM `cf2024-1` live; Email Routing catch-all → owner Gmail |
| TASK-M1 | ✅ tested | `EMAIL` binding switched to Email Service (`remote: true`) |
| TASK-M2 | ✅ tested | Migration 0005 created + applied (local + remote `2026-05-02 08:40 UTC`); `auth_tokens.kind` CHECK now allows `'magic'` |
| TASK-M3 | ✅ tested | `POST /api/auth/magic/{request,consume}` — 13 integration tests |
| TASK-M4 | ✅ tested | Login tab switcher + `/auth/magic` page + 5 e2e tests |
| TASK-M5 | ✅ tested | `sendMagicLinkEmail` + sender unified to `heritage@jairukchan.com` |
| TASK-M6 | ✅ tested | Local: 400/400 tests + typecheck clean |
| TASK-M7 | ✅ tested | Deploy ✅ + remote migration ✅ + e2e prod smoke via Gmail MCP ✅ |

---

## Test Results

| Suite | Result |
|-------|--------|
| `pnpm typecheck` | ✅ clean |
| `pnpm test` (unit + integration) | ✅ **400/400** across 41 files (was 379 pre-feature) |
| Deploy CI run `25248096502` | ✅ success |
| Remote migration 0005 | ✅ applied to `heritage-d1-main` |
| Production smoke (signup → verify → magic request → consume → `/me`) | ✅ green |
| Replay attack (re-consume same magic token) | ✅ correctly returns 400 |

### Production smoke evidence (2026-05-02 08:42 UTC)

End-to-end exercised against `https://heritage.jairukchan.com` with no human in the loop — Gmail MCP read inbox `suanwin.paows@gmail.com`:

1. `POST /api/auth/signup` → 201 → verify email arrived from `heritage@jairukchan.com` within ~8s
2. `POST /api/auth/verify` with extracted token → 200 + user payload
3. `POST /api/auth/magic/request` → 200 (neutral message) → magic email arrived (15-min TTL copy correct)
4. `POST /api/auth/magic/consume` with extracted token → 200 + `__Host-session` cookie set
5. `GET /api/auth/me` with cookie → 200 + same user_id (`f5aaac68-ab05-4cbd-9a26-b9de347aabb9`)
6. Replay attempt → 400 `"Link expired or already used"` (single-use CAS confirmed in prod)
7. Smoke user + tokens + sessions cleaned via `wrangler d1 execute --remote`

---

## Security Review

| Check | Result |
|-------|--------|
| `pnpm audit` | ✅ 0/0/0/0/0 (info/low/moderate/high/critical) across 270 deps |
| Hardcoded secret scan (`API_KEY|SECRET|TOKEN|PASSWORD = "..."` in `src/`) | ✅ no matches |
| `.gitignore` covers `.env` + `.dev.vars` | ✅ |
| New attack surface introduced | ✅ none — reuses existing primitives |

### Magic-link security properties (also recorded in `instruction/security-review.md`)

- **Rate limiting:** reuses `RL_LOGIN` (per-email) + `RL_LOGIN_IP` (per-IP) — no new DO required (decision Q7)
- **Atomic CAS:** `UPDATE auth_tokens SET used_at = NOW WHERE token_hash = ? AND kind = 'magic' AND used_at IS NULL AND expires_at > NOW RETURNING ...` — single-use enforced at DB level, verified live in prod
- **Cross-kind replay prevention:** consume filters `kind='magic'` so verify/reset tokens cannot be replayed across endpoints
- **Constant-time path:** no-user / unverified branch runs `hashToken('constant-time-filler-...')` to match happy-path crypto cost (timing-enumeration neutrality)
- **Session cookie:** identical to password login (`__Host-session`, `HttpOnly`, `Secure`, `SameSite=Lax`)
- **TTL:** 15 minutes, single-use
- **Outbound:** CF Email Service binding (`remote: true`) — DMARC-aligned + DKIM-signed automatically
- **No new findings** in this workstream

---

## Files Changed (22 files, +5506/-150 excluding lockfile)

### Backend
- `src/worker/routes/auth.ts` — added `/magic/request` + `/magic/consume`
- `src/worker/lib/email.ts` — `sendMagicLinkEmail` + sender unified to `heritage@jairukchan.com` + `replyTo` on all three transactional emails
- `src/db/schema.ts` — `authTokens.kind` enum extended with `'magic'`

### Frontend
- `src/app/pages/Login.tsx` — Password / Magic-link tab switcher
- `src/app/pages/Magic.tsx` — new auto-consume page
- `src/app/App.tsx` — route registration
- `src/app/lib/api.ts` — `requestMagicLink()` + `consumeMagicLink()` client helpers

### Schema migration
- `drizzle/migrations/0005_extend_auth_tokens_kind.sql` — 3-phase rebuild pattern from 0004
- `drizzle/migrations/meta/0005_snapshot.json` + `_journal.json`

### Infrastructure
- `wrangler.jsonc` — `EMAIL` binding gains `"remote": true`
- `worker-configuration.d.ts` — regenerated via `cf-typegen`

### Tests
- `tests/integration/auth-magic.test.ts` — 13 tests (request happy/sad paths, consume CAS, cross-kind replay, timing parity, RL exhaustion)
- `tests/integration/auth-magic-schema.test.ts` — 3 tests (CHECK allows magic, rejects bogus, kind values preserved)
- `tests/unit/email.test.ts` — 4 tests (3 for magic template + 1 regression for FROM + replyTo on verify/reset)
- `tests/e2e/10-magic-link.spec.ts` — 5 Playwright specs

### Docs
- `instruction/cf-email-cli-capabilities.md` — CF Email CLI/MCP capability audit (commit `15247f0`)
- `instruction/security-review.md` — informational banner (commit `b040960`)
- `instruction/work/todos.md` — flipped to ✅ tested with prod smoke evidence (commit `b040960`)

---

## Decisions Confirmed (Q1–Q9)

| # | Decision | Outcome |
|---|----------|---------|
| Q1 | Coexist with email+password? | ✅ both flows live in prod |
| Q2 | Workers Paid plan? | ✅ confirmed |
| Q3 | Migrate verify+reset emails to new Email Service together? | ✅ all three emails use the same `EMAIL` binding |
| Q4 | Agent stages, user approves DNS publish? | ✅ user onboarded `jairukchan.com` in CF Dashboard, agent verified via `wrangler email sending list` |
| Q5 | FROM address? | Revised to `heritage@jairukchan.com` (was `noreply@`) |
| Q6 | TTL + RL strategy? | 15-min TTL, single-use, reuse `RL_LOGIN` / `RL_LOGIN_IP` |
| Q7 | Skip DO rate-limiter? | ✅ skipped |
| Q8 | Skip major dep bumps? | ✅ skipped |
| Q9 | No fallback without asking? | ✅ kept CF Email Service throughout (Resend not introduced) |

---

## Lessons / Follow-ups

- **CF Email Sending CLI gap:** `wrangler email sending enable <domain>` hits a broken zone-level path; account-level API requires an API Token with `email_sending:edit` scope (not in default `wrangler login` OAuth scope set). Captured in `instruction/cf-email-cli-capabilities.md`. Until either (a) wrangler CLI is fixed or (b) CF MCP grows email tools, onboarding remains a one-time dashboard click.
- **Gmail MCP closes the loop:** end-to-end smoke without a human-in-the-loop is feasible because the agent can both *send* the magic-link request and *read* the resulting email. Worth remembering for future email-dependent workstreams.
- **No follow-up tasks** generated by this workstream.
