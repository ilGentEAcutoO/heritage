# Requirements — Universal Accessibility + Lighthouse 100/100 (all routes)

**Session goal (user, 2026-06-19):** Fully inspect and complete: make Heritage a
universal-accessibility / universal-design app, and pass Lighthouse **100** on
**both mobile and desktop** for **every "app" (route)** — not just the main tree page.

## Scope — the "apps" = every public route of the SPA
| Route | Page | Notes |
|-------|------|-------|
| `/` | Home → demo TreeView (guest) / Landing (auth) | heavy canvas for guests |
| `/demo/wongsuriya` | TreeView | heavy canvas |
| `/tree/:slug` | TreeView | heavy canvas (auth/shared) |
| `/login` | Login | form + tabs |
| `/signup` | Signup | form |
| `/auth/reset` | ResetRequest | form |
| `/auth/reset/confirm` | ResetPassword | form (needs token) |
| `/auth/verify` | Verify | status (needs token) |
| `/auth/magic` | Magic | status (redirects w/o token) |
| `/trees` | Trees | protected (redirects to /login) |
| `*` | NotFound | 404 |

## Definition of done
1. Lighthouse **Performance / Accessibility / Best-Practices / SEO = 100** on
   **mobile AND desktop** for every route above that can be audited unauthenticated
   (auth-gated routes measured against their rendered state / local build).
2. Universal design beyond Lighthouse's automated subset: WCAG 2.2 AA contrast,
   full keyboard operability, visible focus, screen-reader semantics, reduced-motion,
   target sizes — verified manually where Lighthouse can't see them.
3. No regressions: `pnpm typecheck`, `pnpm test`, e2e suite still green.
4. Shipped to production (https://heritage.jairukchan.com) and re-verified on prod.

## Constraints
- Cloudflare Worker + React 18 SPA (single `index.html`, React Router).
- CSP keeps `'unsafe-inline'` on script-src (Cloudflare bot-injection) — `csp-xss`
  is weight-0 in Lighthouse 12, so it won't block Best-Practices 100.
- Deploy is `workflow_dispatch` (manual) — ship via `wrangler deploy` or trigger Deploy workflow.
- No AI signature in commits. Temp files under `agent-temp/` only.
