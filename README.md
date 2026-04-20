# Heritage — Family Tree on Cloudflare Workers

A multi-tenant family tree application built on Cloudflare Workers, D1, R2, and KV.

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
```

## Cloudflare Resources

| Resource | Name | ID |
|---|---|---|
| D1 | `heritage-d1-main` | `3ef17b93-e7ff-4631-8ffe-9ab9f6cc8694` |
| R2 | `heritage-r2-photos` | (name binding) |
| KV | `heritage-kv-ratelimit` | `d3a23a837d0a486d81575ebaf23b88cb` |

Custom domain: `heritage.jairukchan.com`

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
| `pnpm cf-typegen` | Generate worker-configuration.d.ts |

## Local Dev Setup

1. Copy `.dev.vars.example` → `.dev.vars` and fill in secrets
2. `pnpm install`
3. `pnpm db:migrate:local` (apply D1 schema locally)
4. `pnpm db:seed:local` (load Wongsuriya demo data)
5. `pnpm dev`

Set `EMAIL_DEV_STUB=1` in `.dev.vars` to log magic links to console instead of sending real emails.

## Plan

See `instruction/work/plan.md` for full architecture, data model, API surface, and implementation roadmap.
