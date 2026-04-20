# Active Tasks

> Last updated: 2026-04-19 23:05
> Session: heritage-v1 (post-ship tweaks — TASK-060/061/062 all ✅ tested)
> Plan: `./plan.md`

## Final Status

- **11/11 main tasks + 3 post-ship tweaks complete**
- **135 tests passing** (34 kinship + 20 layout + 20 tokens + 16 auth + 29 tree-api + 16 upload) — baseline was 136; net −1 because old "23 upload" count in prior snapshot was stale (TASK-050 R2 rewrite had already dropped presigning tests to 16). Actual new test work: layout +4 (toLayoutPerson), tree-api +2 (relations dedup + spouse symmetry).
- **Typecheck clean**
- **Build**: 226 KB client JS / 26 KB CSS / 352 KB worker (pre-tweaks — rebuild before next deploy)
- **Visual render verified** via Playwright — Wongsuriya demo tree renders with correct Thai kinship labels (ปู่สมชาย, ย่าวิภา, แม่ดาริน, อาอรวรรณ, อาเขยธนา) from Napa's POV, 0 console errors
- **Deploy dry-run**: all bindings (D1/R2/KV/EMAIL/ASSETS/custom domain) resolve

## Post-ship to-dos

### Done via wrangler CLI (2026-04-19 08:25)

- [x] `wrangler secret put SESSION_SECRET` — 32-byte hex via `openssl rand -hex 32`
- [x] `wrangler d1 migrations apply heritage-d1-main --remote` — 27 statements, 14 tables
- [x] `tsx scripts/seed-demo.ts --remote` — Wongsuriya demo seeded in prod (228 rows)
- [x] `wrangler deploy` — custom domain `heritage.jairukchan.com` bound automatically
- [x] **TASK-050 — R2 upload refactor to worker-proxied** — removed `aws4fetch` dep, no R2 S3 API token needed; `env.PHOTOS.put()` via binding
- [x] Redeploy with refactored upload — version `2cf0ebe9-5a01-474a-a230-2c311760b19b`

### Still requires dashboard (wrangler CLI not sufficient)

- [ ] **Email Sending onboarding for `jairukchan.com`** — `wrangler email sending enable` has a known bug (POST `/zones/{id}/email/sending/enable` → 404; API actually at `/accounts/{id}/...`). One-time dashboard action:
      Dashboard → Compute & AI → Email Service → Onboard Domain → `jairukchan.com` → Add SPF + DKIM records (auto-populated since jairukchan.com is on CF DNS) → Verify (5–15 min)
- [ ] **Workers Paid plan** — CF Email Service requires Paid ($5/mo). Until upgraded, `/api/auth/request` will 5xx at `env.EMAIL.send()`; everything else (demo tree, sessions if seeded, upload with a forged cookie) works.

### Known post-ship code tweaks

- [x] **TASK-060 — `relations` in API response doubles edges (48 vs 24 in D1)** — tree-query should emit each edge once
  - Status: ✅ implemented (awaiting cross-review test pass)
  - Agent P1 (Sonnet 4.6) — finished 2026-04-19 21:58
  - Root cause: `getTreeData` step 6 mapped raw D1 rows without dedup; bidirectional spouse inserts (A↔B) emitted as two edges
  - Fix: canonical-key dedup in `src/worker/lib/tree-query.ts` step 6 (parent = directed `"parent:from:to"`; spouse = undirected, lex-smaller first)
  - Tests: 28 pass / 28 total (+1 new regression test); typecheck clean
  - ⚠️ Known adjacent issue (out of scope): `spousesByPerson` per-person lookup is built from raw rows before dedup, so one side of an undirected spouse may show `spouses: []`. Flagged for potential TASK-062.
- [x] **TASK-061 — unify `Person` type** — Option C (explicit split) — ✅ tested
  - Agent P2 (Sonnet 4.6) — finished 2026-04-19 22:30
  - `layout.ts`: renamed exported `Person` → `LayoutPerson`; added `toLayoutPerson(p: Person): LayoutPerson | null` (returns null when `born` is null; falls back `nick → name → id` for label)
  - `TreeCanvas.tsx`: replaced `data.people as unknown as LayoutPerson[]` with `data.people.map(toLayoutPerson).filter((p): p is LayoutPerson => p !== null)`
  - `tests/unit/layout.test.ts`: +4 tests for `toLayoutPerson` (20/20 pass)
  - Full suite 135/135 green, typecheck clean

