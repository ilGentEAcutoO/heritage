# Active Tasks

> Last updated: 2026-06-16 (planning)
> Workstream: 09-multi-tree-epic / Phase 1 (create & build + sharing polish)
> Plan: `instruction/work/plan.md` · Requirements: `instruction/work/requirements.md`
> Status: 🟦 Stage 1 ✅ SHIPPED & LIVE (create-tree flow). CHECKPOINT — awaiting go for Stage 2.
> Stage 1 proof: typecheck 0 · unit 475/475 · adversarial review PASS · CI 27593510350 ·
>   Deploy 27593550508 · e2e vs prod 2/2 (SC1 create→land→dashboard, SC2 slug validation).

## Phase 1 — 3 shippable stages (checkpoint between each)

### STAGE 1 — Create a tree (start here)
#### TASK-101: createTree client + slug helper
- Status: ✅ tested (apiClient.createTree + slug.ts; unit 11/11)
- Files: `src/app/lib/api.ts`, `src/app/lib/slug.ts` (new), `tests/unit/slug.test.ts` (new)
- Sub-tasks:
  - [ ] `apiClient.createTree({name, slug, visibility})` → POST /api/trees (returns TreeSummary)
  - [ ] `slugify(name)` helper → valid `^[a-z0-9][a-z0-9-]{1,63}$` (or '' if impossible) + unit tests
  - [ ] Verify backend POST returns slug in body (read trees.ts response shape)

#### TASK-102: Create-tree UI on /trees
- Status: ✅ tested (CreateTreeDialog + Trees.tsx button/nav; e2e SC1/SC2 vs prod)
- Dependencies: TASK-101
- Files: `src/app/pages/Trees.tsx`, `src/app/components/CreateTreeDialog.tsx` (new)
- Sub-tasks:
  - [ ] "+ สร้าง tree ใหม่" button on /trees
  - [ ] CreateTreeDialog (name + auto-suggested editable slug + visibility radio), styled like ShareDialog
  - [ ] Submit → createTree; 201 → navigate /tree/:slug; 409 slug-taken + 422 field errors handled
  - [ ] Refetch dashboard / show new tree under "owned"

#### TASK-103: Stage-1 verify + ship
- Status: ✅ tested (CI green, deployed, e2e vs prod 2/2; POST /api/trees already integration-tested)
- Dependencies: TASK-101, TASK-102
- Sub-tasks:
  - [ ] integration test POST /api/trees (401/201/409/422) if missing; unit slug; e2e create→land on tree
  - [ ] typecheck + unit + integration + build + frontend-test (create a tree live) + adversarial review
  - [ ] commit (no AI sig) + push + CI → deploy → e2e vs prod
  - [ ] **CHECKPOINT with user** before Stage 2

### STAGE 2 — Build the tree: people + relations CRUD (outline; detail at stage start)
#### TASK-201: people/relations endpoints + integration tests ⚪
#### TASK-202: client methods + add/edit/delete person UI + relation connect UI ⚪
#### TASK-203: verify + ship + CHECKPOINT ⚪
> Endpoints: POST/PATCH(extend)/DELETE person, POST/DELETE relation — owner-only, zod, integrity (no self,
> dedupe, in-tree), cascade. UI: เพิ่มคน modal, ProfileDrawer edit mode, เชื่อมความสัมพันธ์, delete-confirm.

### STAGE 3 — Sharing polish (outline; detail at stage start)
#### TASK-301: invite email (sendShareInvitationEmail, mirror email.ts + cloudflare-email-service) ⚪
#### TASK-302: accept flow for non-account invitees (tokenised link + accept page) ⚪
#### TASK-303: public shareable-link UI in ShareDialog + verify + ship ⚪

## File Lock Registry
| File | Locked by | Task | Since |
|------|-----------|------|-------|
| _(none — not started)_ | | | |

---
## RESUME CONTEXT
> 2026-06-16 — Stage 1 (create-tree) SHIPPED & LIVE on prod. CHECKPOINT before Stage 2.
> Commits: 56db1cb feat(trees) create-tree flow + test(trees). slug.ts + apiClient.createTree +
>   CreateTreeDialog + Trees.tsx button/nav. e2e 14-create-tree 2/2 vs prod.
> NEXT (Stage 2, awaiting user go): people + relations CRUD — POST/PATCH(extend)/DELETE person,
>   POST/DELETE relation (owner-only, zod, integrity, cascade) + client + UI (เพิ่มคน, edit mode,
>   เชื่อมความสัมพันธ์, delete-confirm). Then Stage 3 sharing polish (invite email + accept + public link).
> Later workstreams: photo upload, per-tree theming.
