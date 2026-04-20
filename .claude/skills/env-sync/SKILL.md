---
name: env-sync
description: Keep .env.example and .dev.vars.example in sync with actual env files. Use whenever creating, adding, removing, or renaming environment variables in .env, .dev.vars, or any env file. Also trigger on "sync env", "อัปเดต example", "env ครบไหม", after adding new API keys or secrets, or when reviewing code that references process.env / import.meta.env / c.env. Ensures .example files always reflect the real env structure with safe placeholder values and generation commands.
---

# Env Sync

Keep `.example` files in perfect sync with actual env files.

## Workflow

### 1. Detect env files

```bash
find . -maxdepth 2 -name ".env*" -o -name "dev.vars*" -o -name ".dev.vars*" | grep -v node_modules | sort
```

Common pairs:

| Real File | Example File |
|-----------|-------------|
| `.env` | `.env.example` |
| `.env.local` | `.env.example` |
| `dev.vars` | `dev.vars.example` |
| `.dev.vars` | `.dev.vars.example` |

### 2. Scan codebase for env usage

```bash
grep -rhoE "(process\.env|import\.meta\.env|c\.env|Env\.)\.([A-Z_][A-Z0-9_]*)" src/ server/ app/ --include="*.ts" --include="*.vue" --include="*.js" --include="*.tsx" | sort -u
grep -A1 "\[vars\]" wrangler.toml 2>/dev/null
```

### 3. Compare and flag

- **Missing in example** — key in real env but not in example → add
- **Extra in example** — key in example but unused → confirm removal
- **Order mismatch** — example should mirror real env's grouping
- **Missing generation hints** — secrets without generation commands

### 4. Generate example file

```bash
# ──────────────────────────────────────────
# App
# ──────────────────────────────────────────
APP_NAME=my-app
APP_URL=http://localhost:3000
NODE_ENV=development

# ──────────────────────────────────────────
# Auth / Secrets
# generate: openssl rand -base64 32
# ──────────────────────────────────────────
JWT_SECRET=
SESSION_SECRET=

# ──────────────────────────────────────────
# Third-party APIs
# get from: https://dashboard.stripe.com/apikeys
# ──────────────────────────────────────────
STRIPE_SECRET_KEY=sk_test_...
```

## Format Rules

1. **Group related keys** with `# ───` dividers
2. **Add `# generate:` comment** for auto-generated secrets
3. **Add `# get from:` comment** with URL for third-party keys
4. **Safe placeholders:** secrets → empty, URLs → localhost, test keys → `sk_test_...`
5. **Never put real secrets** in example file
6. **Preserve order** from real env file

## Generation Commands

| Use Case | Command |
|----------|---------|
| Generic secret (32 bytes) | `openssl rand -base64 32` |
| JWT secret | `openssl rand -base64 64` |
| Encryption key (256-bit) | `openssl rand -base64 32` |
| Hex key | `openssl rand -hex 32` |
| UUID | `uuidgen` |
| Cookie secret | `openssl rand -base64 32` |

## Verify .gitignore

```bash
grep -q "^\.env$\|^\.env\.local$" .gitignore && echo "OK" || echo "MISSING: add .env to .gitignore!"
grep -q "^dev\.vars$\|^\.dev\.vars$" .gitignore && echo "OK" || echo "MISSING: add dev.vars to .gitignore!"
git check-ignore .env.example && echo "WARNING: .env.example is gitignored!" || echo "OK"
```
