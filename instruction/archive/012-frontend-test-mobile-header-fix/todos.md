# Active Tasks — Frontend Test (Full Loop)

Updated: 2026-06-19 12:46

## Scope
`/frontend-test full loop` — drive every route + key interactions through a real
browser (MCP Playwright) against the local `vite dev` build (http://localhost:5173,
worker + seeded local D1). Goal: changes render correctly, **zero console
errors**, **zero console warnings**, no failed network requests. Act as code owner
— fix every issue found, re-test until clean, then report.

## Test target
- Server: `pnpm dev` (vite dev + CF plugin, local D1 seeded with Wongsuriya demo).
- Viewports: desktop 1280×800 + mobile 390×844.
- Per route: navigate → console(error+warning) → network(no 4xx/5xx) → screenshot.

## Scenarios
| # | Route / Action | Expectation | Status |
|---|----------------|-------------|--------|
| T1 | `/` (guest) | Wongsuriya demo tree renders, nodes visible | ✅ |
| T2 | `/demo/wongsuriya` | Same demo tree via explicit route | ✅ |
| T3 | `/login` | Login form renders, inputs labelled | ✅ |
| T4 | `/signup` | Signup form renders | ✅ |
| T5 | `/auth/reset` | Reset-request form renders | ✅ |
| T6 | `/auth/reset/confirm` (no token) | Graceful error/empty state, no crash | ✅ |
| T7 | `/auth/verify` (no token) | Graceful error state, no crash | ✅ |
| T8 | `/auth/magic` (no token) | → `/login?tab=magic` (sensible) | ✅ |
| T9 | `/trees` (unauthed) | Redirect to /login | ✅ |
| T10 | `/no-such-page` | NotFound (404) renders | ✅ |
| I1 | Demo tree → person nodes | ProfileDrawer (auto-selected นภา), no error | ✅ |
| I2 | Theme picker → Ocean | Re-themes (.app inline OKLCH tokens), no error | ✅ |
| I3 | Node style picker → Polaroid | Re-renders nodes, no error | ✅ |
| I4 | PathFinder → นภา↔ก้าน | Computed "ปู่ทวด" (great-grandfather), no error | ✅ |
| M1 | Mobile 390/320 → tree + nav | **Found + fixed header overflow bug** | ✅ |

## Findings
- **Console: 0 errors, 0 warnings on every route + interaction.** (Only the
  benign React-DevTools dev hint at info level.) All network 200.
- **All error/empty states graceful** (tokenless verify/reset/magic, 404, auth guard).
- **BUG (mobile, fixed):** TreeView header overflowed on phones. The action row
  (PathFinder/Theme/Node/Tweaks/Login) didn't fit ≤~510px; the long PathFinder
  label "เราเกี่ยวกันยังไง?" wrapped to **4 lines**, and `align-items:stretch`
  stretched every action button to **104px tall** → broken header + 28px of
  horizontal scroll clipping the Login button off-screen.
  - Secondary: after compacting, the theme/node dropdowns (anchored `right:0`,
    180px wide) clipped off the **left** viewport edge.

## Fixes applied (verified at 320 / 390 / 1280px)
- [x] `styles.css` `.header-btn` — `white-space:nowrap` + `flex-shrink:0`
      (no button label ever wraps; kills the 104px stretch).
- [x] `styles.css` @≤560px — `.header-btn .btn-label{display:none}` (icon-only
      tool buttons, like the existing ⚙), `.logo-word{display:none}` (logomark
      only), tighter `.header-actions` gap. Result: header 418→**no overflow**.
- [x] `styles.css` @≤560px — `.header-menu{position:fixed;right:10px;top:58px}`
      pins theme/node dropdowns to the viewport's right edge (fully on-screen).
- [x] `TreeView.tsx` — wrapped PathFinder label in `.btn-label`, wordmark in
      `.logo-word`; added `aria-label`/`aria-expanded` so the accessible name
      is preserved when the visual label is hidden (keeps a11y 100).
- [x] `ThemePicker.tsx` / `NodeStylePicker.tsx` — `.btn-label` span +
      `aria-label` + `.header-menu` class on the popover.

## Verification
- [x] `pnpm typecheck` — pass
- [x] `pnpm test` — **636/636 pass (58 files)** (incl. component source-string tests)
- [x] Desktop (1280px) unchanged: full labels + wordmark + popover anchored to button
- [x] Mobile (320/390px): no horizontal scroll, dropdowns on-screen, console clean

## File Lock Registry
| File | Locked by | Task | Since |
|------|-----------|------|-------|
| _(none)_ | | | |

## Prior session (archived context)
Full security review + npm audit — DONE (undici pin, email header sanitize,
SECURITY.md rewrite; 632/632 tests, 0 audit vulns). See git log.
