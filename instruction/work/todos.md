# Active Tasks

> Last updated: 2026-06-16 (planning)
> Workstream: 08-edit-alive-deceased-status
> Plan: `instruction/work/plan.md` · Requirements: `instruction/work/requirements.md`
> Status: ✅ COMPLETE — shipped to prod, prod D1 migrated, 13/13 e2e green vs prod
> All tasks tested. typecheck 0 · 464/464 unit+integration · build green · frontend-test (live) · CI green · prod migrated · deployed · e2e vs prod 13/13.

## Main Tasks

### TASK-001: Schema + migration + seed (foundational)
- Status: ⚪ pending
- Files: src/db/schema.ts, drizzle/<new migration>.sql, src/worker/lib/seed.ts
- Sub-tasks:
  - [ ] Add `people.deceased integer({mode:'boolean'}) NOT NULL DEFAULT 0`
  - [ ] `pnpm db:generate`; hand-add backfill `UPDATE people SET deceased=1 WHERE died IS NOT NULL`
  - [ ] seed.ts: set `deceased: died != null` for all seed people (+ lineage members derive same)
  - [ ] `pnpm db:migrate:local` applied
- Blocks: TASK-007 verify (migrate-local before integration/e2e)

### TASK-002: Type/plumbing contract — carry `deceased`
- Status: ⚪ pending
- Files: src/worker/lib/tree-query.ts, src/app/lib/api.ts(types+adaptTree only), src/app/lib/types.ts, src/app/lib/layout.ts
- NOTE: api.ts also edited by TASK-005 (client method) → TASK-002 does TYPES+adaptTree, TASK-005 does the
  `setPersonStatus` method + comment. Coordinate: TASK-002 runs in Phase 1, TASK-005 in Phase 2 (sequential on api.ts).
- Sub-tasks:
  - [ ] tree-query: select + map `deceased`
  - [ ] api.ts: ApiTreeResponse.people add `deceased`; adaptTree map it
  - [ ] types.ts: Person.deceased + LineageMember.deceased
  - [ ] layout.ts: carry `deceased` through layout person type/mapping

### TASK-003: Worker endpoint (PATCH person status) — owner only
- Status: ⚪ pending
- Files: src/worker/routes/people.ts(new), src/worker/index.ts(mount), src/worker/lib/resolve-owner-tree.ts(new, extracted from shares.ts), tests/integration/person-status.test.ts(new)
- Dependencies: TASK-001 (deceased column)
- Sub-tasks:
  - [ ] Extract `resolveOwnerTree` → lib (reuse in shares.ts + people.ts)
  - [ ] PATCH `/:slug/person/:personId`: 401/404 anti-enum, fetch person scoped to tree_id (404), zod
        `{deceased, died}`, consistency+range rules, `db.update`, `purgeTreeCache`, return `{deceased,died}`
  - [ ] Mount router under /api/tree in worker index
  - [ ] Integration tests (auth/ownership/validation/cache) green

### TASK-004: Render sweep — alive/dead test → `deceased`
- Status: ⚪ pending
- Files: src/app/components/PersonNode.tsx, src/app/components/LineageNode.tsx, src/app/components/Sidebar.tsx
- Dependencies: TASK-002 (Person.deceased type)
- Sub-tasks:
  - [ ] PersonNode `alive = !person.deceased`; LineageNode `passed` from deceased; Sidebar item class from deceased
  - [ ] Year display stays `died`-based (show year only if present)

### TASK-005: Edit UI + modes + client method
- Status: ⚪ pending
- Files: src/app/pages/TreeView.tsx, src/app/components/ProfileDrawer.tsx, src/app/lib/api.ts(method)
- Dependencies: TASK-002 (types), TASK-003 (endpoint contract)
- Sub-tasks:
  - [ ] ProfileDrawer: status control (`status-toggle` + `status-year-input` when deceased + `status-ephemeral-note`); chip → deceased(+optional year)
  - [ ] TreeView: alive count → deceased; `canEdit = !!user && user.id===meta.ownerId`; `statusOverrides` state; `onSetStatus` (owner→API+optimistic; non-owner→local); merge overrides into displayed people
  - [ ] api.ts: `setPersonStatus(slug, personId, {deceased, died})`; drop stale "read-only" comment

### TASK-006: Tests (unit + e2e specs to Contract)
- Status: ⚪ pending
- Files: tests/unit/* (adaptTree/deceased), tests/e2e/<new status spec>.ts
- Sub-tasks:
  - [ ] unit: adaptTree carries deceased; validation helper; alive-count uses deceased
  - [ ] e2e: demo ephemeral toggle reverts on reload + "ไม่บันทึก" note; owner persists (or note gap)

### TASK-007: Integrate + verify + ship
- Status: ⚪ pending
- Dependencies: TASK-001..006
- Sub-tasks:
  - [ ] db:migrate:local → typecheck → unit → integration → build → frontend-test (demo toggle) → e2e local
  - [ ] Adversarial review (Opus) + verification-before-completion
  - [ ] commit (no AI sig) + push + CI
  - [ ] **migrate prod D1 FIRST** (db:migrate:remote — needs CF creds) → deploy → e2e vs prod

## File Lock Registry (Phase 2 — dispatched 2026-06-16)
| File | Locked by | Task | Since |
|------|-----------|------|-------|
| src/worker/routes/people.ts (new), resolve-owner-tree.ts (new), index.ts, shares.ts, tests/integration/person-status.test.ts | agent:endpoint | TASK-003 | 2026-06-16 |
| src/app/components/PersonNode.tsx, LineageNode.tsx, Sidebar.tsx | agent:render-sweep | TASK-004 | 2026-06-16 |
| src/app/pages/TreeView.tsx, ProfileDrawer.tsx, src/app/lib/api.ts | agent:edit-ui | TASK-005 | 2026-06-16 |
| _(all released — workstream complete)_ | | | |

> ALL TASKS ✅ tested. TASK-001 schema+migration+seed · TASK-002 plumbing · TASK-003 endpoint ·
> TASK-004 render sweep · TASK-005 edit UI+modes · TASK-006 tests · TASK-007 integrate+ship.
> Coordinator fixes after Phase-2 review: 2 brittle source-regexes in status-validation.test.ts;
> added role=switch+aria-checked to the toggle (a11y + e2e SE4); year input commits on blur (not
> per keystroke) to avoid owner-path PATCH spam.

---

## RESUME CONTEXT
> 2026-06-16 — ✅ WORKSTREAM 08 COMPLETE. Live on https://heritage.jairukchan.com/.
> Shipped commits: c93d891 feat(status) foundation · 7c3a542 feat(api) endpoint ·
>   6d8744a feat(ui) edit UI+sweep · 746077d test(status).
> Behavior live: owners persist alive/deceased edits (PATCH /api/tree/:slug/person/:id, owner-only,
>   tree_id-scoped, zod+range, cache-purged); non-owners get an ephemeral toggle ("ทดลอง · ไม่บันทึก");
>   3 states (alive / deceased+year / deceased unknown-year). deceased boolean = source of truth.
> Verified: typecheck 0 · 464/464 unit+integration · Opus security review (7/7 security PASS) ·
>   frontend-test live (guest ephemeral toggle + revert) · CI 27589006412 · prod D1 migrated (0006) ·
>   Deploy 27589061536 · e2e vs prod 13/13 (13-status-edit SE1-4 + 01-landing + 11-user-menu regression).
> Owner-persist path covered by integration tests + review (no live owned-tree session to e2e).
> Ready to archive via workflow-end.
