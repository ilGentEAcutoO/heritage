# Plan: TreeView UX Improvements

> Created: 2026-05-02 16:01 (+07)
> Amended: 2026-05-02 16:08 (+07) — added Feature 2 (POV from ProfileDrawer)
> Workstream: 05-treeview-improvements

## Features

1. **User Menu** — dropdown ในหัว TreeView (login / home / trees / logout)
2. **POV from ProfileDrawer** — ปุ่ม "ดูจากมุมของคนนี้" ใน drawer เพื่อตั้งค่า `activeViewId` โดยตรง

## Goal

เพิ่ม **dropdown user menu** ที่ header ของ `TreeView` เพื่อให้ผู้เข้าชม (ทั้ง demo และผู้ใช้จริง) มีทางกลับหน้าหลัก, login/logout, และไปหน้าต้นไม้ของตัวเอง

## Architecture

```
src/app/components/
  UserMenu.tsx          ← NEW: dropdown component
  index.ts              ← MODIFIED: export UserMenu

src/app/pages/
  TreeView.tsx          ← MODIFIED: render <UserMenu /> in header-actions

src/app/styles.css      ← MODIFIED (optional): add .user-menu-dropdown styles
                          if not achievable inline

tests/unit/
  UserMenu.test.tsx     ← NEW: source-level assertions

tests/e2e/
  11-user-menu.spec.ts  ← NEW: interaction tests via Playwright
```

### Component contract

```tsx
// UserMenu.tsx
export interface UserMenuProps {
  /** Optional className passthrough — caller can adjust position */
  className?: string;
}

export function UserMenu(props: UserMenuProps): JSX.Element | null;
```

- Reads session via `useSession()`
- Returns `null` while `loading` (no flicker)
- Renders trigger button + popover with menu items
- Self-managed open/close state
- Closes on: click-outside, Escape, item click

### Menu states

| State | Trigger label | Items |
|-------|---------------|-------|
| guest | 👤 (or "เข้าสู่ระบบ") | 🏠 หน้าหลัก · เข้าสู่ระบบ |
| authenticated | initial of displayName / "👤" | header: displayName + email · 🏠 หน้าหลัก · 🌳 ต้นไม้ของฉัน · ออกจากระบบ |
| loading | — | not rendered |

### Why dropdown, not inline buttons?

User picked Q2(a). Trade-off accepted: extra click to reach actions, but header stays uncluttered and we can grow items (settings, theme, etc.) without redesign.

## Test Specifications (TDD — write before code)

### Unit (source-level, vitest node env)

`tests/unit/UserMenu.test.tsx` must assert:

1. Imports `useSession` from `@app/hooks/useSession`
2. Imports `Link` from `react-router-dom`
3. Has a guest branch with `to="/login"` Link
4. Has an authenticated branch with `to="/trees"` Link
5. Both branches include `to="/"` (home) Link
6. Has a logout button calling `logout()` (regex match)
7. Has `aria-expanded` and `aria-haspopup` on trigger
8. Returns null when `loading` is true (regex: `if\s*\(\s*loading\s*\)\s*return\s+null`)

`tests/unit/TreeView-usermenu.test.tsx` (or extend existing TreeView test):

9. TreeView source imports `UserMenu` from `@app/components`
10. TreeView header renders `<UserMenu`

### E2E (Playwright)

`tests/e2e/11-user-menu.spec.ts`:

**M1 (guest on demo)**: visit `/demo/wongsuriya` → menu trigger visible → click → see "หน้าหลัก" + "เข้าสู่ระบบ" → click "หน้าหลัก" → URL is `/`

**M2 (guest login flow)**: visit `/demo/wongsuriya` → open menu → click "เข้าสู่ระบบ" → URL is `/login`

**M3 (auth on demo)**: signup+verify (helper) → visit `/demo/wongsuriya` → open menu → see displayName, "ต้นไม้ของฉัน", "ออกจากระบบ" → click "ต้นไม้ของฉัน" → URL is `/trees`

**M4 (logout from demo)**: while authenticated on `/demo/wongsuriya` → open menu → click logout → menu re-opens as guest state (or refresh proves session cleared)

**M5 (escape closes menu)**: open menu → press Escape → menu hidden

**M6 (click-outside closes menu)**: open menu → click on canvas → menu hidden

All tests assert `consoleMsgs.errors === []` and `warnings === []` (project convention).

## Implementation Steps (TDD order)

1. **Write tests first** (TASK-001, TASK-002) — they fail
2. **Implement `UserMenu.tsx`** (TASK-003) — unit tests pass
3. **Wire into TreeView** (TASK-004) — TreeView source-level test passes
4. **Run e2e** (TASK-005) — interaction tests pass
5. **Frontend smoke** (TASK-006) — manual browser check via dev server

## Parallelization

