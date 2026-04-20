# Security Review — heritage

**Scope:** full-codebase audit (not diff-limited)
**Date:** 2026-04-20
**Commit:** working tree on `main` (no commits yet in repo)
**Auditor:** 4 parallel Claude sub-agents (Opus for server, Sonnet for client/config), synthesized
**Stack:** Cloudflare Workers + Hono + D1 (Drizzle) + R2 + KV + React 18 + React Router v7 + Vite 6

---

## Executive summary

The codebase shows careful defensive work in the auth/session layer — timing-safe HMAC, hashed tokens at rest, HttpOnly/Secure/SameSite cookies, dual rate-limiters, Origin-based CSRF, parameterized queries throughout, magic-byte validation on uploads. No secrets are committed.

**However**, there are five **critical** issues that should block production exposure, plus eleven **high**-severity issues. The worst are IDOR and missing-authorization gaps in the tree API (cross-tree references and the entire overrides endpoint), a magic-link takeover path for unregistered emails, and rate-limit bypasses via spoofable headers and missing limits on mutation routes.

### Severity totals

| Critical | High | Medium | Low | Informational |
|---------:|-----:|-------:|----:|--------------:|
|   5      |  11  |  19    |  10 |      8        |

### Top 5 must-fix before any production / public exposure

1. **Missing authorization on `PUT /api/tree/:slug/overrides`** — `src/worker/routes/tree.ts:415`
2. **Cross-tree reference injection in `POST /:slug/relations`** — `src/worker/routes/tree.ts:328`
3. **`x-forwarded-for` spoofing defeats rate-limiters** — `src/worker/routes/auth.ts:55`, `src/worker/routes/img.ts:102`
4. **No rate-limit on mutation endpoints and `/api/upload`** — `src/worker/routes/tree.ts` (all mutations), `src/worker/routes/upload.ts`
5. **Magic-link first-login takeover for unregistered emails** — `src/worker/routes/auth.ts:200-216`

---

## Critical

### C1 — Missing authorization on `PUT /api/tree/:slug/overrides`
**Location:** `src/worker/routes/tree.ts:415-459`

The route calls `requireAuth` but **never calls `getTreeRole`/`hasRole`**. Any authenticated user can write `position_overrides` rows against any tree, for any `personId` (the `ov.personId` field is not cross-checked against `people.tree_id`, so the ID can reference a person in a tree the user has never joined).

**Impact:** D1 write-spam against any tree; ability to seed overrides for victim users as a precursor to UX-confusion or storage-quota exhaustion. The unique `(user_id, person_id)` index (schema.ts:202) prevents clobbering another user's overrides, but it does not prevent an attacker from inserting millions of their own rows referencing arbitrary person IDs.

**Fix:** At `tree.ts:421`, add a role check equivalent to `viewer`-or-higher on the tree. At `tree.ts:431`, verify each `ov.personId` exists in `treeRow.id` before including it in the batch.

---

### C2 — Cross-tree reference injection in `POST /:slug/relations`
**Location:** `src/worker/routes/tree.ts:328-337`

The role check correctly gates on the slug-tree, but the body's `from_id` / `to_id` are inserted verbatim with `tree_id: treeRow.id`. An editor on tree A can POST a relation whose endpoints are person IDs from tree B. The `relations.from_id`/`to_id` FK only checks the person row exists globally, not that it belongs to the same tree.

The `POST /:slug/stories` route **does** validate `personId ∈ tree` (tree.ts:390-395) — relations must do the same.

**Impact:** Corruption of tree B's graph (orphan edges that the lineage query at `tree-query.ts` may walk into), plus potential information leak via lineage structure.

**Fix:** In `tree.ts:328`, `SELECT id FROM people WHERE id IN (from_id, to_id) AND tree_id = treeRow.id` must return 2 rows before the insert. Additionally reject `from_id === to_id` (self-loops) and check for cycles on `kind = 'parent'`.

