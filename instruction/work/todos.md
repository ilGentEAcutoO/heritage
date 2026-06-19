# Active Tasks — Universal A11y + Lighthouse 100/100 (all routes)

Updated: 2026-06-19 08:12 · Goal: every route scores Lighthouse 100 on mobile+desktop + universal design.

## Done (code complete, tests green, build clean)
- [x] **Baseline** prod Lighthouse, all 16 (8 routes × m/d) → agent-temp/lh/
- [x] **Self-host fonts** — 33 woff2 (Prompt+Trirong, thai/latin/latin-ext), @font-face in styles.css,
      preload 4 critical, removed render-blocking Google Fonts `<link>` (was 810ms). → FCP/LCP/SI
- [x] **SEO** — `<meta name=description>` + `public/robots.txt` (was SPA-fallback HTML) + favicon.svg
- [x] **CSP** tightened: `font-src 'self'`, dropped googleapis (fonts now same-origin)
- [x] **errors-in-console** — `/me` → 200 `{user:null}` for anon (was 401) + useSession + api type + 6 tests
- [x] **color-contrast** — darkened `--ink-faint`→#75604a, added `--blossom-ink`/`--leaf-ink` for text,
      converted gold/terracotta text usages, fixed NotFound opacity-dimmed text. All ≥4.5:1.
- [x] **select-name** — aria-label on ActiveViewPill + PathFinder selects (others already labeled)
- [x] **target-size** — upstream-btn/up-close/pf-close/avp-clear 22→26px
- [x] **heading-order** — sr-only `<h1>` on TreeView; sidebar h4→h2, rel h4→h3, story h5→h4, tweaks h4→h2 (+CSS)
- [x] **font-size** — all sub-12px label text → 12px (legible-text audit)
- [x] typecheck ✓  ·  632 unit/integration tests ✓  ·  build ✓ (no googleapis/gstatic in dist)

## In progress
- [ ] **Local Lighthouse verify** (wrangler dev + seeded D1) — running, all routes m/d
      (validates everything except `deprecations`, which is a prod-only Cloudflare script)

## Pending
- [ ] Code-split TreeView heavy dialogs IF local TBT still >200ms (else skip)
- [ ] e2e suite (playwright) green
- [ ] **DECISION + Cloudflare:** disable "JavaScript Detections" on the zone — sole cause of
      `deprecations` on all 16 (CF-injected jsd/main.js). Required for BP 100. Security toggle → needs sign-off.
- [ ] Deploy (`wrangler deploy`) + final prod Lighthouse all 16 = 100/100
- [ ] workflow-end: archive, update memory

## File Lock Registry
| File | Locked by | Task | Since |
|------|-----------|------|-------|
| _(none)_ | | | |
