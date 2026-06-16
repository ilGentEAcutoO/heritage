# Plan: Anonymous homepage = demo tree + top-right login button

> Created: 2026-06-16 · Workstream 07 · Approach: TDD (tests first), small sub-agent team

## Architecture

```
Route "/"  →  <Home/>            (NEW: src/app/pages/Home.tsx)
                │ useSession()
                ├─ loading        → minimal neutral placeholder (no flash)
                ├─ user           → <Landing/>          (logged-in splash, simplified)
                └─ guest (null)   → <TreeView treeSlug="wongsuriya" />   (demo tree at /)

TreeView header .header-actions  (shared by /, /demo/wongsuriya, /tree/:slug)
                │ useSession()
                ├─ loading        → render nothing (matches current UserMenu)
                ├─ user           → <UserMenu/>          (unchanged 👤 dropdown)
                └─ guest (null)   → <Link to="/login" data-testid="header-login">เข้าสู่ระบบ</Link>
```

- `App.tsx`: change `/` route element from `<Landing/>` to `<Home/>`. Everything else stays.
- `Landing.tsx`: remove the dead guest branch; render only the logged-in UI.
- No backend changes.

## Contract (fixed so tests + impl agree)
- New testid **`header-login`** on the guest login control; it is an `<a>` (`<Link>`),
  role=`link`, accessible name exactly `เข้าสู่ระบบ`, `href="/login"`.
- Guests have **no** `data-testid="user-menu-trigger"` in the TreeView header.
- Logged-in users at `/` still expose `data-testid="logout-button"` (Landing) and the
  `<UserMenu/>` (`user-menu-trigger`) in tree headers.

## Test Specifications (write/adjust FIRST, must fail before impl)

### Unit (vitest, source-assertion style — node env, no jsdom)
- **NEW `tests/unit/Home.test.tsx`**: assert `Home.tsx` imports `useSession`, `Landing`,
  `TreeView`; references `treeSlug="wongsuriya"`; branches on `user`/`loading`.
- **TreeView.test.tsx** (extend): assert the guest header path references
  `data-testid="header-login"`, a `<Link`/`to="/login"`, and is gated on `!user`.
  Keep all existing 404/POV assertions green.

### E2E (Playwright)
- **`01-landing.spec.ts` — REWRITE S1** (guest `/`): canvas `tree-canvas` visible + ≥1
  `[data-person]`; `header-login` visible, role=link, href `/login`; the old splash link
  "ดู demo tree" is **absent**; console errors/warnings = `[]`.
- **`01-landing.spec.ts` — NEW S1b** (logged-in `/`): after signup+verify, `goto('/')` →
  Landing splash visible (`logout-button` + "ดูต้นไม้ของฉัน"); `tree-canvas` **not** present;
  console clean.
- **`01-landing.spec.ts` — S2** (`/demo/wongsuriya`): unchanged; must stay green.
- **`11-user-menu.spec.ts`**:
  - **M1 REWRITE** (guest on /demo): `header-login` visible; `user-menu-trigger` absent.
  - **M2 REWRITE** (guest): click `header-login` → URL `/login`.
  - **M3 KEEP** (auth): 👤 menu shows displayName/trees/logout; trees → /trees.
  - **M4 UPDATE** (logout from demo): after logout, assert `header-login` visible +
    `user-menu-trigger` hidden (was: guest dropdown).
  - **M5/M6 REWRITE** (Escape / click-outside close): run with an **authenticated** session
    (only auth users now have the dropdown).
- **`05-logout.spec.ts` — S9**: expected to stay green **unchanged** (post-logout login
  `<Link>` named "เข้าสู่ระบบ" satisfies it). Treated as a regression guard — verify, don't edit
  unless it legitimately needs the demo-tree load timeout bumped.

## Implementation Steps (ordered, parallel-friendly)
1. Write/adjust the failing tests above to the Contract (TASK-004).
2. `Home.tsx` + `App.tsx` route swap (TASK-001).
3. TreeView header guest login button (TASK-002).
4. Simplify `Landing.tsx` (remove dead guest branch) (TASK-003).
5. Integrate: `pnpm typecheck` + `pnpm test` (unit) → green.
6. `pnpm e2e` (local) → all specs green; fix fallout.
7. frontend-test (MCP Playwright) on `/` guest, `/` logged-in, `/demo/wongsuriya`: verify
   visuals + **zero console errors/warnings**.
8. Adversarial review (sub-agent) + verification-before-completion, then commit/push/monitor.

## Security Considerations
- Reuses public demo tree + existing `/api/auth/me`; no new endpoints, no new data exposure.
- No auth bypass — `/` guest renders only the hardcoded public `wongsuriya` slug.
- Fail-open on `/me` non-401 error → public demo only (no private data).
- Login control is a client-side `<Link>` to `/login`; no CSRF/origin change.

## Parallel execution groups
- **Group A (Phase 1, parallel — different files):**
  - TASK-004 tests (tests/**) · TASK-001 routing (App.tsx + new Home.tsx) ·
    TASK-002 TreeView header (TreeView.tsx) · TASK-003 Landing (Landing.tsx).
  - All four touch disjoint files; the shared Contract (testids) is fixed above.
- **Group B (Phase 2, sequential — integration):** typecheck + unit + e2e + frontend-test +
  review. Single coordinator-driven pass after Group A merges.