Also: `PersonInputSchema.avatar_key` (`src/shared/schemas.ts:36`) is an unvalidated user-supplied string stored on `people.avatar_key`. An editor can point any person's avatar at any R2 key whose name they guess. Either validate that `avatar_key` references a `photos.object_key` whose person is in the same tree, or remove it from the writable surface and let the upload route set it server-side.

---

### C3 — `x-forwarded-for` fallback bypasses rate-limiters
**Locations:**
- `src/worker/routes/auth.ts:52-58` (`getClientIp`)
- `src/worker/routes/img.ts:102`

Both IP-derivation helpers fall back to `x-forwarded-for` (client-controlled) when `cf-connecting-ip` is absent. In production on Cloudflare, `cf-connecting-ip` is always present — **but** a worker-to-worker fetch, service binding, or test harness lacks it, and an attacker who can rotate the `x-forwarded-for` header on every request trivially bypasses the 10/hour auth IP limiter and the img rate-limiter.

**Fix:** Use **only** `cf-connecting-ip`. If it's absent, reject or bucket under a single aggressive cap (`'unknown'`) that throttles hard.

---

### C4 — No rate-limit on mutation endpoints or `/api/upload`
**Locations:**
- `src/worker/routes/tree.ts` — all `POST/PATCH/PUT/DELETE` handlers
- `src/worker/routes/upload.ts` — router-wide

Only `POST /api/auth/request` (auth.ts:76) and `GET /api/img/:key` (img.ts:29) are rate-limited. A compromised editor token — or merely an editor account acquired via legitimate magic-link — can flood people/story/relation inserts and 2 MB image uploads until R2/D1 quota is exhausted.

**Impact:** Storage-cost DoS, D1 row-count exhaustion, email-service burn (if uploads ever trigger emails).

**Fix:** Add a KV-backed per-user rate limiter on all mutation routes (e.g. 60 writes/min/user) and a tighter limit on `/api/upload` (e.g. 10/min/user, 100/day/user). Also see H3 on making the limiter atomic.

---

### C5 — Magic-link first-login takeover for unregistered emails
**Location:** `src/worker/routes/auth.ts:200-216`

`/api/auth/verify` **auto-creates** a user for `payload.email` if none exists. Combined with the fact that `/api/auth/request` is unauthenticated and does not bind the verify action to the browser that requested it, an attacker who can obtain the magic-link URL for a **new** email (phishing, leaked email archive, misdelivered mail, shared terminal, corporate mail-proxy that fetches links) can click it and claim the account before the real owner signs up.

The token is single-use and 15-min-bound, which limits the window, but does not prevent the primary scenario: attacker knows victim's email, attacker (or request from some 3rd party) triggers `/request`, attacker somehow obtains or races the link, attacker becomes the verified owner.

**Fix (pick one):**
- **Request-binding (recommended):** In `/request`, set a `mlreq` cookie (HttpOnly, Secure, SameSite=Lax, 15-min TTL) containing `sha256(nonce)`. In `/verify`, reject if the cookie is missing or doesn't match.
- **Code entry:** Show a 6-digit code on the page that requested the link; require it on the verify page for first-time logins.
- **Explicit signup:** Don't auto-create on verify. Require a separate `/signup` that sends a confirmation link — then `/login` only works for existing accounts.

---

## High

### H1 — TOCTOU on magic-link verify / email-prefetcher DoS
**Location:** `src/worker/routes/auth.ts:168-198`

The check (`used_at IS NULL AND expires_at > now`) and the subsequent `UPDATE ... SET used_at = ?` are two separate statements, not atomic. Corporate mail-proxies (Outlook SafeLinks, Gmail proxy, Slack unfurl) routinely GET the link before the user clicks — meaning the user's actual click hits the "used token" branch and lands on `/login?err=invalid`, while a rogue session may have been silently created for the prefetcher.

**Fix:** Single CAS update — D1 supports `RETURNING`:
```
UPDATE auth_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING id, email
```
Only if exactly 1 row is returned, proceed. To defeat link-preview prefetchers entirely, make verify a POST that the landing page submits from a button — prefetchers don't follow POST.

