# Requirements — Workstream 07: Anonymous homepage = demo tree + top-right login button

> Created: 2026-06-16 · Status: PLANNING (awaiting approval)

## Raw request (user, 2026-06-16, Thai)
> เข้ามาหน้า https://heritage.jairukchan.com/ ถ้ายังไม่ login เปิด demo tree แสดงไปเลยครับ
> แล้วทำปุ่มเข้าสู่ระบบแสดงขวาบนไปเลย

Translation: On the homepage `/`, if the visitor is **not logged in**, show the **demo tree
directly**. And put a **"เข้าสู่ระบบ" (Login) button at the top-right**, visible immediately.

## Research findings (current behavior)
- **Routing** (`src/app/App.tsx`): `/` → `<Landing />`; `/demo/wongsuriya` →
  `<TreeView treeSlug="wongsuriya" />`; `/tree/:slug` → `<TreeView />`; `/trees` (protected).
- **`/` today** (`src/app/pages/Landing.tsx`): a marketing splash (logo + tagline), with
  **session-aware CTAs** — guests get a "ดู demo tree" link (→ /demo/wongsuriya) + a small
  "เข้าสู่ระบบ →" link (→ /login); logged-in users get "ดูต้นไม้ของฉัน" (→ /trees) +
  an "ออกจากระบบ" button (`data-testid="logout-button"`).
- **Demo tree already exists** — `<TreeView treeSlug="wongsuriya" />`. The TreeView header
  (`src/app/pages/TreeView.tsx`) already renders a top-right `<UserMenu />`. For **guests**
  it's a "👤" trigger hiding Home + Login inside a dropdown; for **auth** users it shows
  their initial + Home/Trees/Logout.
- **Session** (`src/app/hooks/useSession.ts`): singleton; `loading: true` until
  `GET /api/auth/me` resolves; guest = 401 → `user: null`; non-401 error → `user: null` + error.
- **Demo data is public** — no backend change needed; reusing the public `wongsuriya` slug
  at `/` exposes nothing new.

## Agreed scope (from clarifying Q&A 2026-06-16)
- [x] **Guest at `/`** → render the demo tree (`wongsuriya`) directly, in place (URL stays `/`).
- [x] **Logged-in at `/`** → KEEP the existing Landing splash (My Trees + logout). *(Q1)*
- [x] **Top-right login control for guests** → a **clear, visible "เข้าสู่ระบบ" button**
      that **replaces the 👤 UserMenu** for guests, applied to the shared TreeView header
      (so `/` guest, `/demo/wongsuriya`, `/tree/:slug` guests are consistent). *(Q2)*
- [x] **Old guest marketing splash** → **dropped**. Guests never see it again; the
      logged-in splash stays. *(Q3, reconciled — see note)*

### ⚠️ Reconciliation note (confirm at approval)
Q1 ("keep landing splash") and Q3 ("drop the splash") are only consistent under one reading,
which we adopt: **drop the *guest* splash** (guests get the demo tree at `/`); **keep the
*logged-in* splash** (logged-in users still see logo + "ดูต้นไม้ของฉัน" + logout at `/`).
Net effect on code: `Landing.tsx` is **kept but simplified** — its dead guest branch is
removed; it renders only the logged-in UI (and is only ever mounted for logged-in users).

## Technical decisions
- **D1 — Render-in-place, not redirect.** Guest `/` mounts `<TreeView treeSlug="wongsuriya" />`;
  URL stays `/`. ("แสดงไปเลย" + clean URL.)
- **D2 — Session gate to avoid flash.** New `Home.tsx` branches on `useSession()`:
  `loading` → minimal neutral placeholder (same bg, no spinner) → then `user ? <Landing/> :
  <TreeView treeSlug="wongsuriya" />`. Fail-open: a non-401 `/me` error → treated as guest
  (shows public demo; exposes nothing private).
- **D3 — Login button is a `<Link>`, not a `<button>`.** `<Link to="/login"
  data-testid="header-login">เข้าสู่ระบบ</Link>`, styled as a prominent header CTA. Rendered
  only when `!loading && !user`; auth users keep `<UserMenu />`. **Why a Link:** preserves
  e2e S9 (05-logout), which asserts a `role=link` named "เข้าสู่ระบบ" after logout.

## Security considerations
- No new endpoints; reuses the already-public demo tree + existing `/api/auth/me`.
- No auth bypass: `/` guest renders the hardcoded public `wongsuriya` slug only — never a
  private tree.
- Fail-open on `/me` error renders only public demo content (acceptable; no private data).
- Login button is a plain client-side link to `/login`; no CSRF/origin surface change.

## Out of scope
- No backend/API changes. No change to `/demo/wongsuriya`, `/tree/:slug`, `/trees`, or auth
  flows themselves. No visual redesign of the demo tree. Dependabot advisories (separate).
