# Requirements: Re-introduce Login + Fix Demo Tree Performance

> Captured: 2026-04-21 14:05 (+07)
> Source: User request via `/workflow-plan`

---

## Raw User Request

> "เราจะเริ่มนำระบบ login กลับมาครับ ตอนนี้หน้ามันน่าจะซ่อนอยู่ให้ดึงกลับมา แล้วทำให้ใช้งานได้ผ่าน email, password ด้วยนะ
>
> อีกเรื่องหนึ่งคือกดดู demo tree มันช้ามากกกกก https://heritage.jairukchan.com/demo/wongsuriya นี่เราอยู่บน edge จริงปะเนี่ยยย แก้ไขด้วยมันต้องเร็วแรงทะลุนรก"

---

## Two Independent Tracks

### Track A — Re-introduce Login (email + password)

**Current state:** The entire login/auth surface was **deleted** in 2026-04-20 security remediation
(archived under `instruction/archive/02-security-remediation-login-removal/`). What was removed:

- `src/worker/routes/auth.ts`, `upload.ts`
- `src/worker/middleware/session.ts`, `csrf.ts`, `rate-limit.ts`
- `src/worker/lib/tokens.ts`, `email.ts`
- `src/app/pages/Login.tsx`, `AuthVerify.tsx`
- `src/app/hooks/useSession.ts`, `useUpload.ts`
- `src/shared/schemas.ts`

The **previous auth was magic-link email** (send tokenised link to inbox, verify on click). User
now wants a **different mechanism: email + password**.

