# Plan: Heritage — Family Tree on Cloudflare Workers

> Created: 2026-04-18 23:05 (+07)
> Requirements: `./requirements.md`
> Source design: `/tmp/design_bundle/family-tree/project/`

---

## Architecture

```
┌─────────────────────────────── heritage-worker-api ───────────────────────────────┐
│  Route: heritage.jairukchan.com/*                                                 │
│                                                                                   │
│   /api/*  ────► Hono router ────► handlers ────► Drizzle ────► env.DB (D1)      │
│                      │                                                            │
│                      ├─► /api/auth/*    (magic-link) ──► env.EMAIL.send() (CF Email Service, remote:true)
│                      ├─► /api/tree/*    (read/write people, stories, memos)      │
│                      ├─► /api/upload/*  (presign PUT) ───► env.PHOTOS (R2)       │
│                      └─► /api/img/:key  (gated GET proxy)                        │
│                                                                                   │
│   /*      ────► env.ASSETS (static-asset binding)                                 │
│                 └── Vite-built React SPA from ./dist/                            │
│                 └── not_found_handling = "single-page-application"                │
│                 └── run_worker_first = ["/api/*"]                                │
│                                                                                   │
└───────────────────────────────────────────────────────────────────────────────────┘

                 Frontend (React 18 + TS + Vite)
                 └── /                 → Landing (marketing + "view demo")
                 └── /demo/wongsuriya  → Read-only demo tree (no auth)
                 └── /tree/:slug       → User's tree (auth required)
                 └── /login            → Magic-link request
                 └── /auth/verify?tk=…  → Callback that sets session cookie
```

### Repo layout

```
heritage/
├── wrangler.jsonc                  ← Worker + bindings (ASSETS, DB, PHOTOS, KV_RL)
├── package.json                    ← pnpm workspace, scripts
├── tsconfig.json                   ← strict mode
├── vite.config.ts                  ← Cloudflare Vite plugin for HMR
├── drizzle.config.ts               ← schema → migrations
├── .dev.vars                       ← local secrets (gitignored)
├── .dev.vars.example               ← committed template
├── .env.example                    ← committed template
│
├── src/
│   ├── worker/
│   │   ├── index.ts                ← fetch handler, Hono app
│   │   ├── routes/
│   │   │   ├── auth.ts             ← /api/auth/{request,verify,logout,me}
│   │   │   ├── tree.ts             ← /api/tree/* CRUD
│   │   │   ├── upload.ts           ← /api/upload/presign + post-upload validator
│   │   │   └── img.ts              ← /api/img/:key gated GET
│   │   ├── middleware/
│   │   │   ├── session.ts          ← parses cookie, loads session from D1
│   │   │   ├── rate-limit.ts       ← KV-backed sliding window
│   │   │   └── csrf.ts             ← origin check on mutations
│   │   ├── lib/
│   │   │   ├── tokens.ts           ← HMAC sign/verify via @oslojs/crypto
│   │   │   ├── r2-presign.ts       ← aws4fetch SigV4 presign
│   │   │   ├── email.ts            ← env.EMAIL.send() wrapper (CF Email Service); dev stub logs to console
│   │   │   └── seed.ts             ← Wongsuriya demo data
│   │   └── types.ts                ← Env, Context
│   │
│   ├── db/
│   │   ├── schema.ts               ← Drizzle tables
│   │   └── client.ts               ← drizzle(env.DB)
│   │
│   ├── app/                        ← React SPA
│   │   ├── main.tsx
│   │   ├── App.tsx                 ← Router + shell
│   │   ├── pages/
│   │   │   ├── Landing.tsx
│   │   │   ├── TreeView.tsx        ← Uses hooks to fetch /api/tree/:slug
│   │   │   ├── Login.tsx
│   │   │   └── AuthVerify.tsx
│   │   ├── components/
│   │   │   ├── TreeCanvas.tsx      ← Ported from tree-view.jsx
│   │   │   ├── PersonNode.tsx
│   │   │   ├── ProfileDrawer.tsx   ← Ported from panels.jsx
│   │   │   ├── PathFinder.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── TweaksPanel.tsx
│   │   │   └── ActiveViewPill.tsx
│   │   ├── lib/
│   │   │   ├── kinship.ts          ← Ported computeRelation (typed)
│   │   │   ├── layout.ts           ← Ported layoutTree (typed)
│   │   │   ├── api.ts              ← fetch wrappers with credentials: 'include'
│   │   │   └── types.ts            ← Person, Tree, Story, Memo, Lineage
│   │   ├── hooks/
│   │   │   ├── useTree.ts
│   │   │   ├── useSession.ts
│   │   │   └── useUpload.ts
│   │   └── styles.css              ← Verbatim copy of prototype (1,315 lines)
│   │
│   └── shared/
│       └── schemas.ts              ← Zod schemas shared between worker + app
│
├── drizzle/migrations/             ← auto-generated .sql files
├── scripts/
│   └── seed-demo.ts                ← Idempotent seed script
│
├── tests/
│   ├── unit/
│   │   ├── kinship.test.ts         ← The TDD crown jewel
│   │   ├── layout.test.ts
│   │   └── tokens.test.ts
│   ├── integration/
│   │   ├── auth.test.ts            ← magic-link full loop with miniflare
│   │   ├── tree-api.test.ts
│   │   └── upload.test.ts
│   └── fixtures/
│       └── wongsuriya.ts
│
└── .claude/skills/                 ← existing, untouched
```