- [x] **TASK-062 — fix one-sided `spousesByPerson`** — ✅ tested
  - Agent P3 (Sonnet 4.6) — finished 2026-04-19 22:50
  - `tree-query.ts` step 4 spouse branch: bidirectional population + dedup via `.includes()` guards
  - `tests/integration/tree-api.test.ts`: +1 regression test "spouse lists are symmetric and duplicate-free" — validates p7↔p8 (Arun ↔ Darin), the canonical example of the bug
  - Full suite 135/135 green, typecheck clean

- [ ] **TASK-063 (candidate, not started)** — same Option C treatment for `Lineage` type
  - Flagged by P2 during TASK-061
  - `TreeCanvas.tsx:79` still has `data.externalLineages as Record<string, LayoutLineage>` unsafe cast — identical pattern to the `Person` cast we just removed
  - `layout.ts#Lineage` has `preview: LineagePreviewPerson[]` but `types.ts#Lineage` uses `preview?: LineageMember[]` — types diverge
  - Recommendation: do this before next feature work to avoid compounding type debt

## Cloudflare Resource IDs (live)

| Resource | Name | ID | Region |
|---|---|---|---|
| Account | SORNKan Co., Ltd. | `a24ce30584273b42333051f1cdec48e2` | - |
| D1 | `heritage-d1-main` | `3ef17b93-e7ff-4631-8ffe-9ab9f6cc8694` | APAC |
| R2 | `heritage-r2-photos` | - | ENAM (default) |
| KV | `heritage-kv-ratelimit` | `d3a23a837d0a486d81575ebaf23b88cb` | - |

## Main Tasks

### TASK-001: Scaffold project (Phase 0)
- Status: ⚪ pending
- Assigned: -
- Phase: 0 (serial)
- Blocks: TASK-010, TASK-020, TASK-030
- Sub-tasks:
  - [ ] `pnpm init` + install deps (react 18, react-dom, vite, @vitejs/plugin-react, @cloudflare/vite-plugin, hono, drizzle-orm, drizzle-kit, zod, @oslojs/crypto, aws4fetch, vitest, typescript, @cloudflare/workers-types)
  - [ ] `tsconfig.json` with `strict: true`, `"moduleResolution": "bundler"`, path alias `@/*`
  - [ ] `vite.config.ts` with `@cloudflare/vite-plugin`
  - [ ] `wrangler.jsonc` — bindings: ASSETS (`dist/`, SPA fallback), DB (`heritage-d1-main`), PHOTOS (`heritage-r2-photos`), KV_RL (`heritage-kv-ratelimit`), `send_email` [{ name: "EMAIL", remote: true }]; compatibility_date 2026-04-01; `run_worker_first: ["/api/*"]`; `routes: [{ pattern: "heritage.jairukchan.com/*", zone_name: "jairukchan.com", custom_domain: true }]`
  - [ ] `src/worker/index.ts` — minimal Hono returning JSON `{ok:true}` from `/api/health`
  - [ ] `src/app/main.tsx` + `App.tsx` + mount `<div id="root">`
  - [ ] Copy prototype `styles.css` verbatim → `src/app/styles.css`
  - [ ] Create CF resources via `wrangler` CLI (user must run — outputs needed IDs); ids pasted into `wrangler.jsonc`
  - [ ] `.env.example` + `.dev.vars.example` (invoke `env-sync` skill)
  - [ ] `.gitignore`: `node_modules`, `dist`, `.wrangler`, `.dev.vars`, `*.local`
  - [ ] Smoke test: `pnpm dev`, visit `/api/health` → `{ok:true}`, visit `/` → Hello React
- Files claimed: root configs, `src/worker/index.ts`, `src/app/{main.tsx,App.tsx,styles.css}`

