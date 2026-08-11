---
name: deploy
description: Deploy application with CI/CD priority. Use when user says "deploy", "ship it", "ส่งขึ้น production". ALWAYS checks for GitHub Actions first — if CI/CD exists, uses commit+push instead of direct CLI.
---

# Deploy

Deploy application. **CI/CD first — always.**

## Decision Tree

```
Has .github/workflows/*deploy* ?
├── YES → Commit & Push → Monitor GitHub Actions
│         (Use git-commit + git-push skills)
└── NO → Has wrangler.toml?
         ├── YES → npx wrangler deploy
         └── NO → Has vercel.json?
                  ├── YES → npx vercel --prod
                  └── NO → Has deploy script?
                           ├── YES → npm run deploy
                           └── NO → Ask user
```

## Via CI/CD (Preferred)

Don't use direct deploy! Instead, commit and push to trigger workflow. Then use **git-push** skill to monitor Actions.

## Via Direct CLI (Fallback)

Only if NO GitHub Actions exist:

```bash
# Cloudflare Workers/Pages
npx wrangler deploy
npx wrangler pages deploy ./dist

# Vercel
vercel --prod

# Netlify
netlify deploy --prod
```

## Pre-deploy Checklist

```bash
npm run test
npm run build
npx tsc --noEmit
npm run lint
```

## Environment Mapping

- `main`/`master` → Production
- `staging`/`develop` → Staging/Preview

## Post-deploy

```bash
curl -I https://your-app.com
```

Use **frontend-test** skill on production URL if applicable.