### Data model (Drizzle / D1)

```ts
// Core graph
users        (id, email UNIQUE, display_name, created_at)
trees        (id, slug UNIQUE, name, name_en, owner_id → users.id, is_public, created_at)
tree_members (id, tree_id, user_id, role: 'owner'|'editor'|'viewer')

people       (id, tree_id → trees.id, name, name_en, nick, born, died,
              gender, hometown, is_me, external, avatar_key nullable)
relations    (id, tree_id, from_id → people, to_id → people,
              kind: 'parent'|'spouse') // directed; for "parent", from=child, to=parent
stories      (id, person_id, year, title, body, created_by → users.id, created_at)
memos        (id, person_id, by_id → people, duration, title, recorded_on, object_key)
photos       (id, person_id, object_key, mime, bytes, uploaded_by → users.id, created_at)
lineages     (id, bridge_person_id → people, family, family_en, code UNIQUE,
              linked_tree_id nullable → trees.id)  -- for external lineage preview
lineage_members (id, lineage_id, person_data JSON) -- preview people not yet linked

-- User-specific node position overrides (the localStorage feature, now server-side)
position_overrides (id, user_id, tree_id, person_id, dx, dy, updated_at)
                    UNIQUE(user_id, person_id)

-- Auth
auth_tokens  (id, token_hash UNIQUE, email, expires_at, used_at)  -- magic-link nonces
sessions     (id, token_hash UNIQUE, user_id → users.id, expires_at, created_at, user_agent, ip)
```

**Indices**: `trees.slug`, `people.tree_id`, `relations.tree_id + from_id`, `relations.tree_id + to_id`, `stories.person_id`, `sessions.token_hash`, `auth_tokens.token_hash`.

**Rationale**: directed relations simplify BFS in `computeRelation` (child→parent walk is the main operation); a single table beats separate parent/spouse tables for this scale.

### API surface (Hono)

```
POST   /api/auth/request             { email }                      → 204
GET    /api/auth/verify?tk=…                                        → 302 + Set-Cookie
POST   /api/auth/logout                                             → 204
GET    /api/auth/me                                                 → { user } | 401

GET    /api/tree/:slug                                              → { tree, people, relations, stories, memos, lineages }
POST   /api/tree                     { name, nameEn }               → { tree }       [auth]
PATCH  /api/tree/:slug               { ... }                        → { tree }       [auth, owner]
POST   /api/tree/:slug/people        { person }                     → { person }     [auth, editor]
PATCH  /api/tree/:slug/people/:id    { person }                     → { person }     [auth, editor]
DELETE /api/tree/:slug/people/:id                                   → 204            [auth, editor]
POST   /api/tree/:slug/relations     { fromId, toId, kind }         → { relation }   [auth, editor]
DELETE /api/tree/:slug/relations/:id                                → 204            [auth, editor]
POST   /api/tree/:slug/stories       { personId, year, title, body} → { story }      [auth, editor]
PUT    /api/tree/:slug/overrides     { overrides: [...] }           → 204            [auth]

POST   /api/upload/presign           { personId, mime, bytes }      → { url, key }   [auth, editor]
POST   /api/upload/finalize          { key }                        → { photo }      [auth, editor]
GET    /api/img/:key                                                → image bytes    [auth OR demo tree]
```

