# Active Tasks

> Last updated: 2026-06-13 (resume session — verification phase)
> Workstream: 05-treeview-improvements
> Plan: `instruction/work/plan.md` · Requirements: `instruction/work/requirements.md`

## Resume note (2026-06-13)

Code for all features is **implemented + committed** (`317dd15`). Resuming to finish
verification (TASK-005 e2e, TASK-006 smoke).

- ✅ **Environment restored**: `pnpm install` done. Re-verified in this environment:
  **unit 415/415 pass** (43 files) + **typecheck clean** (`tsc --noEmit` exit 0).
  → TASK-003/004/008/009 logic confirmed sound; only browser-behavior (e2e/smoke) left.
- **Local-e2e feasibility** (investigated): 7/9 NEW specs are guest-only and CAN run
  against a seeded local dev server (no prod deploy needed): M1/M2/M5/M6 + P1/P2/P3.
  The 2 auth-gated specs (M3, M4) call `signupAndVerifyViaBackchannel`, which uses
  `tests/e2e/helpers/d1.ts:26` — **hardcoded `--remote`** wrangler flag → won't hit
  local D1. Needs a 1-line env-gated `--local` fix to run M3/M4 locally.
- Full-suite verification against prod still needs a **deploy** (outward-facing →
  requires explicit user confirmation before doing it).

## ✅ Local e2e verification result (2026-06-13)

Ran the 2 NEW specs against a seeded local dev server (`E2E_LOCAL_DB=1
E2E_BASE_URL=http://localhost:5173`): **9/9 pass** (M1–M6 + P1–P3), zero console
errors/warnings, teardown clean. → TASK-003/004/008/009 are now **behaviorally
verified** (browser-level), not just unit-green.

### 🐞 Bugs found & fixed during verification (all root-cause, not masked)