### TASK-010: DB schema + migrations + demo seed (Phase 1, Agent A1)
- Status: ⚪ pending
- Dependencies: TASK-001
- Phase: 1 (parallel A)
- Blocks: TASK-021, TASK-022 (needs typed schema)
- Sub-tasks:
  - [ ] Write `src/db/schema.ts` — all tables per plan.md#data-model
  - [ ] Write `src/db/client.ts` — `drizzle(env.DB, { schema })`
  - [ ] Write `drizzle.config.ts` — dialect sqlite, schema path, out path
  - [ ] `pnpm drizzle-kit generate` → produces `drizzle/migrations/0000_*.sql`
  - [ ] `wrangler d1 migrations apply heritage-d1-main --local`
  - [ ] Write `src/worker/lib/seed.ts` — Wongsuriya data from `/tmp/design_bundle/family-tree/project/data.js` (16 people, 4 lineages, stories, memos, photo counts)
  - [ ] Write `scripts/seed-demo.ts` — idempotent CLI; skips if `trees.slug='wongsuriya'` exists
  - [ ] Smoke: run seed, query `SELECT COUNT(*) FROM people WHERE tree_id=(SELECT id FROM trees WHERE slug='wongsuriya')` → 16
- Files claimed: `src/db/**`, `drizzle.config.ts`, `drizzle/**`, `src/worker/lib/seed.ts`, `scripts/seed-demo.ts`
- Assigned model: Sonnet 4.6

