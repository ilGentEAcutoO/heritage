# Requirements — Workstream 08: Edit alive/deceased status (persist for owners + ephemeral try-it)

> Created: 2026-06-16 · Status: PLANNING (awaiting approval)

## Raw request (user, 2026-06-16, Thai)
> ปกติเราเปลี่ยนสถานะ ว่ายังอยู่หรือเสียแล้วที่ไหน · ใน demo พอทำได้ไหม
Follow-up decision: **ทั้งสอง** — demo/non-owner = ephemeral try-it (not saved); tree owner = real persisted edit.

## Research findings (current state)
- "Status" = `people.died` (nullable integer **year**); `null` = alive today. No edit UI/endpoint exists.
- `api.ts` header literally says *"Read-only API client. Mutations have been removed"* — content editing
  was removed in a prior security remediation (`archive/02-security-remediation-login-removal`). Re-adding a
  write path **reverses a hardening decision** → must be locked down.
- Clean mutation template exists: `PATCH /api/tree/:slug/visibility` in `shares.ts` —
  `resolveOwnerTree` (401 / 404 anti-enumeration), parse→validate, `db.update`, `purgeTreeCache`.
- DB: `people.died integer` nullable; update scoped by `(id, tree_id)`.
- Alive/dead is inferred from `died` in 6 render sites (see plan "Blast radius").
- Data pipeline for a person field: D1 → `tree-query.ts` → API (`ApiTreeResponse`) → `adaptTree` →
  `TreeData.people` (`Person`) → `layout.ts` → `PersonNode`/components.

## Agreed scope (from Q&A 2026-06-16)
- [x] **Owner** of a tree can toggle a person alive↔deceased; change **persists** (D1) via a new endpoint.
- [x] **Non-owner** (guest on demo, or anyone viewing a tree they don't own) gets an **ephemeral** toggle
      (local React state only, NOT saved; labeled "ทดลอง · ไม่บันทึก"). *(Q2 = any non-owned tree)*
- [x] **"Deceased, year unknown" supported** → needs a new `deceased` boolean column. *(Q1 = optional year)*
      States: alive `(deceased=false, died=null)` · deceased+year `(true, <year>)` · deceased unknown `(true, null)`.
- [x] Scope is **only the alive/deceased status** (+ optional death year). NOT name/born/other fields.
- [x] Edit permission = **owner only** for v1 (accepted-`editor` shares = future).

## Technical decisions
- **Schema:** add `people.deceased integer({mode:'boolean'}) NOT NULL DEFAULT 0`. Migration backfills
  `deceased = (died IS NOT NULL)` for existing rows. `deceased` becomes the **source of truth** for
  alive/dead; `died` stays the optional year detail.
- **Endpoint:** `PATCH /api/tree/:slug/person/:personId` (new `routes/people.ts`, mirror `shares.ts`):
  session + origin-check + owner-only (`resolveOwnerTree`, extracted to a small shared lib) + fetch person
  scoped to `tree_id` (404 if not in this tree) + zod body `{ deceased: boolean, died: number|null }` +
  consistency rules (`!deceased ⇒ died=null`; `deceased && died!=null ⇒ born ≤ died ≤ currentYear`) +
  `purgeTreeCache`. Returns `{ deceased, died }`.
- **Client:** `apiClient.setPersonStatus(slug, personId, { deceased, died })`; carry `deceased` through
  `ApiTreeResponse` + `adaptTree`; update the stale "read-only" header comment.
- **UI:** ProfileDrawer status control = toggle (ยังมีชีวิต ⟷ เสียชีวิต) + year input shown only when
  deceased (blank allowed = ไม่ทราบปี). TreeView owns: `canEdit = !!user && user.id === meta.ownerId`,
  a `statusOverrides` local map, and `onSetStatus(personId, deceased, died)` →
  owner: optimistic local update + `apiClient.setPersonStatus` (revert on error); non-owner: local override
  only. All views (canvas/sidebar/drawer/stats) read people **merged with overrides**.

## Security considerations (write endpoint — re-introducing a mutation)
- Owner-only via `resolveOwnerTree`; non-owner ⇒ 404 (anti-enumeration, matches shares).
- Person update scoped to `tree_id` → cannot edit another tree's person by id.
- Inherits global session + origin-check middleware (same as visibility PATCH).
- zod body validation + numeric range checks; reject malformed/out-of-range.
- `purgeTreeCache` so cached public reads reflect the change.
- Consider a light per-user rate limit (optional v1; owner-scoped, low abuse risk).

## ⚠️ Operational dependency (flag at approval)
The `deceased` column needs a **prod D1 migration** (`pnpm db:migrate:remote`, needs CF creds). It is an
**additive** column, so the safe order is **migrate prod FIRST, then deploy code** (the new worker query
selects `deceased` — if the column is missing, tree reads break). Local dev uses `db:migrate:local`.

## Out of scope
- Editing name/born/gender/relations; editor-role (shares) editing; tree creation; bulk edits.
