# Requirements — Workstream 09 (EPIC): Multi-tree + Google-Drive-style sharing + per-tree theming

> Created: 2026-06-16 · Status: PLANNING (research in flight; phasing + scope to be confirmed)

## Raw request (user, 2026-06-16, Thai)
> [เลือกฟีเจอร์ 1 + 4] สร้างครอบครัวตัวเองไปเลย · เปิดปิด public หรือ share กับ user ที่เรากำหนดได้
> เหมือน google drive · มีหน้ารวมดู tree ที่เราเข้าถึงได้อะไรงี้ · กำหนดโทนสี สไตล์ และพื้นหลังได้ก็ดี

## Vision — components
1. **Create your own family tree** — users can start a tree of their own (not just view the demo).
2. **Build the tree** — add people + connect relations (parent/spouse), edit person details, upload photos.
3. **Sharing like Google Drive** — per-tree: public on/off, OR share with specific users (by email) with
   roles (viewer/editor); invitees accept; owner manages the access list.
4. **"Trees I can access" dashboard** — a page listing trees you own + trees shared with you (with role).
5. **Per-tree theming** — set color tone / style / background per tree (persisted; applied for all viewers).

## Nature: this is an EPIC → must be phased
Too large for one workstream. Plan = decompose into ordered slices (foundation first, then layer features),
ship each slice end-to-end (build → verify → deploy). Research (workflow ws09-understand) is mapping which
parts already exist (sharing + create-tree backend appear partially built) vs net-new, to size each slice.

## Known starting facts (from prior sessions / quick scan — being verified by research)
- `POST /api/trees` (create tree) EXISTS on backend (`trees.ts`) but has NO frontend/client method yet.
- Sharing infra largely EXISTS: `tree_shares` table (email, role viewer/editor, status pending/accepted/
  revoked), `shares.ts` (POST/DELETE shares, PATCH visibility), `ShareDialog.tsx`, `canAccessTree` gate,
  `GET /api/trees` returns role. Completeness of the invite→accept→access loop = under research.
- `/trees` page + `listTrees` EXIST (completeness under research).
- Photo UPLOAD = net-new (`img.ts` serves only; `photos` table exists). Add-people/relations = net-new.
- Per-tree theming = net-new (CSS vars exist; TweaksPanel is per-user/local, not per-tree persisted).
- Pattern to reuse: owner-only mutation via `resolveOwnerTree` + zod + `purgeTreeCache` (from ws08).

## Research findings (ws09-understand workflow, 2026-06-16)
- ✅ Create-tree BACKEND done (`POST /api/trees`, createTreeSchema: name 1-200, slug `^[a-z0-9][a-z0-9-]{1,63}$`,
  visibility enum default private, 409 on slug clash, owner_id=user.id). MISSING: frontend (client+form+nav).
- ✅ Dashboard `/trees` done (Trees.tsx lists owned + shared-with-me w/ role badges; GET /api/trees merges).
- ✅ Sharing CORE done: visibility public/private/shared, POST/DELETE shares (invite email+role, auto-accept
  if invitee already a verified user), ShareDialog, canAccessTree gate. MISSING: invite EMAIL (silent today),
  accept flow/page for non-account invitees, public shareable-link UI.
- ❌ People/relations CRUD = net-new (only the ws08 status PATCH exists). Need POST/PATCH/DELETE person +
  POST/DELETE relation, client methods, UI.
- ❌ Photo upload = net-new. Per-tree theming = net-new.
- Reuse: `resolveOwnerTree` + zod + `purgeTreeCache` (ws08); `src/worker/lib/email.ts` sendVerificationEmail;
  cloudflare-email-service skill for invite email.

## Agreed scope & phasing (Q&A 2026-06-16)
EPIC = 4 sequential workstreams: **Phase 1 (this one)** → Phase 2 photos → Phase 3 theming → (later) extras.
- [x] **Phase 1 = "Create & build your own tree" + sharing polish** — confirmed FULL scope:
  create-tree frontend · add/edit/delete people + relations · invite-by-email + accept page + public link.
- [ ] Phase 2 (later): photo upload. Phase 3 (later): per-tree theming.

### Phase 1 executed in 3 shippable stages (each build→verify→deploy→e2e, checkpoint between)
- **Stage 1 — Create a tree** (S–M): wire `apiClient.createTree` + "+ สร้าง tree" form/modal on /trees +
  slug auto-suggest + 409 handling + nav to new tree. Unblocks dashboard/share/status for real owned trees.
- **Stage 2 — Build the tree** (L): people CRUD (create/edit-details/delete) + relations (parent/spouse
  create/delete) endpoints + client + UI (add-person, edit form, connect-relation, delete-with-confirm).
- **Stage 3 — Sharing polish** (M): invite EMAIL (mirror email.ts + cloudflare-email-service), accept page
  for non-account invitees (token), public shareable-link UI.

## Technical decisions
- All mutations owner-only via `resolveOwnerTree` (anti-enum 404) + zod + `purgeTreeCache` (ws08 pattern).
- Relation integrity: dedupe (no duplicate parent/spouse edges), reject self-relation, both person ids must
  belong to the tree; person delete cascades its relations (FK onDelete cascade already in schema).
- Invite accept (non-users): a tokenised accept link (reuse auth_tokens/magic pattern) → accept page.

## Out of scope (for now)
- Real-time collaboration, GEDCOM import, AI features, mobile-native. (Candidates for later workstreams.)