**What remains:**
- DB tables `auth_tokens`, `sessions` (N4 "deferred — tables retained for possible future auth
  reintroduction"). `users` table exists but has no `password_hash` / `password_salt` column yet.
- Frontend has no login page, no session hook, no auth-gated UI.
- Worker middleware has no session handling, no CSRF protection, no rate limiting on auth paths.

**User assumption to clarify:**
> "ตอนนี้หน้ามันน่าจะซ่อนอยู่ให้ดึงกลับมา"

→ **This is incorrect.** The Login page was deleted, not hidden. It needs to be **rebuilt** (with
password support this time, not magic-link). The archive has the old magic-link implementation for
reference only — not usable as-is.

**User intent (inferred):**
- Email + password signup / login
- Session management (cookies, probably)
- Login page accessible from Landing (no hidden flag)

---

### Track B — Demo Tree Performance

**Target URL:** https://heritage.jairukchan.com/demo/wongsuriya

**User complaint:**
> "กดดู demo tree มันช้ามากกกกก ... นี่เราอยู่บน edge จริงปะเนี่ยยย ... ต้องเร็วแรงทะลุนรก"

**What "edge" status actually is:**
- Yes, deployed on Cloudflare Workers at `heritage.jairukchan.com`
- Yes, D1 database (`heritage-d1-main`, id: `3ef17b93-...`)
- Yes, R2 bucket for photos, KV for rate-limiting
- **But** `run_worker_first: true` in wrangler.jsonc — every static asset goes through the Worker
  wrapper (for security headers). This adds a fixed JS boot cost per asset.
- **And** no HTTP/CDN caching on `/api/tree/:slug` — the D1 query runs on every navigation.
- **And** `getTreeData` in `src/worker/lib/tree-query.ts` does an N+1 on `lineage_members` (one
  query per lineage, wrapped in `Promise.all` so at least parallelised).
- **And** the frontend waterfall: HTML → JS bundle → React hydrate → `useTree` fires → API call →
  layout compute → render. Loading is entirely client-side after boot.

**Likely bottlenecks to validate with measurement:**
1. D1 latency (cold first query, no edge caching)
2. Asset loading cold start (`run_worker_first` means Worker fetches ASSETS proxy)
3. JS bundle size + parse cost on mobile
4. API response size (full tree + all stories + memos + lineages in one blob)
5. Client-side layout computation in `layout.ts` (runs every render?)

---

## Agreed Scope (to confirm after research phase)

### Track A — Login

- [ ] Email + password signup flow
- [ ] Email + password login flow
- [ ] Session cookies (HttpOnly, Secure, SameSite)
- [ ] Password hashing (Argon2id preferred; fall back to scrypt if Workers constraints)
- [ ] Rate-limiting on login attempts (brute-force protection)
- [ ] CSRF protection for state-changing routes
- [ ] Logout route
- [ ] Login page accessible from Landing (CTA)
- [ ] Password policy (min length, complexity — to decide)
- [ ] **Deferred until discussed:** password reset via email, email verification on signup, OAuth,
  MFA, "remember me"

### Track B — Performance

- [ ] Measure before (Playwright-timed LCP, TTFB, API latency, bundle size)
- [ ] Add `Cache-Control` + `CF-Cache-Status` on `/api/tree/:slug` for public trees
- [ ] Fix N+1 on `lineage_members` (single query with `IN` or join)
- [ ] Consider `stale-while-revalidate` for tree JSON
- [ ] Investigate `run_worker_first` — can we scope it more narrowly?
- [ ] Measure after; target: LCP < 2s on demo, API TTFB < 100ms cached, < 300ms cold
- [ ] **Possible:** ship a tiny SSR snapshot for the demo tree so first paint has content

---

## Technical Decisions (pending research)

**Track A:**
- Password hash: **Argon2id** if a pure-JS or WASM impl fits into Workers bundle + CPU budget;
  otherwise **scrypt via `crypto.subtle`** (native, slower but free in Workers runtime).
- Session storage: random 256-bit token → `SHA-256` → store hash in `sessions` table. Cookie
  carries the raw token.
- Cookie flags: `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=<14d or 30d>`.
- CSRF: double-submit cookie OR origin/referer check. TBD after research.
- Rate limiting: reuse `KV_RL` binding; per-IP and per-email caps on `/api/auth/login`.

**Track B:**
- Public tree caching: `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=600`
- Edge cache: use `caches.default` in the Worker for the JSON response keyed by slug.
- Cache invalidation: minimal for now — trees are edit-rare.

---

## Security Considerations (high-level)

- The security-review docs (`instruction/security-review.md`,
  `instruction/security-review-post-remediation.md`) must be re-consulted before shipping Track A —
  every auth finding needs a countermeasure this time.
- Re-introducing auth means re-introducing attack surface. Plan must enumerate: login brute-force,
  credential stuffing, session fixation, CSRF, timing attacks, enumeration via login error
  messages, password storage.

---

## Non-goals (this session)

- No file upload (remains deleted; re-introduce in a separate plan)
- No tree editing UI (stays read-only for now)
- No admin / user-management UI
- No SSO / OAuth

---

## Open Questions — ANSWERED (2026-04-21 17:58)

1. **Signup flow — OPEN.** Anyone with an email can register. Email verification required
   (since CF Email is in scope per Q3). Signup flow: create user (unverified) → send verification
   email → user clicks link → `email_verified_at` set → login allowed.
2. **Session lifetime — 14 days sliding.** Auto-extend on activity (refresh when <7 days remain).
3. **Password reset — IN SCOPE.** Use **Cloudflare Email Service** (new, just launched — user
   explicitly asked to research `https://developers.cloudflare.com/email-service/` always). This
   also covers the signup verification email from Q1. Dispatched as RESEARCH-004.
4. **Demo tree — IT'S A PUBLIC-VISIBILITY TREE.** Not a special hard-coded route. The model is
   Google-Drive-like: every tree has a visibility. The demo `wongsuriya` tree just happens to be
   set to `public`. The `/demo/:slug` URL stays as a vanity public entry point.
5. **Sharing — GOOGLE-DRIVE MODEL.** Each tree can be:
   - `public` — anyone can view (no login required)
   - `private` — only owner
   - `shared` — specific emails granted access (with role)
   Logged-in users see their owned + shared-with-me trees in a "my trees" list. Dispatched as
   RESEARCH-005.
6. **Perf target — just faster, no hard number.** Measurable improvement against current
   baseline (FCP 4292 ms, API TTFB 400–2500 ms).

## Sequencing

- **Parallel tracks.** User explicitly chose parallel with agent team. Track A (auth + email +
  sharing) and Track B (perf) dispatch simultaneously. They agree upfront on cache-key strategy
  for the `Vary: Cookie` interaction.

## New scope added this round

- **Track A** now includes:
  - Tree visibility model (`public` / `private` / `shared`)
  - `tree_shares` table (or extended `tree_members`)
  - "My trees" list for logged-in users
  - Share-by-email UI (owner can add/remove share targets)
  - Pending-share matching on signup (if A adds bob@x.com before Bob has an account)
  - Signup email verification + password-reset flow via Cloudflare Email Service

- **Demo URL refactor**: `/demo/wongsuriya` becomes `/tree/wongsuriya` with `visibility=public`;
  the legacy `/demo/:slug` route can stay as an alias for SEO / existing links.