All mutations: CSRF origin check, Zod body validation, rate-limited.

---

## Test Specifications (TDD)

### Unit: `tests/unit/kinship.test.ts` — the most important file

These tests must be written **before** `src/app/lib/kinship.ts` and must pass bit-for-bit against the prototype's expected outputs.

```ts
describe('computeRelation — Wongsuriya family', () => {
  // Direct ancestors (paternal vs maternal disambiguation)
  test('napa → somchai = ปู่สมชาย (paternal grandpa)');
  test('napa → wipa   = ย่าวิภา (paternal grandma)');
  test('napa → damrong = ตาดำรง (maternal grandpa via Kaewsai lineage)');
  test('napa → pim    = ยายพิมพ์ (maternal grandma)');

  // Direct ancestors: parents
  test('napa → arun   = พ่ออรุณ');
  test('napa → darin  = แม่ดาริน');

  // Great-grandparents
  test('napa → kan    = ปู่ทวดก้าน');
  test('napa → malee  = ย่าทวดมาลี');

  // Aunts/uncles — paternal side
  test('napa → orawan = อาอรวรรณ  (father\'s younger sister → อา, not ป้า)');
  test('napa → prayuth = ปู่ใหญ่ประยุทธ (grandfather\'s brother)');

  // Descendants
  test('somchai → napa = หลานนภา');
  test('kan_gen1 → napa = เหลนนภา');

  // Siblings — shortened form, no สาว/ชาย
  test('napa → phum   = น้องภูมิ');
  test('phum → napa   = พี่นภา');

  // Cousins — shortened (no พี่/น้อง prefix)
  test('napa → kan_gen4 = ลูกพี่ลูกน้อง กานต์');
  test('napa → praew    = ลูกพี่ลูกน้อง แพรว');

  // Spouse
  test('somchai → wipa = ภรรยาวิภา');
  test('wipa → somchai = สามีสมชาย');

  // POV dynamism — same person different viewers
  test('POV=napa  then somchai = ปู่สมชาย');
  test('POV=arun  then somchai = พ่อสมชาย');
  test('POV=orawan then somchai = พ่อสมชาย');

  // Self
  test('napa → napa = ฉัน');

  // Unrelated fallback
  test('napa → unknown_id returns null');
});
```

### Unit: `tests/unit/layout.test.ts`

```ts
describe('layoutTree (base)', () => {
  test('positions all 16 Wongsuriya people');
  test('gen 0 (kan+malee) centered at W/2');
  test('couples are adjacent (spouse.x within 120px of partner.x)');
  test('each generation has a consistent y-coord');
});

describe('layoutTree with lineage expansion', () => {
  test('expanding pranom places 4 ancestors above her bridge position');
  test('lineage nodes get renderId prefix "L:pranom:"');
  test('lineage edges connect bridge to immediate parents');
  test('unexpanded lineages produce empty lineageNodes array');
});
```

### Unit: `tests/unit/tokens.test.ts`

```ts
describe('HMAC tokens', () => {
  test('sign + verify round-trips');
  test('tampered token fails verify');
  test('expired token fails verify');
  test('token hash is constant-time compared');
});
```

### Integration: `tests/integration/auth.test.ts` (miniflare + in-memory D1)

