# Plan — Universal A11y + Lighthouse 100/100 (all routes)

## Baseline (prod, 2026-06-19) — full table in agent-temp/lh/
- **Accessibility:** auth pages (login/magic/reset/verify) = 100. TreeView pages
  (home/demo) 85–86, signup 93, notfound 89.
- **Performance:** desktop 95–100; **mobile 73–88** (render-blocking fonts + TreeView TBT).
- **Best-Practices:** 75–82 everywhere. **SEO:** 82 everywhere.

## Exact failing audits (weight>0) → fix
| Audit | Wt | Where | Fix |
|-------|----|-------|-----|
| largest-contentful-paint | 25 | all 16 | self-host fonts + preload (kill 810ms render-block) |
| total-blocking-time | 30 | TreeView mobile | code-split heavy components (drawer/dialogs/pathfinder) |
| first-contentful-paint | 10 | 15 | self-host fonts (remove render-blocking gfonts `<link>`) |
| speed-index | 10 | 15 | same as FCP/LCP |
| color-contrast | 7 | TreeView/signup/notfound | darken `--ink-faint`, add `--blossom-ink`, fix NotFound inline + `--leaf` text |
| select-name | 7 | TreeView | `aria-label` on every `<select>` (ActiveViewPill, PathFinder, AddPerson, Share) |
| target-size | 7 | TreeView | bump <24px controls (upstream-btn, avp-clear, up-close, pf-close) to ≥24px |
| heading-order | 3 | TreeView | add `<h1>` + fix h4/h5 hierarchy |
| deprecations | 5 | **all 16** | **Cloudflare JS Detections injects jsd/main.js (SharedStorage/StorageType/Fledge). Disable "JavaScript Detections" on the zone.** ← infra, needs sign-off |
| errors-in-console | 1 | 8 | `/me` → 200 `{user:null}` for anon (was 401) + update tests |
| font-size | 1 | TreeView mobile | bump sub-12px text (header-btn mobile, node-dates, avp-label, meta-chip, profile-role…) ≥12px |
| meta-description | 1 | all 16 | add `<meta name=description>` to index.html |
| robots-txt | 1 | all 16 | add real `public/robots.txt` (SPA fallback was serving HTML) |

## Approach — self-host fonts
Download Prompt+Trirong woff2 (latin/latin-ext/thai; drop vietnamese), inline @font-face
into styles.css with `font-display:swap`, preload critical (Prompt 400/600 thai+latin),
remove the Google Fonts `<link>`+preconnects, tighten CSP (`font-src 'self'`, drop googleapis).

## Verify loop
1. `pnpm typecheck && pnpm test` (update /me tests) → green
2. `pnpm build` → `wrangler dev` (seed local D1) → Lighthouse all routes locally → iterate to 100 (deprecations absent locally)
3. e2e suite green
4. Deploy (`wrangler deploy`) + disable JS Detections → prod Lighthouse all 16 = 100/100

## Decision needed (surfaced after code work)
Disabling Cloudflare "JavaScript Detections" is required for Best-Practices 100 (it's the
sole cause of `deprecations` on all 16 pages) and lets us drop `script-src 'unsafe-inline'`.
Low risk (passive bot signal only; core WAF/DDoS unaffected) but it's a prod security toggle.
