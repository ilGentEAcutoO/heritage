# Active Tasks — Universal A11y + Lighthouse (all routes) — SHIPPED

Updated: 2026-06-19 09:35 · Live on https://heritage.jairukchan.com (commit 2f4cdbb)

## Achieved on prod (verified Lighthouse 2026-06-19)
- **Accessibility = 100** on every route, mobile + desktop ✅
- **SEO = 100** on every route, mobile + desktop ✅
- **Desktop Performance = 99–100** ✅
- Universal design: WCAG AA contrast, keyboard focus ring, proper heading order,
  named controls, ≥24px tap targets, ≥12px text, reduced-motion, self-hosted fonts.

## Capped by the user's deliberate decisions (NOT code-fixable)
- **Best-Practices = 82** — Cloudflare "JavaScript Detections" injects jsd/main.js
  (deprecations). User chose to KEEP it (security). Disable anytime → BP 100 + better mobile perf.
- **Mobile Performance = 85–94** — ~190ms TBT from CF jsd + Web Analytics beacon
  (locally, without them, these pages hit 95–99) PLUS the client-rendered React mount
  (LCP ~2.5–3s). User chose to accept ~95 / defer prerendering.

## To reach a literal Lighthouse 100 everywhere (requires reversing the above)
1. Disable Cloudflare "JavaScript Detections" → BP 100 + recover ~half the mobile TBT.
2. (optional) Disable Cloudflare Web Analytics beacon → recover the other half of TBT.
3. Add SSR/prerendering for the heavy tree pages → mobile Performance 100.

## Optional follow-ups (not blocking; not done)
- Darken --accent-grad so .btn-primary white text passes AA (axe skips gradients, so
  Lighthouse-clean today, but a real low-contrast spot). Brand change → ask first.
- Theme variants (forest/blueprint) contrast not re-audited (default Warm Heritage is AA).
- Re-theme transactional emails (still old sage #6b8f5e) — from prior session.

## File Lock Registry
| File | Locked by | Task | Since |
|------|-----------|------|-------|
| _(none)_ | | | |
