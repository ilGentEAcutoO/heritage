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

Heritage is a read-only family-tree viewer. The public attack surface is:

- `GET /api/health` — liveness
- `GET /api/tree/:slug` — public trees only; `is_public = false` rows return 404
- `GET /api/img/:key` — rate-limited, with strict R2 key shape enforcement

There is currently **no authentication** on the application. Any feature that
would require user-specific data (editing, account management, private trees
accessible to owners) is intentionally deferred — see
`instruction/security-review.md` and `instruction/work/plan.md`.

## Current controls

- CSP, HSTS, X-CTO, Referrer-Policy, Permissions-Policy on all responses
- Rate limit on image fetches (IP + per-tree caps)
- R2 key regex enforcement (path-traversal resistant)
- HttpOnly-style cookie posture N/A (no sessions issued)
- CI gates every PR: `pnpm typecheck`, `pnpm test`, `pnpm audit --prod`
- Pre-commit hook blocks committing `dist/`, `.wrangler/`, `.playwright-mcp/`

## Dependency policy

`pnpm audit --prod` must report 0 vulnerabilities of any severity before a
change lands on `main`. Moderate advisories in dev-only dependencies are
permissible with a documented rationale in the PR description.

## Out of scope

- Cloudflare account compromise (infrastructure-level)
- Social engineering against maintainers
- Physical access attacks
