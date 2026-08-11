---
name: cloudflare-naming
description: Naming convention for Cloudflare resources. Use when creating any Cloudflare resource (D1, KV, R2, Workers, Pages, Queues, etc.). All resources MUST be prefixed with project name. Trigger even if user doesn't mention naming — apply automatically whenever a CF resource is created.
---

# Cloudflare Naming Convention

All Cloudflare resources must follow this pattern:

## Format

```
[projectname]-[service]-[purpose]
```

## Examples

| Resource | Name |
|----------|------|
| D1 Database (main) | `myapp-d1-main` |
| D1 Database (sessions) | `myapp-d1-sessions` |
| KV Namespace (cache) | `myapp-kv-cache` |
| KV Namespace (rate-limit) | `myapp-kv-ratelimit` |
| R2 Bucket (uploads) | `myapp-r2-uploads` |
| R2 Bucket (backups) | `myapp-r2-backups` |
| Worker (API) | `myapp-worker-api` |
| Worker (cron) | `myapp-worker-cron` |
| Queue (email) | `myapp-queue-email` |
| Pages (frontend) | `myapp-pages-web` |

## Rules

1. **Always prefix with project name** — no exceptions
2. **Lowercase only** — never uppercase
3. **Hyphens only** — never underscores
4. **Be descriptive** — purpose should be clear from name
5. **Stay consistent** — same pattern across entire project

## Auto-detect Project Name

```bash
# From package.json
jq -r '.name' package.json 2>/dev/null

# From wrangler.toml
grep "^name" wrangler.toml 2>/dev/null | head -1 | cut -d'"' -f2

# From directory name
basename $(pwd)
```
