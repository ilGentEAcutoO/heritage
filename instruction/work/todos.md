# Active Tasks

> Last updated: 2026-05-02 16:30 (+07)
> Workstream: 05-treeview-improvements
> Plan: `instruction/work/plan.md` · Requirements: `instruction/work/requirements.md`

---

## Main Tasks

### TASK-001: Write unit test (source-level) for UserMenu
- Status: ✅ tested (TDD: fails with ENOENT as expected)
- Assigned: Agent A (Sonnet 4.6)
- Completed: 2026-05-02 16:11
- Notes: 8 assertions written. Use `pnpm test` (not `test:unit`).
- Parallel-safe with: TASK-002
- Files: `tests/unit/UserMenu.test.tsx`
- Sub-tasks:
  - [ ] Create test file with file-read pattern (mirror `tests/unit/TreeView.test.tsx`)
  - [ ] Add 8 assertions per plan §"Unit (source-level)"
  - [ ] Run `pnpm test:unit` — confirm test fails (file not yet created)

### TASK-002: Write e2e test for UserMenu interactions
- Status: ✅ tested (TDD: fails — element not found, expected)
- Assigned: Agent B (Sonnet 4.6)
- Completed: 2026-05-02 16:11
- Notes: 6 cases (M1–M6). Test IDs required by impl: `user-menu-trigger`, `user-menu`, `user-menu-item-{home,login,trees,logout}`
- Parallel-safe with: TASK-001
- Files: `tests/e2e/11-user-menu.spec.ts`
- Sub-tasks:
  - [ ] Create spec with M1–M6 cases per plan §"E2E (Playwright)"
  - [ ] Use `signupAndVerifyViaBackchannel` helper from `tests/e2e/helpers/signup`
  - [ ] Use `attachConsoleCapture` helper from `tests/e2e/helpers/console`
  - [ ] Run `pnpm test:e2e -g "user-menu"` — confirm tests fail

### TASK-003: Implement UserMenu component
- Status: 🟢 implemented (8/8 unit pass; e2e pending TASK-004)
- Assigned: Agent C (Sonnet 4.6)
- Completed: 2026-05-02 16:15
- Dependencies: TASK-001 ✅
- Files: src/app/components/UserMenu.tsx (196 LOC), index.ts updated
- Files: `src/app/components/UserMenu.tsx`, `src/app/components/index.ts`, `src/app/styles.css` (optional)
- Sub-tasks:
  - [ ] Create `UserMenu.tsx` with dropdown logic (open state, click-outside, Escape)
  - [ ] Render guest / authenticated / loading branches per plan §"Menu states"
  - [ ] Use `header-btn` class for trigger; inline styles or new CSS class for popover
  - [ ] Add `aria-expanded`, `aria-haspopup="menu"`, `role="menu"`
  - [ ] Export from `src/app/components/index.ts`
  - [ ] Run `pnpm test:unit -t "UserMenu"` — pass

### TASK-004: Wire UserMenu into TreeView header
- Status: 🟢 implemented (full unit suite 415/415 pass)
- Assigned: Main agent (Opus 4.6)
- Completed: 2026-05-02 16:24
- Dependencies: TASK-003 ✅
- Files: `src/app/pages/TreeView.tsx`
- Sub-tasks:
  - [ ] Import `UserMenu` from `@app/components`
  - [ ] Render inside `<div className="header-actions">` (rightmost slot, after ⚙)
  - [ ] Verify existing header tests still pass (`pnpm test:unit`)

### TASK-005: Run full e2e suite
- Status: 🟡 blocked — e2e targets prod URL; needs deploy or staging override
- Assigned: Agent D (Sonnet 4.6)
- Last run: 2026-05-02 16:28 — 20 pass / 5 fail / 7 skip
- Dependencies: TASK-003 ✅, TASK-004 ✅, TASK-008 ✅, TASK-009 ✅
- Findings:
  - `E2E_BASE_URL` default = `https://heritage.jairukchan.com` (per playwright.config.ts comment)
  - All 8 failures in 11/12 specs trace to one cause: prod doesn't have new code yet
  - Unit suite is green (415/415) — code logic verified
  - Pre-existing unrelated failure: `10-magic-link.spec.ts:175` (M4-T3 console-error from mocked 400 response). Commit `41052d6`. Flag for separate triage.
- User decision needed: (a) deploy → re-run e2e, (b) run against localhost dev server with `E2E_BASE_URL=...`, (c) defer e2e until deploy
- Sub-tasks:
  - [ ] `pnpm test:e2e` — all specs pass (no regressions in 01–10)
  - [ ] If any failure → triage; fix root cause (do not edit tests to mask)

