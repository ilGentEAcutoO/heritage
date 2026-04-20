# Heritage — Family Tree on Cloudflare Workers

A read-only family-tree viewer built on Cloudflare Workers, D1, R2, and KV.

> **Current posture:** read-only. The login/authentication layer has been removed — see `instruction/security-review.md` and `instruction/work/plan.md` for the remediation roadmap. A future phase will reintroduce auth with request-binding.

## Quick Start

```bash
# Install dependencies
pnpm install

# Generate CF worker types
pnpm cf-typegen

# Start dev server (Vite + Worker HMR)
pnpm dev

# Visit http://localhost:5173
# API health: http://localhost:5173/api/health
# Demo tree:  http://localhost:5173/demo/wongsuriya
```

## API surface (post-refactor)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | liveness probe |
| GET | `/api/tree/:slug` | public trees only (`is_public` gated); 404 for private |
| GET | `/api/img/:key` | public-tree photos; 403 for private; KV rate-limited |

All mutation and authentication endpoints have been removed.

## Cloudflare Resources

Resource IDs and bindings are declared in `wrangler.jsonc` (the authoritative source). Custom domain: `heritage.jairukchan.com`.

## Scripts

| Script | Description |
|---|---|
| `pnpm dev` | Start Vite dev server with Worker HMR |
| `pnpm build` | Build for production |
| `pnpm deploy` | Deploy to Cloudflare Workers |
| `pnpm typecheck` | TypeScript type-check |
| `pnpm test` | Run Vitest tests |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:migrate:local` | Apply migrations locally |
| `pnpm db:migrate:remote` | Apply migrations to CF D1 |
| `pnpm db:seed:local` | Seed demo Wongsuriya data locally |
| `pnpm cf-typegen` | Generate `worker-configuration.d.ts` |

## Local Dev Setup

1. Copy `.dev.vars.example` → `.dev.vars`
2. `pnpm install`
3. `pnpm db:migrate:local` (apply D1 schema locally)
4. `pnpm db:seed:local` (load Wongsuriya demo data)
5. `pnpm dev`

## Security

- Threat model and findings: `instruction/security-review.md`
- Remediation plan: `instruction/work/plan.md`
- Previous build baseline: `instruction/archive/01-heritage-initial-build/`