---

### H2 — Session cookie missing `__Host-` prefix
**Location:** `src/worker/middleware/session.ts:22`, `src/worker/routes/auth.ts:232-238`

Cookie name is `heritage_session`. Adding the `__Host-` prefix (requires Secure, Path=/, no Domain — all already satisfied) would make the browser refuse subdomain cookie-injection from `*.jairukchan.com`. Because the app is hosted on a shared apex domain, this is a realistic attack vector: a compromised or careless sibling subdomain can set cookies on the parent scope.

**Fix:** Rename the cookie constant to `__Host-heritage_session`. Update tests.

---

### H3 — Rate-limit window is not atomic (read-modify-write)
**Location:** `src/worker/middleware/rate-limit.ts:51-63`, `src/worker/routes/img.ts:29-40`

Both limiters do `get()` → increment → `put()` with no CAS. A burst of 20 concurrent requests can all read `count=0`, all pass, all write `1`. Effective limit becomes 5–10× the stated one under load.

**Impact:** Email-amplification on `/auth/request` (3 → many), img-route DoS.

**Fix:** Use a Durable Object for token-bucket accounting, or layer Cloudflare's native Rate Limiting rules (dashboard or `unsafe.bindings`) on top as a hard ceiling.

---

### H4 — `newId()` uses `Math.random()` for primary keys
**Location:** `src/worker/routes/tree.ts:77-81` — used for `trees`, `tree_members`, `people`, `stories`

`Math.random()` is not cryptographically random. Under parallel load, collisions on `people.id` within the same tree cause an insert to fail loudly, but cross-tree collisions insert silently with a duplicate ID (PK is globally unique so the second insert fails there too — but the risk is real once volume grows).

**Fix:** Use `crypto.randomUUID()` or import the `ulidLite()` already defined in `upload.ts:25-48`.

---

### H5 — R2 key prefix is not tree-scoped
**Location:** `src/worker/routes/upload.ts:71`

Current key: `photos/${safePersonId}/${ulid}.${ext}`. `personId` is a tree-scoped string (e.g. `p1`, `p2`), so two different trees that happen to use the same id share a prefix. This couples unrelated trees together for R2 lifecycle/audit/analytics purposes and weakens the already-weak per-person namespace guarantee.

**Fix:** Change to `photos/${treeId}/${safePersonId}/${ulid}.${ext}` and update the img route's R2 key regex.

---

### H6 — Missing `X-Content-Type-Options: nosniff` and `Content-Disposition` on `/api/img`
**Location:** `src/worker/routes/img.ts:134-144`

The route echoes `photo.mime` from D1 as `Content-Type`. Magic-byte validation at upload (`upload.ts:201`) reduces the practical risk, but a stored mis-classification, or a future route that surfaces user-uploaded bytes with a different MIME, becomes XSS-able.

**Fix:** Always set `X-Content-Type-Options: nosniff` and `Content-Disposition: inline; filename="<sanitized>"`. Also consider `Cache-Control: private` for authenticated tree photos to avoid CDN cross-tenancy.

---

### H7 — Relations endpoint permits self-loops and cycles
**Location:** `src/worker/routes/tree.ts:328-337`, `src/shared/schemas.ts` (`RelationInputSchema`)

No rejection of `from_id === to_id` nor cycle detection on `kind = 'parent'`. `tree-query.ts:196-208` walks edges once (non-recursive), so the worker doesn't hang, but the frontend layout (`src/app/lib/layout.ts`) may, and data integrity degrades.

**Fix:** In the relations handler, reject `from_id === to_id`. For `parent` edges, BFS upward from `to_id` looking for `from_id` and reject if reachable.

---

### H8 — Zod schemas do not call `.strict()`
**Location:** `src/shared/schemas.ts` (all schemas)

Unknown fields are silently dropped rather than rejected. Today every route manually picks named fields, so mass-assignment is not exploitable — but the contract isn't enforced. A future refactor like `db.insert(people).values({ ...parsed.data })` would become immediately dangerous.

