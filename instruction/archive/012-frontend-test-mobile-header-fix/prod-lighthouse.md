# Production Lighthouse — 2026-06-19 (post-deploy, JS Detections ON)

| page | Perf | A11y | BestPr | SEO |
|---|---|---|---|---|
| demo-tree-desktop | 99 | 100 | 81 | 100 |
| demo-tree-mobile | 85 | 100 | 82 | 100 |
| home-desktop | 99 | 100 | 81 | 100 |
| home-mobile | 86 | 100 | 82 | 100 |
| login-desktop | 99 | 100 | 81 | 100 |
| login-mobile | 90 | 100 | 82 | 100 |
| magic-desktop | 100 | 100 | 81 | 100 |
| magic-mobile | 89 | 100 | 82 | 100 |
| notfound-desktop | 100 | 100 | 81 | 100 |
| notfound-mobile | 94 | 100 | 82 | 100 |
| reset-desktop | 100 | 100 | 81 | 100 |
| reset-mobile | 90 | 100 | 82 | 100 |
| signup-desktop | 100 | 100 | 81 | 100 |
| signup-mobile | 89 | 100 | 82 | 100 |
| verify-desktop | 100 | 100 | 81 | 100 |
| verify-mobile | 92 | 100 | 82 | 100 |

- A11y + SEO = 100 on every route (mobile+desktop). Desktop Perf 99-100.
- Best-Practices 81-82: capped by Cloudflare JS Detections (jsd/main.js deprecations). Disable -> 100.
- Mobile Perf 85-94: ~190ms TBT from CF jsd+beacon scripts + SPA React mount. Disabling JS Detections recovers a large part.
