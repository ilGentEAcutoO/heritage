# Active Tasks — Magic-link login via Cloudflare Email Service

> Last updated: 2026-05-02 15:45 (+07)
> Status: ✅ **ALL TASKS COMPLETE** — feature live in production
> Plan ref: `instruction/work/plan.md`
> Requirements ref: `instruction/work/requirements.md`

---

## Summary

| Task | Status | Notes |
|------|--------|-------|
| TASK-M0 | ✅ tested | Email Sending onboarded for `jairukchan.com`; DMARC `p=reject` + DKIM `cf2024-1` live; Email Routing catch-all → owner Gmail |
| TASK-M1 | ✅ tested | `EMAIL` binding switched to Email Service (`remote: true`); shipped commit `41052d6` |
| TASK-M2 | ✅ tested | Migration 0005 created + applied (local + remote `2026-05-02 08:40 UTC`); `auth_tokens.kind` CHECK now allows `'magic'` |
| TASK-M3 | ✅ tested | `POST /api/auth/magic/{request,consume}` shipped commit `41052d6` |
| TASK-M4 | ✅ tested | Login tab + `/auth/magic` page shipped commit `41052d6` |
| TASK-M5 | ✅ tested | `sendMagicLinkEmail` + sender switch to `heritage@jairukchan.com` shipped commit `41052d6` |
| TASK-M6 | ✅ tested | Local: 400/400 tests + typecheck clean (`2026-05-02 15:40 +07`) |
| TASK-M7 | ✅ tested | Deploy run `25248096502` ✅ + remote migration applied + e2e prod smoke via Gmail MCP (signup → verify → magic request → consume → `/api/auth/me` → replay correctly rejected 400) |

---

## Production smoke evidence (2026-05-02 08:42 UTC)

End-to-end exercised against `https://heritage.jairukchan.com` with no human in the loop (Gmail MCP read inbox `suanwin.paows@gmail.com`):

1. `POST /api/auth/signup` → 201 → verify email arrived from `heritage@jairukchan.com` (subject `Heritage — ยืนยันอีเมล / Verify your email`)
2. `POST /api/auth/verify` with extracted token → 200 + user payload
3. `POST /api/auth/magic/request` → 200 (neutral message) → magic email arrived (subject `Heritage — ลิงก์เข้าสู่ระบบ / Your sign-in link`, 15-min TTL copy correct, blue accent applied)
4. `POST /api/auth/magic/consume` with extracted token → 200 + `__Host-session` cookie set
5. `GET /api/auth/me` with cookie → 200 + same user_id as step 2 (`f5aaac68-ab05-4cbd-9a26-b9de347aabb9`)
6. Replay attempt — same token to `/consume` again → 400 `"Link expired or already used"` (single-use CAS works)
7. Smoke user + tokens + sessions cleaned up via `wrangler d1 execute --remote`

---

## Acceptance criteria (from plan.md / requirements.md)

- [x] User can request magic link → receive email → click → land at `/trees` with valid session
- [x] Verify + reset emails migrated to new Email Service binding (covered by M1's `remote: true` switch on shared `EMAIL` binding)
- [x] FROM = `heritage@jairukchan.com` for all three transactional emails
- [x] 15-minute TTL on magic links, single-use enforced
- [x] Reuse `RL_LOGIN` + `RL_LOGIN_IP` rate-limiter (no new DO)
- [x] Constant-time path on no-user / unverified branch
- [x] Cross-kind replay prevention (consume filters `kind='magic'`)
- [x] DMARC live on the zone
- [x] No new security findings (informational note added to `instruction/security-review.md`)
- [x] Production deploy + remote migration applied + smoke green

---

## Confirmed user decisions (ref: requirements.md Q1–Q9)

- **Q1** ✅ Coexist with email+password
- **Q2** ✅ Workers Paid plan
- **Q3** ✅ Migrate verify + reset emails to new Email Service at same time
- **Q4** ✅ Agent stages, user approves DNS publish
- **Q5** ✅ `heritage@jairukchan.com` (revised from initial `noreply@`)
- **Q6** ✅ 15-min TTL, single-use, reuse RL_LOGIN / RL_LOGIN_IP
- **Q7** ✅ Skip DO rate-limiter
- **Q8** ✅ Skip major dep bumps
- **Q9** ✅ No fallback without asking — kept CF Email Service throughout

---

## Next steps

This workstream is **closed**. Ready to be archived to `instruction/archive/04-magic-link-login/` in the next session-end pass.
