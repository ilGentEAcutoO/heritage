# Active Tasks

> Last updated: 2026-06-16 21:35
> Workstream: 14-ui-redesign (soft-modern) — user: "เปลี่ยนสไตล์ UI แอปใหม่ ทันสมัย" → chose Soft modern + emerald
> Status: ✅ SHIPPED & LIVE (whole app). Design system in styles.css :root (tokens: --bg/--paper/--ink*/--leaf*
>   /--blossom*/--line, --radius*/--shadow*/--accent-grad) + Prompt font (replaced Cormorant/Sarabun/JetBrains).
>   - TreeView: glassy header · floating sidebar+drawer cards · stat cards · pill+gradient buttons · dot-grid
>     canvas · nodes with depth shadow + hover lift · selected = emerald glow · bold node names/title.
>   - Landing (/) : radial wash + floating logo badge + bold title + pill CTA (root cause of "ไม่เห็นเปลี่ยน":
>     logged-in / = Landing, wasn't restyled at first). /trees: bold heading + hover-lift tree cards + pill CTA.
>   - Dialogs (create/add-person/share/theme) + UserMenu + all auth pages (login/signup/verify/magic/reset):
>     restyled via 10-agent workflow (pill buttons, rounded inputs + emerald focus ring, dialog panels radius-lg
>     + shadow-lg, token colours). Logic/testids/copy unchanged.
>   - Proof: typecheck 0 · 574/574 (all rounds) · builds OK · deploys 27611954565/.../27625016668 green ·
>     prod real-browser verified: TreeView hero, Landing, /trees, signup page.
>   - Commits: ae7620f foundation · ddbf0ae hero · d1df158 landing+trees · 52b7aab dialogs+auth.
>   - Final polish ✅ DONE (commit c43898e): ProfileDrawer interior (edit form, status toggle, gender pills,
>     buttons, pill meta-chips, bold non-italic tabs) restyled via 1 agent · responsive pass added (no @media
>     existed before) — ≤820px single-column + sidebar hidden, ≤560px phone-compact header + near-full-bleed
>     drawer (verified in deployed CSSOM; note: sidebar hidden on mobile = future slide-out nav) · connector
>     leaves toned to subtle · neutralised sepia photo-placeholder + last brown/single-quoted-font leftovers.
>   - ENTIRE redesign now SHIPPED & LIVE. Deploys through 27625xxxxx green. Last: commit c43898e.
>
> --- (earlier this session) ---
> Last updated: 2026-06-16 17:20
> Workstream: 13-frontend-qa + theme-redesign
> QA (real browser via Claude-in-Chrome, prod, QA account created+verified via signup UI + backchannel token):
>   signup→verify→login ✅ · create tree ✅ · add person ✅ · relations (spouse) ✅ · photo upload ✅ ·
>   size-limit msg ✅ · wrong-type msg ✅ · photo delete ✅ · status edit (deceased+year) ✅ · theme picker ✅ ·
>   share dialog + public link + invite UI ✅ · user menu ✅. No console errors throughout.
> Theme redesign (user: "ธีมประหลาดเกิน ขอพาสเทลอ่อน/น่าเชื่อถือ") ✅ SHIPPED:
>   - Root cause: forest/blueprint were dark-mode inversions (--paper L=0.22/0.32); rose/ocean over-saturated.
>   - Fix: all palettes now LIGHT tinted-paper base (L~0.97) + low-chroma pastel accents. Keys unchanged
>     (stored values + zod enum valid); forest/blueprint relabelled Sage/Sky in picker + tweaks panel.
>   - Files: palettes.ts, ThemePicker.tsx (swatches+labels), TweaksPanel.tsx, styles.css body.theme-*,
>     18-theme.spec.ts (FOREST_VARS updated to soft values).
>   - Chosen degree: พาสเทลอ่อน (chroma ~0.07-0.09), previewed live in-browser before commit.
>   - Proof: typecheck 0 · 574/574 · build · CI 27610322947 · Deploy 27610385753 · prod real-browser (Sage
>     applies oklch(0.972 0.012 135)) · 18-theme e2e TH1/TH2 green.
>   - Commit: 518f40f.
>
> Demo theme preview (user: "เข้า demo เปลี่ยนธีมไม่ได้") ✅ SHIPPED:
>   - ThemePicker now shown to everyone (not just owner). Owner persists (PATCH); non-owner/demo gets an
>     ephemeral local preview (previewTheme state, no network, resets on reload) + "ลองดูเฉยๆ · ไม่บันทึก" hint.
>   - Files: TreeView.tsx (previewTheme state + handleSelectTheme + effectiveTheme), ThemePicker.tsx (previewOnly).
>   - Proof: typecheck 0 · 574/574 · build · CI green · Deploy 27611954565 (1st run hit a transient CF subdomain
>     auth code-10001 AFTER the worker uploaded; re-run clean) · prod demo real-browser: 🎨 ธีม shows, Rose
>     applies oklch(0.975 0.01 20) locally, no console errors. Commit: 48eb507.
>
> --- (earlier this session) ---
> Last updated: 2026-06-16 14:01
> Workstream: 12-abuse-hardening (rate-limit + file-size + tree quota)
> Goal: "ทำ rate limit การปรับเปลี่ยนภาพ หรือการอัปโหลดภาพ ขนาด ไฟล์ และจำกัดจำนวนครอบครัวที่สร้างได้"
> Status: ✅ SHIPPED & LIVE — 574/574 green · Opus adversarial review applied · CI 27600165847 ·
>   Deploy 27600223170 · prod e2e 3/3 (14-create-tree SC1/SC2 + 17-photo-upload PU1-5, happy paths intact).
> Follow-up (user: "บอกผู้ใช้ด้วย") ✅ SHIPPED — surface limit errors in the UI so users are told why:
>   - CreateTreeDialog: 429 tree_limit_reached → "สร้างได้สูงสุด N ครอบครัว…" (N from err.max, not hardcoded).
>   - ProfileDrawer: photoErrorMessage maps 413/too_large, 415/unsupported_type, 429/rate_limited (upload+delete)
>     + client-side size/type pre-check (instant feedback) + accept="image/jpeg,image/png,image/webp".
>   - api.ts ApiError now carries {max}. TreeView: key={selected.id} on ProfileDrawer (fix stale error on jump).
>   - Verify workflow (3 lenses + synth): mapping correct, no missed surfaces, 1 MEDIUM (stale photoError) → fixed.
>   - Proof: typecheck 0 · 574/574 · build OK · CI 27608133887 · Deploy 27608193561 · prod e2e: 12-pov P1-3 +
>     14-create-tree + 17-photo-upload PU1-5 + NEW PU6 (oversized→"5 MB", wrong-type→"JPG", no upload).
>   - Commits: 966773e UI surfacing · 2afa3d1 e2e PU6.
>   - Rate-limit photo upload/delete: per-owner KV fixed-window 30/60s (bucket 'photo-mutate'), guard before
>     multipart parse + R2 write. New lib src/worker/lib/rate-limit.ts (shared write-path limiter).
>   - File size: existing 5MB cap (declared-size pre-check + post-buffer re-check) satisfies "ขนาดไฟล์".
>   - Tree quota: MAX_TREES_PER_OWNER=20, POST /api/trees → 429 {tree_limit_reached, max} when at cap.
>   - Tests: unit rate-limit (boundary) + integration photo rate-limit (saturated 429, real burst past MAX,
>     per-owner isolation, DELETE 429) + integration tree-quota (at cap / one-below / per-owner).
>   - Review fix: replaced two false-confidence tests (empty-KV "under budget", deletedKeys assertion on POST)
>     with a real MAX+1 burst + put-side objectCount assertion. PHOTO_MUTATE_MAX now exported.
>   - Code-only change → NO D1 migration needed.
>   - Commits: c6dd4bc rate-limiter lib · ff94af4 photo rate-limit · 5bbc3d1 tree quota. Pushed 5bbc3d1.
>
> --- (prior workstream archived below) ---
> Workstream: 09-multi-tree-epic / Phase 1 (create & build + sharing polish)
> Plan: `instruction/work/plan.md` · Requirements: `instruction/work/requirements.md`
> Status: ✅✅✅ EPIC COMPLETE & LIVE on https://heritage.jairukchan.com/ — Goal "ลุยให้จบเลยไม่ต้องถาม" met.
>   Phase 1 (create-tree · people/relations CRUD · sharing+invite-email+public-link) · Phase 2 (photo upload→R2) ·
>   Phase 3 (per-tree theming). All shipped + e2e-verified vs prod. Ready to archive via workflow-end.
> Phase 2 proof: 555/555 · CI 27596894312 · Deploy 27596937905 · e2e 17-photo-upload PU1-5 (+ refetch-keeps-mounted fix).
> Phase 3 proof: 564/564 · manual security review (theme enum-validated, no CSS injection; verify workflow hit a
>   transient rate-limit) · CI 27598590393 · prod D1 migrated (0007 theme col) · Deploy 27598687890 · e2e 18-theme TH1/TH2.
> Stage 3 proof: typecheck 0 · 536/536 (incl. invite-email + escapeHtml tests) · Opus review PASS ·
>   CI 27595763202 · Deploy 27595806379 · e2e vs prod 2/2 sharing loop (SH1 invite→verify→shared, SH2 public link).
> SECURITY: commit-review flagged HTML-injection in the invite email → fixed (escapeHtml on treeName/inviterName/
>   treeUrl) + tests; CI 27596045885 · Deploy 27596090087.
> Stage 1 proof: CI 27593510350 · Deploy 27593550508 · e2e 2/2.
> Stage 2 proof: typecheck 0 · 525/525 unit+integration (50 new) · Opus security 8/8 + integrity 4/4 PASS ·
>   CI 27594744804 · Deploy(s) 27594787508/27595032812 · e2e vs prod 4/4 build-tree (BT1-BT5) +
>   regression 14-create-tree + 13-status-edit green. Bonus: Sidebar shows name when nick absent.

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
