# Plan: Phase 1 — Create & build your own tree + sharing polish

> Created: 2026-06-16 · Workstream 09 (Phase 1 of the multi-tree epic)
> Executed in 3 shippable stages; checkpoint with user between stages. TDD + security-first.

## Cross-cutting conventions (all stages)
- Mutations are owner-only via `resolveOwnerTree` (401 no session, 404 non-owner — anti-enumeration),
  zod-validated, `purgeTreeCache(c.req.url, slug)` after writes, inherit session + origin-check middleware.
- Client methods in `src/app/lib/api.ts`; optimistic UI where natural; refetch via `useTree`/`listTrees`.
- Each stage: typecheck → unit → integration → build → frontend-test → e2e (vs prod after deploy) → green.

---
## STAGE 1 — Create a tree (build-ready)
### Architecture
Backend `POST /api/trees` already exists (createTreeSchema, slug-unique, owner_id=user, 201 → TreeSummary).
Add the frontend:
- `apiClient.createTree({ name, slug, visibility })` → POST /api/trees, returns TreeSummary (incl. slug).
- `/trees` (`Trees.tsx`): a "+ สร้าง tree ใหม่" button → a create form/modal:
  fields: name (required), slug (auto-suggested from name, editable, live-validated against
  `^[a-z0-9][a-z0-9-]{1,63}$`), visibility (radio: ส่วนตัว/แชร์/สาธารณะ default private).
  On submit → createTree → on 201 navigate to `/tree/:slug`; on 409 show "slug ซ้ำ"; on 422 show field error.
- Slug auto-suggest helper (client): slugify(name) → lowercase, spaces→`-`, strip invalid, clamp 2-64.
### Test specs
- unit: slugify helper (Thai/edge cases → valid slug or empty), source assertions for createTree client.
- integration: POST /api/trees already tested? add if missing (401 no-auth, 201 owner, 409 dup, 422 bad slug).
- e2e: logged-in user → /trees → create → lands on new /tree/:slug; new tree appears in dashboard "owned".
### Files
- `src/app/lib/api.ts` (createTree), `src/app/pages/Trees.tsx` (button + form/modal), maybe
  `src/app/components/CreateTreeDialog.tsx` (new, styled like ShareDialog), `src/app/lib/slug.ts` (new helper).
  Backend likely untouched (verify createTreeSchema returns slug in body).

---
## STAGE 2 — Build the tree: people + relations CRUD (design outline; detail at start)
### Endpoints (new `src/worker/routes/people.ts` extends; or `relations.ts`)
- `POST /api/tree/:slug/person` — create person (name req; nameEn/nick/born/hometown/gender/deceased/died opt).
- `PATCH /api/tree/:slug/person/:id` — extend the existing status PATCH to also edit name/nameEn/nick/born/
  hometown/gender (keep deceased/died rules). zod partial.
- `DELETE /api/tree/:slug/person/:id` — delete person; relations cascade (FK onDelete cascade in schema).
- `POST /api/tree/:slug/relation` — body {fromId, toId, kind:'parent'|'spouse'}; both ids in tree; no self;
  dedupe existing edge; (spouse undirected — store once).
- `DELETE /api/tree/:slug/relation/:id`.
- All owner-only + zod + cache purge. Integration tests per endpoint (auth/ownership/validation/integrity).
### Client + UI
- api.ts: createPerson/updatePerson/deletePerson/createRelation/deleteRelation.
- UI: "เพิ่มคน" button (Sidebar) → add-person modal; ProfileDrawer edit mode (name/born/hometown/gender) for
  owners; "เชื่อมความสัมพันธ์" (pick person + kind) ; delete-with-confirm. Optimistic + refetch.
### Risks to design for
- Relation cycles (parent loops) — validate or at least avoid infinite layout (layout already guards mutual
  spouse). Duplicate edges. Deleting "me"/bridge people. Empty-tree first-person UX.

---
## STAGE 3 — Sharing polish (design outline; detail at start)
- **Invite email**: add `sendShareInvitationEmail` (mirror `src/worker/lib/email.ts` sendVerificationEmail;
  consult cloudflare-email-service skill). Send on POST /shares for not-yet-users (+ existing users).
- **Accept flow**: tokenised invite link (reuse auth_tokens 'magic'-style or a new kind) → an accept page
  (`/invite/accept?token=` or similar) that, after signup/login, marks the share accepted.
- **Public link**: ShareDialog "คัดลอกลิงก์" for public trees (copy `https://.../tree/:slug`).
- Tests: integration (invite creates token + email called; accept transitions pending→accepted), e2e.

---
## Security (whole phase)
- Re-uses the hardened owner-only mutation pattern; person/relation updates scoped by tree_id; invite tokens
  single-use + hashed (like auth_tokens); no new public data exposure beyond chosen visibility.
- Email: no enumeration leak (invite to a non-user must not reveal account existence in the response).

## Parallel/sequencing
- Within Stage 1: client+helper+dialog are small; can be one focused workflow (impl + verify) or done inline.
- Stages run sequentially with a user checkpoint between (ship each before starting the next).