1. **CSS stacking trap** (`src/app/styles.css` `.app-header` z-index 3→11) —
   the UserMenu dropdown was trapped in the header's stacking context (z-index 3),
   rendering *behind* the open ProfileDrawer (z-index 10). Menu items were
   unclickable whenever the drawer was open (which is the demo's default state).
   **Real product bug**, caught by M1's 60s click-interception timeout.
2. **displayName never reached the client** — session middleware
   (`src/worker/middleware/session.ts`) projected only `id/email/email_verified_at`;
   `display_name` was stored on signup but dropped on read. Added `displayName` to
   the session user + all 4 user responses (`/me`, verify, login, reset) +
   `HonoEnv.Variables.user` type. Also affected `Trees.tsx` (same consumer).
   Updated 11 test-mock sites accordingly. M3 now shows the name.
3. **Windows dev-tooling bugs** (`scripts/seed-demo.ts`): `URL.pathname` →
   `fileURLToPath` (doubled-drive `C:\C:\` path), and `execFileSync('pnpm')` →
   `shell:true` (Node 25 won't execFile `.cmd`). Seed now works on Windows.
4. **e2e D1 backchannel** (`tests/e2e/helpers/d1.ts`): was hardcoded `--remote`
   (would mutate PROD on any local run via teardown/signup). Now `E2E_LOCAL_DB=1`
   → `--local`, and spawns wrangler via `node` directly (no `pnpm.cmd` shim).

Known dormant (out of scope, noted): client types declare `emailVerified: boolean`
but server sends `email_verified_at`; no client code reads `.emailVerified`, so it's
inert. Flag for a future contract-cleanup pass.

Re-verified after all fixes: **unit 415/415 pass**, **typecheck clean**, **e2e 11+12 9/9 pass**.

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
- Status: ✅ tested (8/8 unit + M1–M6 e2e pass locally; CSS z-index bug fixed)
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
- Status: ✅ tested (unit 415/415 + M1–M6 e2e pass locally)
- Assigned: Main agent (Opus 4.6)
- Completed: 2026-05-02 16:24
- Dependencies: TASK-003 ✅
- Files: `src/app/pages/TreeView.tsx`
- Sub-tasks:
  - [ ] Import `UserMenu` from `@app/components`
  - [ ] Render inside `<div className="header-actions">` (rightmost slot, after ⚙)
  - [ ] Verify existing header tests still pass (`pnpm test:unit`)

### TASK-005: Run full e2e suite
- Status: ✅ tested — full PROD run: **29 pass / 1 fail / 2 skip**; only failure is pre-existing M4-T3 (magic-link). S5+S18 (local-only env failures) PASS on prod. All 9 new specs pass on prod. No regressions.
- Local full-suite (E2E_LOCAL_DB=1, localhost:5173): **27 passed / 3 failed / 2 skipped**
  - ❌ `03-verify S5` — verify token rejected as "expired/used" locally (local-D1 token-flow env quirk; NOT my change — verify logic untouched, 415 integration tests pass)
  - ❌ `09-security S18` — matching-Origin POST got 403 (CSRF/Origin config sensitive to localhost origin; NOT my change — CSRF middleware untouched)
  - ❌ `10-magic-link M4-T3` — **pre-existing/documented** (console-error from mocked 400; commit 41052d6)
  - ✅ All feature/tree/search/pathfinder/POV/share specs pass → no regression from CSS/displayName/d1 edits
- Remaining for full closure: run against deployed prod/staging (specs' intended env) → needs **deploy** (user decision)
- 2026-06-13: **deployed to prod** (5 commits pushed to main; `Deploy` workflow run 27469049994 ✅ install→build→wrangler deploy). Re-running full e2e against prod now.
- ⚠️ CI (`ci.yml`) is RED on a **pre-existing** `pnpm audit --prod` failure (HIGH: react-router 7.14.2 DoS, patched ≥7.15.0, GHSA-8x6r-g9mw-2r78; + moderate hono). NOT from this workstream (no dep changes). Already present in prod. Separate dependency-update track (Dependabot PRs exist).
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
- Status: ✅ tested — e2e M1–M6 + P1–P3 exercise every smoke item AND assert zero console errors/warnings, all green against PROD. Automated coverage supersedes the manual eyeball.
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
- Status: ✅ tested (5/5 unit + P1–P3 e2e pass locally)
- Assigned: Agent H (Sonnet 4.6)
- Completed: 2026-05-02 16:15
- Dependencies: TASK-007 ✅
- Files: `src/app/components/ProfileDrawer.tsx`, `src/app/styles.css` (optional `.profile-pov-btn`)
- Sub-tasks:
  - [ ] Extend `ProfileDrawerProps` with `onSetActiveView?` and `isActiveView?`
  - [ ] Render conditional button/chip in `profile-ident` after `profile-meta`
  - [ ] Run unit tests — pass

### TASK-009: Wire POV props in TreeView
- Status: ✅ tested (2/2 unit + P1–P3 e2e pass locally)
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

---

## RESUME CONTEXT

> Exit time: 2026-06-13 22:32 (+07) — /workflow-exit
> Reason: user requested save/stop

### Session state: ✅ WORK COMPLETE — nothing in flight

No sub-agents running · no file locks · **git tree clean** · `main` synced with
origin at `bcd585d` · all GitHub Actions green · no dev server running.

#### Shipped this session (all deployed + prod-verified)
- **4 bug fixes** (commits `c02ffaf..36d7008`, Deploy run 27469049994):
  UserMenu z-index stacking · displayName propagation (session+responses+type) ·
  Windows seed tooling (`seed-demo.ts`) · e2e local-D1 backchannel (`E2E_LOCAL_DB`)
- **Security bump** (commit `bcd585d`, Deploy run 27470955543, CI green):
  react-router-dom 7.14.2→7.17.0 (HIGH DoS) + hono 4.12.14→4.12.25 (8 moderate);
  `pnpm audit --prod` clean; prod smoke 200/200/401
- **Verified**: unit 415/415 · typecheck clean · e2e 9/9 (local + prod) · MCP frontend-test clean

#### Nothing to resume. ONE optional next step:
- **workflow-end** → security review + archive `05-treeview-improvements` to
  `instruction/archive/`. (Run `/workflow-end` or say "จบงาน" next session.)

#### Known / out-of-scope (not blockers):
- `10-magic-link M4-T3` e2e — pre-existing console-error assertion (workstream 04), separate triage
- GitHub Actions still on Node.js 20 (deprecation; forced to Node 24 after 2026-06-16) — infra upkeep
