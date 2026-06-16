# Active Tasks

> Last updated: 2026-06-16 (workflow-work — COMPLETE, deployed, e2e green live)
> Workstream: 07-anon-homepage-demo-tree
> Plan: `instruction/work/plan.md` · Requirements: `instruction/work/requirements.md`
> Status: ✅ COMPLETE — shipped to main, deployed to prod, 10/10 e2e green against prod

## Main Tasks

### TASK-001: Root route `/` → Home (guest=demo tree, auth=Landing)
- Status: ✅ tested (live e2e S1/S1b green: guest `/` renders tree in place, logged-in `/` = splash)
- Files: `src/app/pages/Home.tsx` (new), `src/app/App.tsx`
- Detail: New `Home.tsx` gates on `useSession()` — loading→neutral placeholder, user→`<Landing/>`,
  guest→`<TreeView treeSlug="wongsuriya" />`. App.tsx: `/` element `<Landing/>`→`<Home/>`.
- Parallel-safe with: TASK-002, TASK-003, TASK-004 (disjoint files)
- Sub-tasks:
  - [ ] Create Home.tsx with session gate (fail-open to guest on non-401 error)
  - [ ] Swap `/` route element in App.tsx to `<Home/>`
  - [ ] typecheck passes

### TASK-002: TreeView header — guest login button replaces 👤
- Status: ✅ tested (live e2e M1/M2 green: header-login top-right →/login; no guest user-menu-trigger)
- Files: `src/app/pages/TreeView.tsx`
- Detail: In `.header-actions`, render `!loading && !user` → `<Link to="/login"
  data-testid="header-login">เข้าสู่ระบบ</Link>` (prominent CTA, reuse header styles);
  `user` → keep `<UserMenu/>`; `loading` → nothing. Applies to /, /demo/wongsuriya, /tree/:slug.
- Parallel-safe with: TASK-001, TASK-003, TASK-004
- Sub-tasks:
  - [ ] Conditional guest login `<Link>` (testid `header-login`, name "เข้าสู่ระบบ", href /login)
  - [ ] Keep `<UserMenu/>` for auth; render nothing while loading
  - [ ] Style as a clear top-right CTA; typecheck passes

### TASK-003: Simplify Landing.tsx (remove dead guest branch)
- Status: ✅ tested (guest CTAs removed; logged-in splash + logout-button kept — live S1b/S9 green)
- Files: `src/app/pages/Landing.tsx`
- Detail: Landing now only renders for logged-in users (Home guarantees `user`). Remove the
  `!user` guest CTAs ("ดู demo tree" + "เข้าสู่ระบบ →"); keep logo/title/tagline +
  "ดูต้นไม้ของฉัน" (→/trees) + `logout-button`.
- Parallel-safe with: TASK-001, TASK-002, TASK-004
- Sub-tasks:
  - [ ] Remove guest branch; keep logged-in UI + `data-testid="logout-button"`
  - [ ] typecheck passes

### TASK-004: Tests first — rewrite/extend to the Contract
- Status: ✅ tested (unit 425/425; e2e rewritten + run vs prod 10/10 green)
- Files: `tests/e2e/01-landing.spec.ts`, `tests/e2e/11-user-menu.spec.ts`,
  `tests/unit/TreeView.test.tsx`, `tests/unit/Home.test.tsx` (new)
- Detail: See plan.md "Test Specifications". Write FIRST; must fail before TASK-001..003 land.
- Parallel-safe with: TASK-001, TASK-002, TASK-003 (test files disjoint from src)
- Sub-tasks:
  - [ ] 01-landing: REWRITE S1 (guest=tree+header-login), NEW S1b (auth=splash), keep S2
  - [ ] 11-user-menu: M1/M2 rewrite (guest button), M4 update, M5/M6 → authenticated, M3 keep
  - [ ] TreeView.test.tsx: add header-login source assertions (keep existing green)
  - [ ] Home.test.tsx: new source assertions
  - [ ] Confirm `05-logout.spec.ts` S9 stays green (regression guard, no edit expected)

### TASK-005: Integrate + verify + ship
- Status: ✅ tested (typecheck/unit/review/frontend-test/CI/deploy/e2e all green)
- Dependencies: TASK-001..004
- Sub-tasks:
  - [x] `pnpm typecheck` (exit 0) + `pnpm test` unit 425/425 green
  - [x] Adversarial review (Opus workflow verify): VERDICT PASS, 14/14 contract checks, 0 blockers
  - [x] frontend-test (MCP Playwright) guest `/` + `/demo/wongsuriya`: tree renders, login button
        top-right, no 404-flash, only whitelisted /me 401 noise. Logged-in `/` covered by
        unit (Home.test) + e2e S1b/05-logout (post-deploy), branch is trivial.
  - [x] git-commit (3 commits: feat/test/docs, no AI signature) + git-push + CI green
        (run 27585595350, 34s, node24, typecheck+unit 425+audit+guards)
  - [x] Deploy to prod (Deploy workflow run 27585796678, 25s — wrangler-action@v4 + node24 live)
  - [x] `pnpm e2e` vs PROD: 10/10 green (S1/S1b/S2, S9, M1-M6) — guest + logged-in paths verified live
- TASK-005 status: ✅ tested
- Extra fix this workstream: `src/app/hooks/useTree.ts` — init `loading=Boolean(slug)` so the
  homepage never flashes the "ต้นไม้ไม่พบ" 404 branch on first paint (also improves /demo).

## File Lock Registry

| File | Locked by | Task | Since |
|------|-----------|------|-------|
| _(all released — Group A complete)_ | | | |

---

## RESUME CONTEXT
> 2026-06-16 — ✅ WORKSTREAM 07 COMPLETE. Feature live on https://heritage.jairukchan.com/.
> Shipped commits: 49b2180 feat(home) · af83936 test · d302d41 docs(work).
> Verified end-to-end: typecheck 0 · unit 425/425 · Opus adversarial review PASS (14/14) ·
>   frontend-test guest `/` · CI green (27585595350) · Deploy green (27585796678) ·
>   e2e vs PROD 10/10 (guest S1/M1/M2 + logged-in S1b/M3/M4 + S9 regression guard).
> Behavior live: guest `/` = Wongsuriya demo tree in place + green "เข้าสู่ระบบ" top-right;
>   logged-in `/` = splash kept. Bonus: useTree no longer flashes 404 on first paint.
> Ready to archive via workflow-end. Open (separate): Dependabot advisories (1 high, 1 low).