**Fix:** Append `.strict()` to every schema in `src/shared/schemas.ts`.

---

### H9 — `postMessage` to wildcard origin on every tweak change
**Location:** `src/app/hooks/useTweaks.ts:90, 100`; listener at `:82-86`

`window.parent.postMessage({ ... }, '*')` broadcasts UI state to any listening parent frame. The incoming `message` handler also doesn't check `e.origin`. This is a leftover from a prototype "edit mode". Even though the current payload is just UI prefs, a malicious parent frame could attempt to drive future handlers or correlate user behavior.

**Fix:** Remove the `postMessage` + listener block entirely, or restrict to a known origin and validate `e.origin`.

---

### H10 — Stale R2 env bindings in generated types
**Location:** `worker-configuration.d.ts:17-19, 28`

Declares `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` in `Cloudflare.Env` but nothing in `wrangler.jsonc`, `.dev.vars.example`, or the current worker source uses them (a prior `aws4fetch` approach was removed). Dead types mislead operators into thinking these secrets are required and into possibly committing real keys to match the schema.

**Fix:** `pnpm cf-typegen` (regenerate) or manually strip lines 17-19 and the trailing enumeration on line 28.

---

### H11 — `dist/` is gitignored but physically exists on disk
**Location:** `.gitignore:2`, presence confirmed in project root

`dist/` correctly appears in `.gitignore` but exists on disk with built artefacts. A `git add -A` or a tooling misstep could stage it. No source maps were found in the current `dist/` — the risk is structural.

**Fix:** Pre-commit hook (husky, lefthook) that fails if any path under `dist/` or `.wrangler/` enters the index.

---

## Medium

### M1 — `SESSION_SECRET` length not validated
`src/worker/lib/tokens.ts:81, 110` — accepts any string. Validate `SESSION_SECRET.length >= 32` at first request / worker bootstrap and fail closed.

### M2 — `APP_URL` mis-config has broad blast radius
`src/worker/routes/auth.ts:130` — magic links and CSRF both derive from `c.env.APP_URL`. A misconfiguration points emails at an attacker host and silently weakens CSRF. Add a startup assertion that `APP_URL` is `https://` in production and matches an allowlist.

### M3 — CSRF doesn't check `Content-Type`
`src/worker/middleware/csrf.ts:35-55` — Origin/Referer is checked but a belt-and-suspenders `Content-Type: application/json` requirement on `/api/*` mutations blocks legacy form-based CSRF edge cases.

### M4 — Logout `deleteCookie` missing `httpOnly`
`src/worker/routes/auth.ts:251-255` — cosmetic (server row is already deleted), but add `httpOnly: true` so attributes match.

### M5 — No "sign out everywhere"
`src/worker/routes/auth.ts` — new login creates a new session row without invalidating prior rows for the same user. Add a `POST /api/auth/logout-all` that deletes all sessions for `c.var.user.id`.

### M6 — `Content-Length` header short-circuit
`src/worker/routes/upload.ts:144-150` — trusts client-supplied header. The authoritative `file.size` check at `:186-188` still runs, so not a bypass, just wasted compute. Consider removing the pre-check or rate-limiting early rejects.

### M7 — Multipart form fields not constrained
`src/worker/routes/upload.ts:152-158` — arbitrary fields accepted. Define a narrow object and reject extras.

### M8 — `is_public` toggle has no audit log
`src/worker/routes/tree.ts:159-187` — owner-gated, but a compromised owner silently flips privacy. Add a `tree_audit` row on privacy changes.

### M9 — `photos` table columns are nullable
`src/db/schema.ts:146-148` — `object_key`, `mime`, `bytes` all `NULL`-able. The code always writes them, but an edge-case NULL causes `img.ts:134` to fall back to `application/octet-stream`, triggering browser downloads. Tighten with `notNull()`.

