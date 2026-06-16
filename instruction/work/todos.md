# Active Tasks

> Last updated: 2026-06-16 (planning)
> Workstream: 08-edit-alive-deceased-status
> Plan: `instruction/work/plan.md` · Requirements: `instruction/work/requirements.md`
> Status: ⏳ AWAITING APPROVAL — say "ลุย"/"approved" to start workflow-work

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

## File Lock Registry
| File | Locked by | Task | Since |
|------|-----------|------|-------|
| _(none — not started)_ | | | |

---

## RESUME CONTEXT
> Planning complete; awaiting approval. Phase 1: TASK-001 (schema/migration) + TASK-002 (plumbing).
> Phase 2 parallel: TASK-003 endpoint · TASK-004 render sweep · TASK-005 edit UI · TASK-006 tests.
> Phase 3: integrate + migrate-local + verify + ship (prod migrate BEFORE deploy — needs CF creds).