- TASK-001 (unit tests) & TASK-002 (e2e tests) can run in parallel — independent files
- TASK-003 (component impl) blocks TASK-004 (wiring)
- TASK-005 (run e2e) blocks until TASK-003 + TASK-004 done

## Security Considerations

- **Logout**: relies on `apiClient.logout()` which already clears the HttpOnly session cookie server-side (verified in 04-magic-link-login workstream). No new attack surface.
- **No PII in DOM**: displayName/email are already exposed to authenticated user themselves — showing in dropdown is fine.
- **No new endpoints** — pure client-side feature.
- **No XSS risk** — displayName is rendered as React text child (auto-escaped). No raw HTML injection APIs are used.

## Out of scope (explicit)

- Avatar image upload / display (just initial letter)
- Theme/language toggle in menu
- Notifications dropdown
- Mobile-specific menu (desktop-first; responsive can come later)
- Replacing Landing page CTAs with `<UserMenu />` (Landing already has its own session-aware UI; not changing)

## Acceptance Criteria

- [ ] All unit tests pass (`pnpm test:unit`)
- [ ] All e2e tests pass (`pnpm test:e2e`)
- [ ] No new console errors/warnings on `/demo/wongsuriya` and `/tree/:slug`
- [ ] Visual check: menu is reachable from demo, doesn't break existing header buttons
- [ ] POV button appears in ProfileDrawer; clicking switches `activeViewId` and updates ActiveViewPill + canvas labels
- [ ] No regression: existing TreeView tests still pass

---

# Feature 2 — POV from ProfileDrawer (amendment)

## Architecture

```
src/app/components/
  ProfileDrawer.tsx     ← MODIFIED: add 2 props + render POV button

src/app/pages/
  TreeView.tsx          ← MODIFIED: pass onSetActiveView + isActiveView

tests/unit/
  ProfileDrawer-pov.test.tsx   ← NEW: source-level assertions
  TreeView.test.tsx            ← MODIFIED: assert wiring of new props

tests/e2e/
  12-pov-from-drawer.spec.ts   ← NEW: click node → drawer → POV button → label flip
```

### ProfileDrawer prop additions

```tsx
export interface ProfileDrawerProps {
  // ... existing props
  /** Optional: switches the active POV in TreeCanvas to this person. */
  onSetActiveView?: (id: string) => void;
  /** True when this person is the current POV. */
  isActiveView?: boolean;
}
```

Both are optional → backward compatible (drawer still renders if caller doesn't wire them).

### Rendering rules (in `profile-ident` block, after profile-meta)

| State | Render |
|-------|--------|
| `onSetActiveView` not provided | nothing (drawer in legacy callsites unaffected) |
| `isActiveView === true` | readonly chip: "✓ กำลังดูจากมุมของคนนี้" |
| `isActiveView === false` | clickable button: "👁 ดูจากมุมของ {nick}" → calls `onSetActiveView(person.id)` |

Drawer **does not close** on click — user can flip POV multiple times while exploring.

## Test Specifications (Feature 2)

### Unit (source-level)

`tests/unit/ProfileDrawer-pov.test.tsx`:

1. ProfileDrawerProps interface includes `onSetActiveView` and `isActiveView`
2. Source has a button calling `onSetActiveView(person.id)` (regex)
3. Source has the readonly chip text "กำลังดูจากมุมของคนนี้"
4. Conditional render gated by `isActiveView` (regex: `isActiveView\s*\?`)

`tests/unit/TreeView.test.tsx` (extend existing):

5. TreeView source passes `onSetActiveView={setActiveViewId}` to ProfileDrawer
6. TreeView source passes `isActiveView={` … `=== activeViewId}` to ProfileDrawer

### E2E (Playwright)

`tests/e2e/12-pov-from-drawer.spec.ts`:

**P1 (POV switch from drawer)**: visit `/demo/wongsuriya` → click a non-me person node → drawer opens → click "ดูจากมุมของ …" → ActiveViewPill text reflects new POV → close drawer → labels on canvas show relations from new POV

**P2 (current POV is read-only chip)**: visit `/demo/wongsuriya` → wait for default `meId` POV → click "me" node → drawer shows "✓ กำลังดูจากมุมของคนนี้" (no clickable button)

**P3 (drawer stays open after click)**: open a node → click POV button → drawer remains visible (assert role=complementary or className="drawer" present)

All tests assert `consoleMsgs.errors === []` and `warnings === []`.

## Implementation Notes

- Use existing CSS class for the button: `header-btn` doesn't fit (drawer context). Use a small inline-styled button or add `.profile-pov-btn` to styles.css consistent with `.btn-secondary` already present in drawer.
- No need to track open/close state for this; it's a one-shot trigger.
- Accessibility: button gets `type="button"` and `title="ดูจากมุมของคนนี้"`.

## Security (Feature 2)

- No new endpoints, no PII leak (drawer already shows everything about the person to viewer).
- `activeViewId` is **client-side UI state only** — does not affect data access.