### M10 — `lineages.person_data` JSON trust
`src/worker/lib/tree-query.ts:289` — echoed to clients. Currently server-controlled, but any future endpoint that writes to `lineage_members` must schema-validate. Add a type-guarded serializer.

### M11 — No route guards in the React app
`src/app/App.tsx:14-15`, `src/app/pages/TreeView.tsx:141-168` — `/tree/:slug` doesn't redirect to `/login` on 401; the UI shows a generic error. Server enforces authz correctly, so no leak, but UX and defense-in-depth both suffer. Add a `<RequireAuth>` wrapper that inspects `/api/auth/me`.

### M12 — No client-side upload validation
`src/app/hooks/useUpload.ts:26-38` — any file forwarded to the server. Add a client-side MIME/size pre-check for UX. Server remains authoritative.

### M13 — `localStorage` shapes unvalidated on read
`src/app/components/TreeCanvas.tsx:101-108`, `src/app/hooks/useTweaks.ts:25-35` — data from localStorage is spread directly into state. A malicious extension or earlier XSS can plant arbitrary shapes. Parse through a minimal Zod schema before use.

### M14 — `window.TWEAK_DEFAULTS` read without validation
`src/app/hooks/useTweaks.ts:57-65` — not exploitable today (classList rejects invalid strings), but the pattern invites future regressions. Validate against the allowed enum sets before applying.