```ts
describe('magic-link auth flow', () => {
  test('POST /api/auth/request stores hashed token in auth_tokens table');
  test('POST /api/auth/request rate-limits to 3 per hour per email');
  test('GET  /api/auth/verify?tk=<valid> creates session + sets cookie');
  test('GET  /api/auth/verify?tk=<used> fails (single-use)');
  test('GET  /api/auth/verify?tk=<expired> fails after 15min');
  test('GET  /api/auth/me returns 401 without cookie, user with cookie');
  test('POST /api/auth/logout clears session row and cookie');
  test('cookie has HttpOnly, Secure, SameSite=Lax, Path=/');
});
```

### Integration: `tests/integration/tree-api.test.ts`

```ts
describe('tree API — demo tree (anonymous)', () => {
  test('GET /api/tree/wongsuriya returns seeded 16-person dataset');
  test('POST /api/tree/wongsuriya/people → 401 without session');
  test('GET  /api/img/:demo-photo-key → 200 (demo tree serves public images)');
});

describe('tree API — user tree', () => {
  test('POST /api/tree creates tree owned by current user');
  test('non-owner GET returns 403 if is_public=false');
  test('editor can PATCH person they don\'t own');
  test('PUT /api/tree/:slug/overrides persists dx/dy per-user');
});
```

### Integration: `tests/integration/upload.test.ts`

```ts
describe('R2 upload flow', () => {
  test('POST /api/upload/presign rejects mime not in whitelist');
  test('POST /api/upload/presign rejects bytes > 2MB');
  test('POST /api/upload/presign rejects without auth');
  test('returned URL is valid SigV4 PUT good for 5min');
  test('POST /api/upload/finalize verifies object exists in R2');
  test('POST /api/upload/finalize sniffs magic bytes (rejects renamed .exe)');
});
```

---

## Implementation Steps (parallel-friendly)

Legend: **[S]** = serial (blocks downstream), **[P-α]** = parallel group α (all items run at once).

### Phase 0: Scaffold **[S]** — one agent, ~30min
0.1  `pnpm init` + install deps (react, react-dom, vite, @vitejs/plugin-react, @cloudflare/vite-plugin, hono, drizzle-orm, drizzle-kit, zod, @oslojs/crypto, aws4fetch, vitest, typescript)
0.2  `tsconfig.json` with `strict: true`
0.3  `wrangler.jsonc` with ASSETS, DB, PHOTOS, KV_RL bindings (names per `cloudflare-naming`)
0.4  `vite.config.ts` with `@cloudflare/vite-plugin`
0.5  `src/worker/index.ts` — minimal Hono app returning "hello"
0.6  `src/app/main.tsx` — minimal React mount
0.7  `pnpm dev` verified: Vite HMR works for frontend, Worker reloads for API
0.8  Create Cloudflare resources: `wrangler d1 create heritage-d1-main`, `wrangler r2 bucket create heritage-r2-photos`, `wrangler kv namespace create heritage-kv-ratelimit` — record IDs into `wrangler.jsonc`
0.9  Copy `styles.css` verbatim from prototype → `src/app/styles.css`
0.10 `.env.example` + `.dev.vars.example` committed; update via `env-sync` skill

### Phase 1: Data & typed kinship **[P-A]** — 3 agents in parallel

**Agent A1 — DB schema + migrations + seed**
- Write `src/db/schema.ts` (all tables above)
- Write `drizzle.config.ts`
- Generate first migration: `pnpm drizzle-kit generate`
- Write `src/worker/lib/seed.ts` — Wongsuriya demo from `/tmp/design_bundle/family-tree/project/data.js` translated to inserts
- Write `scripts/seed-demo.ts` — idempotent CLI (checks if `trees.slug='wongsuriya'` exists first)
- Apply migrations locally: `wrangler d1 migrations apply heritage-d1-main --local`
- Run seed; confirm 16 people + 4 lineages present
- Files locked: `src/db/**`, `drizzle.config.ts`, `drizzle/**`, `scripts/seed-demo.ts`