### TASK-006: Frontend smoke (manual) — both features
- Status: ⚪ pending
- Assigned: -
- Dependencies: TASK-005, TASK-009
- Sub-tasks:
  - [ ] `pnpm dev` → open `/demo/wongsuriya` in browser
  - [ ] **UserMenu**: toggle menu, navigate to `/`, navigate to `/login`
  - [ ] **UserMenu**: login → revisit `/demo/wongsuriya` → confirm auth state in menu
  - [ ] **UserMenu**: logout from menu → confirm guest state restored
  - [ ] **POV**: click non-me person node → drawer → click POV button → ActiveViewPill text changes + canvas labels flip
  - [ ] **POV**: click "me" node → drawer shows readonly chip
  - [ ] Inspect DevTools console → no new errors/warnings

---

## Feature 2 — POV from ProfileDrawer

### TASK-007: Write tests for POV button in ProfileDrawer
- Status: ✅ tested (TDD: fails — props/button missing, expected)
- Assigned: Agent G (Sonnet 4.6)
- Completed: 2026-05-02 16:12
- Notes: ProfileDrawer-pov.test.tsx (5 assertions) + TreeView.test.tsx appended (2 assertions) + 12-pov-from-drawer.spec.ts (P1-P3). Test IDs required by impl: `data-testid="profile-pov-button"`. PersonNode already has `data-person="<id>"` — selector ready.
- Parallel-safe with: TASK-001, TASK-002
- Files: `tests/unit/ProfileDrawer-pov.test.tsx`, `tests/e2e/12-pov-from-drawer.spec.ts`
- Sub-tasks:
  - [ ] Create unit test with 4 source-level assertions per plan §"Unit (source-level)" (Feature 2)
  - [ ] Add 2 assertions to existing `tests/unit/TreeView.test.tsx` for prop wiring
  - [ ] Create e2e spec with P1–P3 cases per plan §"E2E (Playwright)" (Feature 2)
  - [ ] Run tests — confirm they fail (props not yet added)

### TASK-008: Add POV props + button to ProfileDrawer
- Status: 🟢 implemented (5/5 unit pass; e2e pending TASK-009)
- Assigned: Agent H (Sonnet 4.6)
- Completed: 2026-05-02 16:15
- Dependencies: TASK-007 ✅
- Files: `src/app/components/ProfileDrawer.tsx`, `src/app/styles.css` (optional `.profile-pov-btn`)
- Sub-tasks:
  - [ ] Extend `ProfileDrawerProps` with `onSetActiveView?` and `isActiveView?`
  - [ ] Render conditional button/chip in `profile-ident` after `profile-meta`
  - [ ] Run unit tests — pass

### TASK-009: Wire POV props in TreeView
- Status: 🟢 implemented (POV-drawer wiring 2/2 pass)
- Assigned: Main agent (Opus 4.6)
- Completed: 2026-05-02 16:24
- Dependencies: TASK-008 ✅
- Files: `src/app/pages/TreeView.tsx`
- Sub-tasks:
  - [ ] Pass `onSetActiveView={setActiveViewId}` to `<ProfileDrawer>`
  - [ ] Pass `isActiveView={selected.id === activeViewId}` to `<ProfileDrawer>`
  - [ ] Run e2e test 12 — pass

---

## File Lock Registry

| File | Locked by | Task | Since |
|------|-----------|------|-------|
| _(none)_ | | | |

---

## Suggested Sub-Agent Layout (when /workflow-work)

**Wave 1 — write tests in parallel (3 agents)**
- **Agent A (Sonnet 4.6)** → TASK-001 (UserMenu unit test)
- **Agent B (Sonnet 4.6)** → TASK-002 (UserMenu e2e)
- **Agent G (Sonnet 4.6)** → TASK-007 (POV tests, both unit + e2e)

**Wave 2 — implement components in parallel (2 agents)**
- **Agent C (Sonnet 4.6)** → TASK-003 (UserMenu impl) — depends on A
- **Agent H (Sonnet 4.6)** → TASK-008 (ProfileDrawer POV impl) — depends on G

**Wave 3 — wire into TreeView (sequential, single file)**
- **Main agent (Opus 4.6)** → TASK-004 + TASK-009 — both edit `TreeView.tsx`, must be serial to avoid file-lock conflict

**Wave 4 — verification**
- **Agent D (Sonnet 4.6)** → TASK-005 (run full e2e)
- **Main agent (Opus 4.6)** → TASK-006 (manual smoke for both features)

### File-lock note
TASK-004 และ TASK-009 ทั้งคู่แก้ `src/app/pages/TreeView.tsx` — **ห้ามรัน parallel** main agent ทำเองทั้งสอง task ติดกันใน wave 3