### M15 — No HTTP security response headers anywhere
`src/worker/index.ts` — no `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or `Strict-Transport-Security`. Add an outermost middleware that appends these on every response. Suggested CSP for this app:
```
default-src 'self';
img-src 'self' blob: data:;
font-src 'self' fonts.gstatic.com;
style-src 'self' 'unsafe-inline' fonts.googleapis.com;
script-src 'self';
connect-src 'self';
frame-ancestors 'none';
```
`frame-ancestors 'none'` replaces `X-Frame-Options: DENY`.

### M16 — CF resource IDs committed in docs
`wrangler.jsonc:7, 20, 35`; same IDs echoed in `README.md` and `instruction/work/todos.md`. Not secrets, but unnecessary disclosure once the repo goes public.

### M17 — `.playwright-mcp/` not gitignored
16 snapshots and console logs. One log (`console-2026-04-19T15-12-01-128Z.log`) contains a live production 500 error trace. Add `.playwright-mcp/` to `.gitignore`.

### M18 — `scripts/seed-demo.ts --remote` has no guard
`scripts/seed-demo.ts:17` — a typo of the npm script writes demo fixtures to production D1. Require a `--yes` / `CONFIRM=yes` env, or interactive prompt, when `--remote` is passed.

### M19 — img-route Cache-Control leakage
`src/worker/routes/img.ts` returns tree photos. If any cache layer (CF CDN, browser back-forward cache) caches them under a key that doesn't include the session, private photos leak cross-user. Set `Cache-Control: private, max-age=60` and `Vary: Cookie` for private trees.

---

## Low

### L1 — Weak user-enumeration timing signal on `/auth/request`
`src/worker/routes/auth.ts:76-143` — a 429 vs 204 distinction plus latency differential allows an attacker to detect whether a target recently requested a link. Low exploitability; consider accepting.

### L2 — `Number(relId)` validation returns 500 instead of 400
`src/worker/routes/tree.ts:360, 364` — `Number('abc') === NaN`. Validate with `z.coerce.number().int().positive()`.

### L3 — Raw R2 error messages leak via response
`src/worker/routes/upload.ts:215-216` — returns `err.message` which may include internal hostnames/paths. Log internally, return a generic `'upload failed'`.

### L4 — `PersonInput` string fields unbounded
`src/shared/schemas.ts:16-37` — add `.max(200)` on names and `.max(4096)` on hometown/notes.

### L5 — `credentials: 'include'` unconditional
`src/app/lib/api.ts:96` — safe today (all URLs are relative / same-origin) but a future absolute URL leaks cookies. Document the invariant.

### L6 — `multipart/form-data` wrapper mismatch risk
`src/app/lib/api.ts:161-178` vs `:98` — `uploadPhoto` uses raw `fetch` on purpose. A refactor that accidentally routes it through `api<T>()` injects `Content-Type: application/json` and breaks uploads silently. Add a comment-guard or a distinct wrapper.

### L7 — Invite code format in test fixture
`tests/fixtures/wongsuriya.ts:51` — `SURIYA-2K26-M4PL` looks production-realistic. Use a clearly fake placeholder (`TEST-INVITE-0000`).

### L8 — Future-dated `compatibility_date`
`wrangler.jsonc:4` — `2026-04-01`. Fine if it matches the workerd version in use, but document why a future date is intentional.

### L9 — `drizzle/seed.sql` not in `.gitignore`
`scripts/seed-demo.ts:244` writes it. Generated artefact shouldn't be under source control.

### L10 — `img.ts` rate-limit: double read of KV on miss
`src/worker/routes/img.ts:29-40` — minor perf. No action needed.

---

## Informational

- **No CI/CD workflows** (`.github/workflows/` absent). Manual `pnpm deploy`. When added, use encrypted GitHub Actions secrets, not repo vars.
- **`.DS_Store` ignored correctly** (`.gitignore:7`), but the top-level one shows in `git status` — confirm it isn't somehow tracked.
- **`compat_flags: ["nodejs_compat"]`** is required by better-sqlite3 in tests; no attack surface found in worker code (no `node:*` imports outside `tests/helpers/*`).
- **TypeScript `strict: true`** (`tsconfig.json:8`) — positive.
- **No Vite `define`** — no env values injected into the client bundle.
- **Google Fonts without SRI** — SRI on `<link rel="stylesheet">` with `crossorigin="anonymous"` is not universally supported and Google doesn't expose stable hashes. Consider self-hosting.
- **Dependency CVE scan** (versions in `pnpm-lock.yaml`): no known exploitable CVEs found for `hono@4.12.14`, `zod@3.25.76`, `drizzle-orm@0.36.4`, `react-router-dom@7.14.1`, `wrangler@4.83.0`, `@oslojs/crypto@1.0.1`, `@cloudflare/vite-plugin@1.32.3` as of the audit date. Run `pnpm audit` before each release.
- **Static grep confirms zero use** of React's raw-HTML escape-hatch prop, direct-DOM HTML assignment, legacy document-write, dynamic code evaluation, or Function-constructor sinks anywhere in `src/app/**`.

---

## Positives — things done right

**Cryptography / tokens**
- HMAC-SHA256 over base64url-encoded payload avoids JSON canonicalization attacks (`tokens.ts:80-82`).
- Only `sha256(nonce)` and `sha256(sessionId)` hit D1; raw tokens never stored.
- `bytesEqual` from `@oslojs/crypto/subtle` — constant-time compare (`tokens.ts:17, 112`).
- `crypto.getRandomValues` for nonce and session ID; 256 bits of entropy each.
- Session TTL (30d) and token TTL (15m) are reasonable.

**Cookies / sessions**
- HttpOnly + Secure + SameSite=Lax + Path=/ + Max-Age (`auth.ts:232-238`).
- Session rotation on every login; server-side session row deleted on logout.
- `Domain=` intentionally omitted → host-only cookie binding.

**CSRF / transport**
- Origin-based CSRF scoped to `/api/*` mutation verbs (`csrf.ts`).
- Full origin comparison (scheme + host + port), preventing http↔https downgrade.

**Auth UX**
- 204 generic response on `/auth/request` regardless of user existence — proper anti-enumeration.
- Dual rate-limiter (per-IP + per-email).
- Email normalization (lowercase + trim + 254-char cap) before DB insert and HMAC binding.

**Data layer**
- Every mutation handler uses `Zod.safeParse` on the body (`tree.ts`: 120, 171, 205, 254, 323, 384, 424; `upload.ts`: 162).
- All DB access via Drizzle's parameterized query builder — no string-interpolated SQL. The sole raw SQL in `scripts/seed-demo.ts:27-32` uses `esc()` for static demo data (no user input).
- `requireAuth` applied to every mutation in `tree.ts` (115, 159, 193, 235, 285, 311, 346, 372, 415) and router-wide on `upload.ts:133`. (The one authz gap at `overrides` → C1.)
- Role hierarchy (owner > editor > viewer) with `hasRole` helper; consistently applied for mutations in tree.ts (except overrides).
- Unique index `(user_id, person_id)` on `position_overrides` prevents cross-user clobber (`schema.ts:202`).
- `seedDemo()` is not exposed via any HTTP route — only runnable via local `pnpm db:seed:local`.

**Uploads**
- MIME allow-list + magic-byte validation + 2 MB cap (`upload.ts:78-94, 201`).
- R2 key is server-generated with `crypto.getRandomValues` via `ulidLite()` (`upload.ts:33-48`).
- `personId` character-class sanitized before path composition (`upload.ts:70`).

**Frontend**
- Zero HTML-injection sinks in `src/app/**` (verified by static search — see Informational).
- No hardcoded API keys, tokens, or PII in the client bundle.
- No session/auth tokens in `localStorage` / `sessionStorage` — only UI prefs and node-position offsets.
- `credentials: 'include'` used consistently for HttpOnly cookie flow.
- All API path params use `encodeURIComponent`.
- No `target="_blank"` links, no `rel="noopener"` omissions.
- No `window.location = userData`, `navigate(userData)`, or `<a href={userData}>` with user-controlled data.
- No `process.env` / `import.meta.env` leaked to client.
- React JSX auto-escaping covers all `{error.message}` / `{person.name}` interpolations.

**Config / repo hygiene**
- No real secrets committed (`.dev.vars` is ignored; `.dev.vars.example` uses clear placeholders).
- `.gitignore` covers `node_modules/`, `dist/`, `.wrangler/`, `.dev.vars`, `.env`, `*.local`, `.DS_Store`.
- `SESSION_SECRET` correctly kept as a Wrangler secret (not in `wrangler.jsonc vars`).
- `tsconfig.json` `strict: true`.
- Test fixtures use synthetic credentials (`test-session-secret-very-very-long-…`).

**Testing**
- `tests/integration/auth.test.ts` covers: used, expired, tampered, missing, CSRF, rate-limit, rotation, logout, cookie flags.
- `tests/integration/tree-api.test.ts` covers: anon-on-private 403, viewer-forbidden 403, non-member 403, Zod 400, `born > current_year`, 4 KB story limit.
- `tests/integration/upload.test.ts` covers: magic-byte mismatch, 2 MB cap, missing fields.

---

## Prioritized action checklist

### P0 — Must fix before any production exposure

- [ ] **C1** Add authz + per-override tree-scope check to `PUT /overrides` (`tree.ts:415`)
- [ ] **C2** Verify `from_id`/`to_id` belong to same tree in relations POST (`tree.ts:328`); validate `avatar_key` in `PersonInputSchema`
- [ ] **C3** Drop `x-forwarded-for` fallback; use `cf-connecting-ip` only (`auth.ts:55`, `img.ts:102`)
- [ ] **C4** Add per-user rate-limit on all mutation routes + `/api/upload`
- [ ] **C5** Bind magic-link verify to requesting browser (`mlreq` cookie) or add code-entry step

### P1 — Fix this week

- [ ] **H1** Atomic CAS on magic-link verify (`UPDATE … RETURNING`)
- [ ] **H2** Rename session cookie to `__Host-heritage_session`
- [ ] **H4** Replace `newId()` Math.random with `crypto.randomUUID()` or `ulidLite()`
- [ ] **H5** Add `treeId` to R2 key prefix (`upload.ts:71`)
- [ ] **H6** Set `X-Content-Type-Options: nosniff` + `Content-Disposition: inline` on `/api/img`
- [ ] **H7** Reject self-loops and parent-cycles in relations POST
- [ ] **H8** Add `.strict()` to every Zod schema in `src/shared/schemas.ts`
- [ ] **H9** Remove wildcard-origin postMessage + unvalidated listener from `useTweaks.ts`
- [ ] **H10** Regenerate `worker-configuration.d.ts` (drop stale R2 bindings)
- [ ] **H11** Add pre-commit hook blocking `dist/**` and `.wrangler/**`

### P2 — Fix this month

- [ ] M15 Add security response headers middleware (CSP, X-Frame-Options ≡ `frame-ancestors 'none'`, X-CTO, Referrer-Policy, HSTS)
- [ ] M1 Validate `SESSION_SECRET` length at boot
- [ ] M2 Validate `APP_URL` at boot
- [ ] M3 Require `Content-Type: application/json` in CSRF middleware
- [ ] M5 Add `POST /api/auth/logout-all`
- [ ] M9 Add `notNull()` to `photos.object_key/mime/bytes`
- [ ] M11 Add `<RequireAuth>` wrapper in React router
- [ ] M13–M14 Validate localStorage / `window.TWEAK_DEFAULTS` shapes
- [ ] M17 Add `.playwright-mcp/` to `.gitignore`
- [ ] M18 Add confirmation guard to `seed-demo.ts --remote`
- [ ] M19 Set `Cache-Control: private, max-age=60` + `Vary: Cookie` on `/api/img`
- [ ] H3 Evaluate moving rate-limit to a Durable Object

### P3 — Backlog

- [ ] L-series items above
- [ ] Add `pnpm audit` to CI (when CI is added)
- [ ] Consider self-hosting Google Fonts to eliminate third-party dependency
- [ ] Document that rate-limit keys and CSP are intentional in `instruction/`

---

## Low-severity remediation status (PR-1 / PR-3 / PR-4)

| ID  | Finding | Status |
|-----|---------|--------|
| L1  | Weak user-enumeration timing signal on `/auth/request` | **deferred** — weak signal, low exploitability; consider later |
| L2  | `Number(relId)` returns 500 instead of 400 | **obsolete** — relations route deleted in PR-1 |
| L3  | Raw R2 error messages leak via response | **obsolete** — upload route deleted in PR-1 |
| L4  | `PersonInput` string fields unbounded | **obsolete** — `PersonInputSchema` and shared schemas deleted in PR-1 |
| L5  | `credentials: 'include'` unconditional | **documented** — invariant comment added above `api<T>()` in `src/app/lib/api.ts` |
| L6  | `multipart/form-data` wrapper mismatch risk | **obsolete** — `uploadPhoto` and the upload route deleted in PR-1 |
| L7  | Invite-code format in test fixture | **obsolete** — login / fixture approach aborted; no action per user decision |
| L8  | Future-dated `compatibility_date` | **documented** — explanatory comment added to `wrangler.jsonc` |
| L9  | `drizzle/seed.sql` not in `.gitignore` | **fixed** — `drizzle/seed.sql` added to `.gitignore` in PR-1 |
| L10 | `img.ts` rate-limit double read of KV on miss | **fixed** — addressed inside PR-2 `img.ts` hardening |

---

## Methodology

This audit was performed by four specialized sub-agents working in parallel:

1. **Auth/Session** (Opus) — magic-link flow, HMAC, cookies, CSRF, rate-limit middleware
2. **API/Data layer** (Opus) — tree/upload/img routes, validation, SQL, R2, authz, schema
3. **Frontend** (Sonnet) — React components, routing, storage, XSS, postMessage
4. **Config/deps/infra** (Sonnet) — secrets, gitignore, wrangler, vite, package.json, tests

Each agent read its scope files end-to-end, checked against a fixed checklist of concerns, and produced a severity-ranked markdown report with file:line citations. All critical and high findings were verified by the lead auditor before inclusion in this synthesis. No dynamic testing (running the worker and probing endpoints) was performed — this is a static code audit. A follow-up dynamic test pass (`vitest run` plus targeted Playwright-driven endpoint probing) is recommended after P0/P1 fixes.