**Agent A2 — Ported kinship.ts + tests**
- Write `tests/unit/kinship.test.ts` FIRST (copy spec from above)
- Write `src/app/lib/kinship.ts` — port `computeRelation` from `tree-view.jsx` with TypeScript types
- Include the full paternal/maternal path tracking, nick suffix, shortened sibling/cousin forms
- Write `src/app/lib/types.ts` — Person, Tree, Relation, Story, Memo, Lineage
- Write `tests/fixtures/wongsuriya.ts` — the test dataset
- Get ALL tests green before returning
- Files locked: `src/app/lib/kinship.ts`, `src/app/lib/types.ts`, `tests/unit/kinship.test.ts`, `tests/fixtures/**`

**Agent A3 — Ported layout.ts + tests**
- Write `tests/unit/layout.test.ts` FIRST
- Port `layoutTree` + `layoutBaseTree` from `tree-view.jsx` → `src/app/lib/layout.ts` with TS types
- Files locked: `src/app/lib/layout.ts`, `tests/unit/layout.test.ts`

### Phase 2: Worker API **[P-B]** — 3 agents in parallel (depends on Phase 1 for schema types)

**Agent B1 — Auth**
- `src/worker/lib/tokens.ts` + test
- `src/worker/lib/email.ts` (Resend wrapper)
- `src/worker/routes/auth.ts` — request / verify / logout / me
- `src/worker/middleware/session.ts`
- `src/worker/middleware/rate-limit.ts`
- `src/worker/middleware/csrf.ts`
- Integration test: `tests/integration/auth.test.ts` must pass
- Files locked: `src/worker/lib/{tokens,email}.ts`, `src/worker/routes/auth.ts`, `src/worker/middleware/**`

**Agent B2 — Tree CRUD**
- `src/worker/routes/tree.ts` — GET/POST/PATCH/DELETE
- `src/shared/schemas.ts` — Zod schemas
- Permissions: owner / editor / viewer / anon-to-public-tree
- Integration test: `tests/integration/tree-api.test.ts` must pass
- Files locked: `src/worker/routes/tree.ts`, `src/shared/schemas.ts`

**Agent B3 — Upload & image proxy**
- `src/worker/lib/r2-presign.ts` — aws4fetch SigV4
- `src/worker/routes/upload.ts` — presign + finalize (with magic-byte sniff)
- `src/worker/routes/img.ts` — gated GET proxy
- Integration test: `tests/integration/upload.test.ts` must pass
- Files locked: `src/worker/lib/r2-presign.ts`, `src/worker/routes/{upload,img}.ts`

### Phase 3: Frontend integration **[P-C]** — 3 agents in parallel (depends on Phase 1 for lib, not Phase 2 — can mock API)

**Agent C1 — TreeCanvas & nodes**
- Port tree-view.jsx to `src/app/components/TreeCanvas.tsx`, `PersonNode.tsx`
- Keep pan/zoom, drag, lineage expansion, highlight path
- Position overrides: localStorage first; later sync to server via `useUpload` pattern
- Files locked: `src/app/components/{TreeCanvas,PersonNode}.tsx`

**Agent C2 — Drawer, sidebar, pill, tweaks**
- Port panels.jsx to `ProfileDrawer.tsx`, `PathFinder.tsx`, `Tab.tsx`
- Port sidebar pieces from `Family Tree.html` to `Sidebar.tsx`, `ActiveViewPill.tsx`, `TweaksPanel.tsx`
- DROP `MergeDrawer` entirely per user
- Files locked: `src/app/components/{ProfileDrawer,PathFinder,Tab,Sidebar,ActiveViewPill,TweaksPanel}.tsx`

**Agent C3 — App shell, pages, routing, API client**
- `src/app/App.tsx` with React Router (use hash router — zero config with SPA fallback)
- Pages: Landing, TreeView (wraps canvas+sidebar+drawer), Login, AuthVerify
- `src/app/lib/api.ts` — typed fetch wrappers
- `src/app/hooks/{useTree,useSession,useUpload}.ts`
- Files locked: `src/app/{App.tsx,main.tsx}`, `src/app/pages/**`, `src/app/hooks/**`, `src/app/lib/api.ts`

