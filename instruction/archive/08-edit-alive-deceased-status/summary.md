# Summary — Workstream 08: Edit alive/deceased status

> Completed: 2026-06-16 · Live on https://heritage.jairukchan.com/

## What shipped (commits on main)
- `c93d891` **feat(status)** — `people.deceased` boolean column (source of truth) + migration `0006`
  (adds column + backfills `deceased=1 WHERE died IS NOT NULL`); threaded through seed, tree-query,
  ApiTreeResponse/adaptTree, Person/LineageMember/LayoutPerson types.
- `7c3a542` **feat(api)** — `PATCH /api/tree/:slug/person/:personId` (owner-only, anti-enum 404,
  tree_id-scoped update, zod + born≤died≤currentYear, purgeTreeCache). Extracted `resolveOwnerTree`
  to `src/worker/lib/resolve-owner-tree.ts`.
- `6d8744a` **feat(ui)** — ProfileDrawer status control (role=switch toggle + death-year input
  committed on blur + "ทดลอง · ไม่บันทึก" note); TreeView `canEdit`/`statusOverrides`/`mergedPeople`
  (owner persists via `apiClient.setPersonStatus` with per-person revert on error; non-owner ephemeral);
  render sweep PersonNode/LineageNode/Sidebar/TreeView use `deceased`. + `setPersonStatus` client method.
- `746077d` **test(status)** + `3f410d0` **docs(work)**.

## 3 states
alive (deceased=false, died=null) · deceased+year (true, year) · deceased unknown (true, null).

## Proof
- typecheck 0 · 464/464 unit+integration · Opus security review 7/7 PASS · frontend-test (2 passes, live).
- CI 27589006412 · **prod D1 migrated (0006)** · Deploy 27589061536 · e2e vs prod 13/13.
- Live auth gate verified: PATCH person with no session → 401.

## Known gap (carried forward)
- Owner-persist path is integration-tested + reviewed but NOT browser-e2e'd (demo tree has
  `owner_id: null` → never owner-editable; no seeded owned-tree + login fixture). Add one to close it.
