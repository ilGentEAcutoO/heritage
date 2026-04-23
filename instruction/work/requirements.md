# Requirements — Magic-link login via Cloudflare Email (+ optional: DO rate-limiter, major dep bumps)

> Captured: 2026-04-23 17:15 (+07)
> Source: user command `/workflow-plan (DO rate-limiter หรือ major dep bumps) ตามที่นายแนะนำและแก้ไขดังนี้ครับ เอาระบบ login ด้วย magic link กลับมาครับ และให้ใช้ cloudflare email ในการส่งเมลล์นะ จัดการ setup ให้เรียบร้อยด้วย`
> Prior session archive: `instruction/archive/03-security-remediation-s1-s7/` (just closed)

---

## Raw request (user verbatim)

> "(DO rate-limiter หรือ major dep bumps) ตามที่นายแนะนำและแก้ไขดังนี้ครับ เอาระบบ login ด้วย magic link กลับมาครับ และให้ใช้ cloudflare email ในการส่งเมลล์นะ จัดการ setup ให้เรียบร้อยด้วย"

**Interpretation:** user references two earlier follow-up suggestions (DO rate-limiter, major dep bumps) and **modifies** them — the actual work wanted is:

1. **Reintroduce magic-link login** (feature work)
2. **Use Cloudflare Email** for outbound sending (infra change)
3. **Set up everything properly** — including CF resource provisioning, not just code

The "DO rate-limiter หรือ major dep bumps" clause is ambiguous — could mean "choose one to include" or "these are out; instead do the magic-link work". Clarifying below.

---

## Context — current state

- Auth today: **email + password** (commit `29e1f3b`, scrypt hashes, `__Host-session` cookie, origin-check CSRF)
- `auth_tokens.kind` CHECK currently `IN ('verify','reset')` — will need extension to include `'magic'`
- Prior magic-link implementation: unknown — need git-history probe
- No email sender infra exists today — `auth_tokens` are issued but the **send step** is stubbed / manual (need to confirm)

---

## Open questions (to confirm before planning)

| # | Question | Default assumption |
|---|----------|--------------------|
| Q1 | Magic-link **replaces** email+password login, or **coexists** with it? | Coexist — `/login` shows both "magic link" and "password" options; existing users unaffected |
| Q2 | Cloudflare Email = **which service**? CF supports: (a) `send_email` binding via Email Workers/Routing (requires verified destination addresses, typically own domain); (b) MailChannels transport (status changed in 2024, may require paid CF). | Research first — report options back to user with trade-offs |
| Q3 | Sender identity — what `From:` address? Any DNS records we need to publish (SPF, DKIM, DMARC)? | **`heritage@jairukchan.com`** (user-confirmed 2026-04-23 17:40 +07; product-scoped for future multi-service setup). Email Routing catch-all already set → `suanwin.paows@gmail.com` (user-confirmed option B 2026-04-23 17:50 +07). Most DNS is already in place; only DMARC + possibly extra DKIM + bounce MX remain (CF auto-stages during Email Sending onboarding). |
| Q4 | Verification email (signup) — also move to CF Email? Or leave signup verification stubbed and only wire magic-link? | Move both — keep one sender path, not two |
| Q5 | Magic-link expiry + rules — 15 min single-use token? Rate-limit per email? | 15 min expiry, single-use, rate-limit 5 requests/15min/email, 20/hour/IP |
| Q6 | Include DO rate-limiter **now** as part of this plan (img route + magic-link endpoint), or keep deferred? | **Include** the DO rate-limiter scoped to `/api/auth/magic` (send + consume) only — img DO remains its own future plan |
| Q7 | Include major dep bumps? (React 18→19, Zod 3→4, TypeScript 5→6, @types/node 22→24) | **Defer** — each has breaking changes worth a dedicated plan; mixing with feature work raises revert cost |

---

## Acceptance criteria (tentative — pending clarification)

- `POST /api/auth/magic` — accepts email, issues token, sends email via CF, rate-limited
- `GET /auth/magic?token=…` — validates token (single-use CAS), creates session, redirects to `/trees`
- `auth_tokens.kind` extended to include `'magic'` (new migration)
- Email sender configured on `heritage-worker-api` worker (binding + DNS) — tested end-to-end by receiving a real email at a test mailbox
- `pnpm test` all green (≥ 379 + new magic-link tests)
- `pnpm e2e` all green (≥ 18 + new magic-link e2e)
- `pnpm audit` stays 0 vulnerabilities
- Prod smoke: request magic link, receive email, click, land logged in

## Not in scope (unless user overrides)

- Replacing email+password auth (Q1 default: coexist)
- Adding social login (Google/Apple/etc.)
- Major dep bumps (Q7 default: defer)
- DO rate-limiter on img route (Q6 default: only on magic endpoint)

---

## Research tasks (parallel sub-agents — dispatched now)

- **Agent A (Explore / Sonnet 4.6):** Map current auth surface. Files touched, middleware chain, where magic-link would plug in, any prior magic-link code in git history.
- **Agent B (general-purpose / Sonnet 4.6):** Survey Cloudflare outbound email options as of 2026 via Context7 + CF docs MCP. Report: `send_email` binding capability, sender-address restrictions, DNS requirements, MailChannels status, cost implications.

Research findings will inform the plan write-up.