### Phase 4: Integration & verification **[S]** — main agent

4.1  `pnpm dev` — navigate to `/demo/wongsuriya`, confirm tree renders identically to prototype (side-by-side visual check)
4.2  Test POV switching, drag, theme toggle, profile drawer
4.3  Test auth flow end-to-end: request magic link (stub email in dev), click verify, create own tree
4.4  Upload a photo to a person; confirm it appears in profile drawer
4.5  Run full test suite: `pnpm test` green
4.6  `pnpm typecheck` clean
4.7  `wrangler deploy --dry-run` succeeds
4.8  Hand to `frontend-test` skill for MCP Playwright test pass

---

## Security Considerations

Per `references/security-checklist.md`:

- [ ] **Parameterized queries** — Drizzle enforces; never string-concat SQL
- [ ] **Zod at every boundary** — `src/shared/schemas.ts` validated in each route before DB
- [ ] **HttpOnly + Secure + SameSite=Lax cookies** — no `document.cookie` access from JS
- [ ] **CSRF** — `Origin` header check on all mutations + CSRF token in session cookie pattern
- [ ] **File upload** — MIME whitelist (image/jpeg,png,webp), 2MB cap, magic-byte post-upload verification
- [ ] **Path traversal in R2 keys** — keys generated server-side as ULID + deterministic suffix, never user-controlled
- [ ] **Rate limiting** — magic-link: 3/hour/email + 10/hour/IP; upload-presign: 30/hour/user
- [ ] **Session rotation** on login (new token_hash, old invalidated)
- [ ] **Token hashing** — magic-link tokens stored as SHA-256 (Web Crypto), never plaintext
- [ ] **Constant-time comparison** — use `@oslojs/crypto` `constantTimeEqual`
- [ ] **CSP header** — `default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com`
- [ ] **No secrets in client** — R2 access keys, session HMAC secret via `wrangler secret` (CF Email needs no secret — it's a binding)
- [ ] **Email binding scope** — `send_email` binding uses `remote: true`; in CI tests we swap it for an in-memory stub; dev mode can route to console.log via env flag `EMAIL_DEV_STUB=1`
- [ ] **Image serving gated** — non-demo images require matching session → tree_membership
- [ ] **Error messages generic** — "invalid or expired token" not "token not found"
- [ ] **Session IP/UA binding** — soft check; log mismatches for audit, don't force logout
- [ ] **Env vars for all config** — `RESEND_API_KEY`, `APP_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`; synced to `.dev.vars.example` via `env-sync` skill

### Specific gotchas
- D1 doesn't have interactive transactions — use `db.batch([...])`; design multi-write ops to fit in one batch array, or accept eventual consistency on non-critical paths
- R2 SigV4 presign: the signed `Content-Type` MUST match what the browser sends, or R2 rejects. Client-side must not let the user override
- Demo tree image serving: public but rate-limited via KV to prevent hotlinking
- WebCrypto is sync-incompatible with some libs that expect Node `crypto` — prefer `@oslojs/crypto` everywhere

---

## Parallel Execution Map

```
Phase 0 (scaffold) ──► Phase 1 ──► Phase 2 ──► Phase 4
                        │          │
                        │          └► Phase 3 (can start as soon as Phase 1 ships types)
                        │
                        ├── A1: DB + seed       ──► B2 depends on this
                        ├── A2: kinship.ts      ──► C1, C2 depend on this
                        └── A3: layout.ts       ──► C1 depends on this

Phase 2 agents (B1, B2, B3) run concurrently; file locks prevent collision.
Phase 3 agents (C1, C2, C3) run concurrently; same.
```

Main agent (Opus) coordinates, reviews each sub-agent's return, and only advances the phase when ALL of a phase's tests pass.

---

## Success Criteria

- All unit tests pass, including every case in `kinship.test.ts`
- `/demo/wongsuriya` renders identical to prototype — eyeball diff acceptable if no user-reported differences
- Unauthenticated user can browse demo; cannot edit
- Authenticated user can: create own tree, add/edit people, upload photo, toggle lineage
- Drag persists across reload (localStorage for anon, server for authed)
- `wrangler deploy` succeeds against a throwaway CF account
- Lighthouse score ≥ 90 Performance on `/demo/wongsuriya`
- No console errors/warnings in normal navigation (per `frontend-test` skill standard)

---

## Frontend Test Scenarios (`frontend-test` Phase 1 — added 2026-04-19 08:30)

Tested against **https://heritage.jairukchan.com** (production). "Code owner" rule: any warning/error found must be fixed, even if pre-existing.

### Pages to cover
| Page | URL | Notes |
|---|---|---|
| Landing | `/` | Two CTAs |
| Demo tree | `/demo/wongsuriya` | Public, anon-browsable |
| Tree (by slug) | `/tree/wongsuriya` | Same data, auth-flag path |
| Login | `/login` | Magic-link form (send will 5xx until Email onboarded — acceptable for FE test) |
| AuthVerify fallback | `/auth/verify?err=invalid` | Error state |
| 404 | `/this-does-not-exist` | NotFound |

### Interactions on TreeView (main surface)

1. **Sidebar search**: type "นภา" → list filters to 1 result
2. **People list click**: click "สมชาย" → drawer opens with สมชาย profile
3. **POV pill change**: select "อรุณ" → labels flip ("ปู่สมชาย" → "พ่อสมชาย")
4. **POV pill reset** (↺): click → returns to นภา (isMe)
5. **Tree pan**: mouse-drag empty space → tree translates
6. **Tree wheel zoom**: scroll → scale changes (0.5–2.5 range)
7. **Zoom buttons** (+/−/⟲): each works
8. **Node drag**: drag a node → position override, `localStorage['heritage-node-overrides']` updated
9. **Reset positions**: "รีเซ็ต" button appears after drag → click → overrides cleared
10. **Node click**: selects → drawer opens
11. **Upstream button** on external person (วิภา, ประนอม, ดาริน, ธนา): click → lineage expands above bridge with dashed leaf-green edges
12. **Upstream button click again**: lineage collapses
13. **ProfileDrawer tabs**: Family / Stories / Photos / Voice — all open/close correctly
14. **ProfileDrawer relation chips**: click → jumps to that person
15. **ProfileDrawer lineage-link panel**: for external people, "เปิดต้นสายบน tree" button toggles expansion
16. **Drawer close** (×): returns to tree
17. **PathFinder** (header button "◈ เราเกี่ยวกันยังไง?"): opens panel
18. **PathFinder target select**: pick "สมชาย" → shows "ปู่" relation + path length + orange highlighted path
19. **PathFinder close**: removes panel + highlights
20. **Tweaks button** (⚙ in header): opens tweaks panel
21. **Theme toggle**: switch to Forest → page turns green/dark; Blueprint → blue
22. **Node shape toggle**: Circle/Polaroid/Square — CSS class swaps
23. **Trunk toggle**: on/off toggles layoutStyle prop

### Interactions on Login
24. **Empty submit**: validation error client-side
25. **Valid email submit**: server returns 204 even if email can't actually send (idempotent — we don't leak account existence). Page shows "ส่งลิงก์แล้ว" success state.
26. **CSRF**: direct POST without Origin returns 403 (not tested via UI, covered by integration tests)

### Non-functional checks (every page)

- **Zero console errors** (per code-owner rule)
- **Zero console warnings** (per code-owner rule)
- **Thai fonts (Sarabun + Cormorant Garamond) load** — check computed font-family on a heading
- **Font fallback chain works** if Google Fonts CDN is slow (no FOUT flash to system font)
- **No network 4xx/5xx** on page load except intentional (image 404s only if seeded photos are referenced — we have photoCount but no uploaded files, so no img requests expected)
- **Screenshot each page**: capture for reference / visual regression baseline

### Known acceptable 5xx (NOT to be fixed here)

- `/api/auth/request` returns 5xx in production because CF Email Service domain not onboarded yet — acknowledged in post-ship todos, user will dashboard-onboard later

