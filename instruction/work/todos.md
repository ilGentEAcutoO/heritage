# Active Tasks

> Last updated: 2026-06-16 (planning)
> Workstream: 09-multi-tree-epic / Phase 1 (create & build + sharing polish)
> Plan: `instruction/work/plan.md` · Requirements: `instruction/work/requirements.md`
> Status: ⏳ AWAITING APPROVAL — say "ลุย"/"approved" to start Stage 1

## Phase 1 — 3 shippable stages (checkpoint between each)

### STAGE 1 — Create a tree (start here)
#### TASK-101: createTree client + slug helper
- Status: ⚪ pending
- Files: `src/app/lib/api.ts`, `src/app/lib/slug.ts` (new), `tests/unit/slug.test.ts` (new)
- Sub-tasks:
  - [ ] `apiClient.createTree({name, slug, visibility})` → POST /api/trees (returns TreeSummary)
  - [ ] `slugify(name)` helper → valid `^[a-z0-9][a-z0-9-]{1,63}$` (or '' if impossible) + unit tests
  - [ ] Verify backend POST returns slug in body (read trees.ts response shape)

#### TASK-102: Create-tree UI on /trees
- Status: ⚪ pending
- Dependencies: TASK-101
- Files: `src/app/pages/Trees.tsx`, `src/app/components/CreateTreeDialog.tsx` (new)
- Sub-tasks:
  - [ ] "+ สร้าง tree ใหม่" button on /trees
  - [ ] CreateTreeDialog (name + auto-suggested editable slug + visibility radio), styled like ShareDialog
  - [ ] Submit → createTree; 201 → navigate /tree/:slug; 409 slug-taken + 422 field errors handled
  - [ ] Refetch dashboard / show new tree under "owned"

#### TASK-103: Stage-1 verify + ship
- Status: ⚪ pending
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
> Phase 1 planned in 3 stages; awaiting approval to start Stage 1 (create-tree frontend; backend done).
> Sequence: Stage 1 create → Stage 2 people/relations CRUD → Stage 3 sharing polish (invite email+accept+link).
> Later phases (separate workstreams): photo upload, per-tree theming.