### TASK-011: kinship.ts + unit tests (Phase 1, Agent A2)
- Status: ⚪ pending
- Dependencies: TASK-001
- Phase: 1 (parallel A)
- Blocks: TASK-031, TASK-032 (components need relation labels)
- Sub-tasks:
  - [ ] Write `tests/fixtures/wongsuriya.ts` — 16-person test dataset + 4 lineages (expanded so Darin's Kaewsai ancestry tests work)
  - [ ] Write `tests/unit/kinship.test.ts` — all cases in plan.md#unit-tests-kinship (≥ 25 tests)
  - [ ] Write `src/app/lib/types.ts` — Person, Relation, Story, Memo, Lineage, Tree, User, TreeData types
  - [ ] Write `src/app/lib/kinship.ts` — TypeScript port with full paternal/maternal path tracking, nick-suffix format, shortened sibling/cousin forms
  - [ ] All tests green; no `any` types; `pnpm typecheck` clean
- Files claimed: `src/app/lib/{types,kinship}.ts`, `tests/unit/kinship.test.ts`, `tests/fixtures/wongsuriya.ts`
- Assigned model: Sonnet 4.6

### TASK-012: layout.ts + unit tests (Phase 1, Agent A3)
- Status: ⚪ pending
- Dependencies: TASK-001
- Phase: 1 (parallel A)
- Blocks: TASK-031
- Sub-tasks:
  - [ ] Write `tests/unit/layout.test.ts` — base layout + lineage expansion cases
  - [ ] Write `src/app/lib/layout.ts` — port `layoutBaseTree`, `layoutTree`, `branchPath` with types
  - [ ] All tests green
- Files claimed: `src/app/lib/layout.ts`, `tests/unit/layout.test.ts`
- Assigned model: Sonnet 4.6

### TASK-020: Auth routes + middleware (Phase 2, Agent B1)
- Status: ✅ tested
- Dependencies: TASK-010
- Phase: 2 (parallel B)
- Blocks: TASK-040
- Sub-tasks:
  - [x] `src/worker/lib/tokens.ts` — HMAC sign/verify via `@oslojs/crypto`, constant-time compare
  - [x] `tests/unit/tokens.test.ts` — sign/verify/tamper/expiry (20 tests)
  - [x] `src/worker/lib/email.ts` — `env.EMAIL.send()` wrapper with EMAIL_DEV_STUB console.log fallback
  - [x] `src/worker/routes/auth.ts` — request, verify, logout, me
  - [x] `src/worker/middleware/session.ts` — cookie parse → D1 session lookup → `c.set('user', …)`
  - [x] `src/worker/middleware/rate-limit.ts` — KV fixed-window limiter
  - [x] `src/worker/middleware/csrf.ts` — Origin/Referer header check on mutations
  - [x] `src/worker/types.ts` — Env, HonoEnv, Session, SessionUser
  - [x] `src/worker/index.ts` — wired middleware + /api/auth router
  - [x] `tests/helpers/mock-env.ts` — createMockEnv() with SQLite-backed D1 + EMAIL spy
  - [x] `tests/integration/auth.test.ts` — 16 tests; full flow + CSRF + rate-limit + single-use + expiry
  - [x] `.dev.vars` + `.dev.vars.example` — added APP_URL=http://localhost:5173 for dev CSRF alignment
  - [x] Smoke test: request → verify → Set-Cookie → /me → logout verified end-to-end
- Files claimed: `src/worker/lib/{tokens,email}.ts`, `src/worker/routes/auth.ts`, `src/worker/middleware/**`, `src/worker/types.ts`, `src/worker/index.ts`, `tests/unit/tokens.test.ts`, `tests/integration/auth.test.ts`, `tests/helpers/mock-env.ts`, `tests/helpers/sqlite-d1-legacy.ts`
- Assigned model: **Opus 4.6** (security-critical)
- Test count: 20 unit + 16 integration = 36 tests, all green
- Also ran: full suite 136/136 passing, typecheck clean

### TASK-021: Tree CRUD routes (Phase 2, Agent B2)
- Status: ⚪ pending
- Dependencies: TASK-010, TASK-011
- Phase: 2 (parallel B)
- Blocks: TASK-040
- Sub-tasks:
  - [ ] `src/shared/schemas.ts` — Zod schemas for Person, Story, Memo, Tree input
  - [ ] `src/worker/routes/tree.ts` — GET (public), POST/PATCH/DELETE (auth)
  - [ ] Permission helpers (owner/editor/viewer/anon-public)
  - [ ] Position overrides endpoint
  - [ ] `tests/integration/tree-api.test.ts`
- Files claimed: `src/worker/routes/tree.ts`, `src/shared/schemas.ts`, `tests/integration/tree-api.test.ts`
- Assigned model: Sonnet 4.6

### TASK-022: R2 upload & image proxy (Phase 2, Agent B3)
- Status: ⚪ pending
- Dependencies: TASK-010, TASK-020 (needs auth middleware)
- Phase: 2 (parallel B)
- Blocks: TASK-040
- Sub-tasks:
  - [ ] `src/worker/lib/r2-presign.ts` — SigV4 presign via `aws4fetch`
  - [ ] `src/worker/routes/upload.ts` — `/presign` + `/finalize` with magic-byte sniff
  - [ ] `src/worker/routes/img.ts` — gated GET proxy
  - [ ] `tests/integration/upload.test.ts`
- Files claimed: `src/worker/lib/r2-presign.ts`, `src/worker/routes/{upload,img}.ts`, `tests/integration/upload.test.ts`
- Assigned model: Sonnet 4.6

### TASK-030: TreeCanvas + PersonNode components (Phase 3, Agent C1)
- Status: ⚪ pending
- Dependencies: TASK-011, TASK-012
- Phase: 3 (parallel C)
- Blocks: TASK-040
- Sub-tasks:
  - [ ] `src/app/components/TreeCanvas.tsx` — pan/zoom, drag, SVG branches, lineage edges
  - [ ] `src/app/components/PersonNode.tsx` — photo SVG, badges, upstream button, lineage variant
  - [ ] localStorage for position overrides (anon); placeholder for server-sync hook
  - [ ] Side-by-side visual match to prototype
- Files claimed: `src/app/components/{TreeCanvas,PersonNode}.tsx`
- Assigned model: Sonnet 4.6

### TASK-031: Drawer, pathfinder, sidebar, pill, tweaks (Phase 3, Agent C2)
- Status: ⚪ pending
- Dependencies: TASK-011
- Phase: 3 (parallel C)
- Blocks: TASK-040
- Sub-tasks:
  - [ ] `src/app/components/ProfileDrawer.tsx` — port from panels.jsx (Family/Stories/Photos/Voice tabs, lineage-link panel)
  - [ ] `src/app/components/PathFinder.tsx`
  - [ ] `src/app/components/Tab.tsx`
  - [ ] `src/app/components/Sidebar.tsx` — search, people list, stats, legend
  - [ ] `src/app/components/ActiveViewPill.tsx`
  - [ ] `src/app/components/TweaksPanel.tsx` — theme/nodeShape/trunk toggles + edit-mode postMessage protocol
  - [ ] Drop MergeDrawer entirely (per user)
- Files claimed: `src/app/components/{ProfileDrawer,PathFinder,Tab,Sidebar,ActiveViewPill,TweaksPanel}.tsx`
- Assigned model: Sonnet 4.6

### TASK-032: App shell, pages, hooks, API client (Phase 3, Agent C3)
- Status: ⚪ pending
- Dependencies: TASK-011
- Phase: 3 (parallel C)
- Blocks: TASK-040
- Sub-tasks:
  - [ ] `src/app/App.tsx` — react-router (hash or browser + catch-all)
  - [ ] `src/app/pages/Landing.tsx`
  - [ ] `src/app/pages/TreeView.tsx` — wraps canvas/sidebar/drawer/pill
  - [ ] `src/app/pages/Login.tsx` + `AuthVerify.tsx`
  - [ ] `src/app/lib/api.ts` — fetch wrapper, `credentials: 'include'`, JSON error handling
  - [ ] `src/app/hooks/{useTree,useSession,useUpload}.ts`
- Files claimed: `src/app/{App.tsx,pages/**,hooks/**,lib/api.ts}`
- Assigned model: Sonnet 4.6

### TASK-040: End-to-end integration + verification (Phase 4, main agent)
- Status: ⚪ pending
- Dependencies: TASK-020, TASK-021, TASK-022, TASK-030, TASK-031, TASK-032
- Phase: 4 (serial, main coordinator)
- Sub-tasks:
  - [ ] Pixel-perfect visual check `/demo/wongsuriya` vs prototype (open both, side-by-side)
  - [ ] POV switching, drag, theme toggle, drawer all work
  - [ ] Full auth flow: request → verify (stub email) → create tree → edit → logout
  - [ ] Upload photo; verify R2 object + drawer display
  - [ ] `pnpm test` all green; `pnpm typecheck` clean
  - [ ] `wrangler deploy --dry-run` succeeds
  - [ ] Invoke `frontend-test` skill (Playwright MCP) for full E2E pass
  - [ ] Invoke `env-sync` skill to confirm `.env.example`/`.dev.vars.example` complete
- Files claimed: none (verification only)
- Assigned model: Opus 4.6

## File Lock Registry

| File | Locked by | Task | Since |
|------|-----------|------|-------|
| _(all locks released — TASK-060/061/062 complete)_ | | | |

## Task Count

- Total: 11
- Phase 0 (scaffold): 1
- Phase 1 (data+libs): 3 parallel
- Phase 2 (API): 3 parallel
- Phase 3 (frontend): 3 parallel
- Phase 4 (verify): 1
- **Max parallelism at once: 3 agents**

## Estimated effort (rough)

| Phase | Wall clock |
|---|---|
| 0 (scaffold) | ~30 min |
| 1 (3 parallel) | ~45 min |
| 2 (3 parallel) | ~60 min |
| 3 (3 parallel) | ~60 min |
| 4 (verify) | ~30 min |
| **Total** | **~3.5 hours wall clock** (assuming 3 concurrent sub-agents during phases 1–3) |

## Pre-flight blockers for user

Before TASK-001 can begin, user needs to:
1. ✅ Plan approved
2. ✅ `wrangler login` done
3. **Workers Paid plan** confirmed on CF account (CF Email Service requires it). If not yet on Paid, dev can still run with `EMAIL_DEV_STUB=1` — magic link goes to console — until upgrade
4. ✅ Domain decided: `heritage.jairukchan.com` (user owns `jairukchan.com`; must be on CF DNS)
5. **Email Service onboarding** (user action, one-time, done after scaffold):
   - CF Dashboard → Compute & AI → Email Service → Onboard Domain → `jairukchan.com`
   - Add SPF + DKIM DNS records (auto-populated if on CF DNS)
   - Verify (5–15 min propagation)
   - Can proceed with dev-stub until this lands
