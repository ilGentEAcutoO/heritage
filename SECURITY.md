# Security Policy

## Supported versions

This project follows a rolling "latest main" policy — only the current `main`
branch is supported. No long-term-support branches.

## Reporting a vulnerability

If you discover a security vulnerability, **please do not open a public
issue**. Instead, email the maintainer (see commit author history) with:

- A description of the issue
- Reproduction steps
- Your assessment of impact and affected components

You can expect an acknowledgement within 72 hours. Fixes land on `main`
and are deployed directly — no embargo period is maintained by this project.

## Threat model & scope

Heritage is an **authenticated** family-tree application running on Cloudflare
Workers (Hono + D1 + R2 + KV). Users own trees, edit people/relations, upload
photos, and share trees with others by email. Sessions are issued via an
`__Host-session` cookie.

### Anonymous (unauthenticated) attack surface

- `GET  /api/health` — liveness
- `GET  /api/tree/:slug` — gated read; only `visibility = 'public'` trees are
  returned to anonymous callers. `private` / `shared` trees and unknown slugs
  return **404** (anti-enumeration; never 401/403). Public responses redact
  `ownerId`.
- `GET  /api/img/:key` — gated by the owning tree's visibility, IP- and
  per-tree-rate-limited, with strict R2 key-shape enforcement.
- `POST /api/auth/{signup,login,verify,reset,request-reset,logout}` and
  `POST /api/auth/magic/{request,consume}` — credential / token endpoints.
  Enumeration-safe (neutral responses) and rate-limited.

### Authenticated attack surface (session cookie required)

- `GET/POST /api/trees`, `GET /api/auth/me`
- Owner-only mutations under `/api/tree/:slug/*`: person & relation CRUD,
  photo upload/delete, share management, visibility/theme/node-style updates.
  Non-owners receive **404** (anti-enumeration), enforced by
  `resolveOwnerTree` + `canAccessTree`.

## Current controls

- **AuthN:** email+password (scrypt N=16384, per-user random salt,
  `timingSafeEqual`), magic-link, and email-verification flows. Login uses a
  dummy scrypt run for unknown emails to keep timing uniform.
- **Sessions:** opaque 256-bit CSPRNG tokens; only the SHA-256 hash is stored.
  Cookie is `__Host-`-prefixed (Secure, `Path=/`, no `Domain`), `HttpOnly`,
  `SameSite=Lax`. Sliding-window refresh; password reset invalidates all
  sessions; an hourly cron purges expired sessions (+ their IP/UA metadata).
- **Tokens:** verify/reset/magic tokens are 256-bit CSPRNG, stored hashed, and
  consumed atomically (`UPDATE … RETURNING` with `used_at IS NULL` as a CAS) so
  a token can be redeemed at most once. TTLs: verify 24h, reset 1h, magic 15m.
- **AuthZ:** every tree mutation is owner-gated; read access goes through
  `canAccessTree` (public / private-owner / shared-accepted), fail-closed.
- **CSRF:** explicit `Origin` allow-list on all mutation methods, layered on
  the `SameSite=Lax` cookie.
- **Injection:** all DB access uses parameterized Drizzle queries (no string-
  built SQL). User-controlled values in HTML emails are HTML-escaped; values in
  email headers are stripped of CR/LF/control chars.
- **Uploads:** MIME allow-list (jpeg/png/webp), 5 MB cap, R2 keys built only
  from server-validated IDs; served with the stored MIME + `nosniff` so a
  disguised file cannot execute.
- **Headers:** CSP, HSTS (preload), `X-Content-Type-Options`, Referrer-Policy,
  Permissions-Policy, `frame-ancestors 'none'` on every response (Worker + SPA).
- **Rate limiting:** per-email + per-IP login limits (CF rate-limit bindings),
  KV limiters for image reads and photo mutations, and a per-owner tree quota.
- **CI gates:** every PR runs `pnpm typecheck`, `pnpm test`, and
  `pnpm audit --prod`. Pre-commit hooks block committing build artifacts.

## Dependency policy

`pnpm audit --prod` must report 0 vulnerabilities of any severity before a
change lands on `main`. Transitive advisories in the dev toolchain are pinned
to patched versions via `pnpm.overrides` in `package.json` (e.g. `esbuild`,
`ws`, `undici`); a documented rationale belongs in the PR description.

## Out of scope

- Cloudflare account compromise (infrastructure-level)
- Social engineering against maintainers
- Physical access attacks
- Denial-of-service / volumetric resource exhaustion
