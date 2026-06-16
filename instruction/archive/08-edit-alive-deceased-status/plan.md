# Plan: Edit alive/deceased status (persist for owners + ephemeral try-it)

> Created: 2026-06-16 · Workstream 08 · Approach: TDD, security-first, staged sub-agent team

## Architecture

```
DB people.deceased (NEW bool) + people.died (year, optional)
   │  source of truth: alive = !deceased ; year shown only if died != null
   ▼
tree-query.ts  → ApiTreeResponse.people[].deceased → adaptTree → Person.deceased
   → layout.ts (carry deceased) → PersonNode/Sidebar/LineageNode/TreeView/ProfileDrawer

Edit (owner):  ProfileDrawer toggle → TreeView.onSetStatus → apiClient.setPersonStatus
               (PATCH /api/tree/:slug/person/:id) → optimistic local update; revert on error
Edit (guest/non-owner): ProfileDrawer toggle → TreeView.onSetStatus → local statusOverrides only
```

## Contract (fixed so all layers agree)
- New column/field name: **`deceased`** (boolean). `died` stays the optional year.
- Endpoint: `PATCH /api/tree/:slug/person/:personId`, body `{ deceased: boolean, died: number|null }`,
  owner-only (401 if no session, **404** if not owner / person not in tree), returns `{ deceased, died }`.
  Rules: `!deceased ⇒ died=null`; `deceased && died!=null ⇒ born ≤ died ≤ currentYear`.
- Client: `apiClient.setPersonStatus(slug, personId, { deceased, died })`.
- UI testids: `status-toggle` (the alive/deceased control), `status-year-input` (year field, present when
  deceased), `status-ephemeral-note` (the "ไม่บันทึก" label for non-owners).
- alive/dead test everywhere = `person.deceased` (NOT `!person.died`). Year display stays `died`-based.

## Blast radius (switch alive/dead test from `died` → `deceased`)
PersonNode.tsx:39 · LineageNode.tsx:32 · Sidebar.tsx:55 · TreeView.tsx:101,208 · ProfileDrawer.tsx:147.
Plumbing (add `deceased`): schema.ts · tree-query.ts(:41,:214) · api.ts(:60,:278) · types.ts(:8 Person, :55
LineageMember) · layout.ts(:21/43/58) · seed.ts (set deceased = died!=null).

## Test Specifications (write/adjust FIRST)
### Unit (vitest)
- adaptTree maps `deceased` (api.test or new). Person/Layout carry it.
- Source/logic assertions: alive count uses `deceased`; ProfileDrawer chip logic (deceased w/ + w/o year).
- Endpoint validation helper (pure zod/consistency fn) unit-tested: rejects `deceased=false`+year,
  out-of-range year, born>died; accepts the 3 valid states.
### Integration (worker, tests/integration/*)
- `PATCH person`: 401 no session · 404 non-owner · 404 person-not-in-tree · 200 owner sets deceased+year ·
  200 owner sets deceased+null (unknown) · 200 back to alive (died forced null) · 422 invalid body ·
  cache purged (GET reflects change). Mirror existing tree-read/security-headers integration style.
### E2E (Playwright, vs prod after deploy)
- Demo/guest: open a person → toggle deceased → node shows "passed" + alive count drops, **reload ⇒ reverts**
  (ephemeral) · "ไม่บันทึก" note visible.
- Owner: (needs an owned test tree) toggle persists across reload. *(If no owner test-tree fixture exists,
  cover persistence via integration tests + a frontend-test login session; note the gap.)*
### frontend-test (MCP Playwright, local)
- Demo `/`: toggle a person alive↔deceased (with year, and unknown-year), verify canvas/sidebar/drawer update
  live, ephemeral note shown, zero console errors. Owner path if a local owned tree is seedable.

## Implementation Steps (staged — see groups)
1. **Schema + migration + seed** (foundational): add column; `drizzle-kit generate`; hand-add backfill
   `UPDATE people SET deceased=1 WHERE died IS NOT NULL`; set deceased in seed; `db:migrate:local`.
2. **Type/plumbing contract**: add `deceased` to tree-query, ApiTreeResponse+adaptTree, types(Person,
   LineageMember), layout. (Additive; safe in parallel once field name fixed.)
3. **Worker endpoint**: extract `resolveOwnerTree` → `lib/resolve-owner-tree.ts`; new `routes/people.ts`
   PATCH; mount under `/api/tree`. + validation helper.
4. **Render sweep**: switch alive/dead test to `deceased` in the 6 sites; ProfileDrawer chip handles
   deceased-with/without-year.
5. **Edit UI + modes**: ProfileDrawer status control (toggle + year input + ephemeral note); TreeView
   `canEdit` + `statusOverrides` + `onSetStatus` (owner persist / non-owner local); merge overrides into
   displayed people.
6. **Client method** `setPersonStatus` + drop stale "read-only" comment.
7. Integrate: `db:migrate:local` → typecheck → unit → integration → build → frontend-test → e2e(local).
8. Adversarial review (Opus) + verification-before-completion.
9. Ship: commit → push → CI → **migrate prod D1 (db:migrate:remote) FIRST** → deploy → e2e vs prod.

## Security Considerations
- Re-introduces a write endpoint (previously removed). Harden: owner-only (404 anti-enum), tree_id-scoped
  update, session+origin-check middleware (inherited), zod + range validation, cache purge. Optional light
  rate-limit. No new data exposure (status was already visible).

## Parallel execution groups
- **Phase 1 (foundational, mostly sequential):** TASK-001 schema+migration+seed (blocks migrate/tests).
  In parallel with it: TASK-002 type/plumbing contract (additive — safe; field name fixed by Contract).
- **Phase 2 (parallel — disjoint files):** TASK-003 worker endpoint + lib + integration tests ·
  TASK-004 render sweep · TASK-005 edit UI + TreeView modes + client method · TASK-006 tests
  (unit/e2e specs to the Contract).
- **Phase 3 (sequential):** TASK-007 integrate + migrate-local + full verify + review + ship (incl. prod
  migration ordering).
```

## File Lock plan (Phase 2 disjoint)
- TASK-003: src/worker/routes/people.ts(new), src/worker/index.ts(mount), src/worker/lib/resolve-owner-tree.ts(new), tests/integration/person-status.test.ts(new)
- TASK-004: src/app/components/PersonNode.tsx, LineageNode.tsx, Sidebar.tsx (+ TreeView/ProfileDrawer coordinate with TASK-005 — see todos lock notes)
- TASK-005: src/app/pages/TreeView.tsx, src/app/components/ProfileDrawer.tsx, src/app/lib/api.ts
- Shared earlier: schema.ts, tree-query.ts, types.ts, layout.ts, seed.ts (Phase 1)
