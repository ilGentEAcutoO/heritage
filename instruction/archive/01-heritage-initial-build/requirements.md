# Requirements: Heritage (Family Tree) — Cloudflare Workers App

> Captured: 2026-04-18 22:55 (+07)
> Source: Claude Design handoff bundle (`family-tree.tar.gz`) + user clarification

## Origin

User exported an iterated prototype from claude.ai/design ("บ้านวงศ์สุริยา / Heritage v0.3") — see `/tmp/design_bundle/family-tree/`. README requires pixel-perfect recreation in whatever tech fits target. Target repo was empty; user elected **Cloudflare Workers** stack.

## Raw user request

> "ฉันอยากทำ interactive family tree อ่ะ ให้ลูกหลานรู้จักญาติตัวเองอะไรแบบนี้ ให้น่าสนใจ สวย สนุก เก็บรูปได้ ? บันทึก tree ของตัวเองได้ merge tree ได้"

> (after prototype iteration, final clarification:)
> "ฉันใช้ worker เป็นหลัก ไม่ใช้ pages เลย ให้มันรองรับ worker ไปเลยครับ ส่วน base project นี้เล็ก ๆ ไปใช้ d1 ก็ได้มั้ง รูปก็อัปไป R2 ได้เลยถ้า login"

## Agreed Scope

### Tech stack
- [x] Cloudflare Workers (not Pages) — single worker serves API + static assets
- [x] D1 — primary datastore (tree data, users, sessions)
- [x] R2 — photo storage (upload gated behind login)
- [x] React frontend — keep prototype aesthetic 1:1
- [x] TypeScript everywhere (CLAUDE.md implied quality bar + security-checklist.md)
- [x] Vite build for React (pre-compile JSX, drop Babel-in-browser cost)
- [x] Hono or plain Worker fetch handler for API routes (TBD in plan)

### Feature parity with prototype (shipped state from chat transcript)

- [x] **Organic tree view**: SVG branches, pan/zoom, node drag with localStorage persistence
- [x] **POV system**: default to "me" person; paternal/maternal-accurate Thai kinship labels (ปู่/ตา, ย่า/ยาย, ลุง/อา/น้า) computed via graph traversal
- [x] **External lineage inline expansion** (the iteration that replaced popover)
- [x] **Profile drawer**: Family / Stories / Photos / Voice tabs
- [x] **Path finder** ("เราเกี่ยวกันยังไง?")
- [x] **Themes**: paper / forest / blueprint
- [x] **Node shapes**: circle / polaroid / square
- [x] **Tweaks panel** + edit-mode postMessage protocol
- [x] **Sidebar**: search + people list + stats + legend
- [ ] ~~Merge drawer~~ — deprecated by user in chat, do NOT port

### New scope beyond prototype (Workers + D1 + R2)
- [x] **Anonymous view**: unauthenticated users can browse the demo Wongsuriya tree
- [x] **Auth gate**: editing tree / uploading photos requires login
- [x] **D1 schema**: normalize people, relations (parents, spouse), stories, memos, lineages, users, sessions, tree_memberships, node_position_overrides
- [x] **R2 photo upload**: validated uploads (type+size), served via Worker-proxied URL or R2 public bucket
- [x] **Session management**: HttpOnly cookie, Secure, SameSite=Lax

### Explicitly deferred
- [ ] Voice memo recording (UI placeholder only — keeps striped waveform)
- [ ] AR/map views
- [ ] Birthday reminders / notifications
- [ ] True merge-tree flow (user killed it — handled by inline lineage expansion instead)
- [ ] Multi-tree UI (see open questions below)

## Technical Decisions (pending user confirmation on 3 items)

| Decision | Chosen | Rationale |
|---|---|---|
| Static serving | Worker `assets` binding (Static Assets) | No Pages; matches user's "worker เป็นหลัก" |
| API framework | **Hono** | ~12KB, native Workers support, clean route/middleware model |
| Frontend build | **Vite + React 18 + TypeScript** | Drops 300KB Babel-standalone runtime |
| Styling | Keep prototype's plain CSS verbatim | Pixel-perfect mandate from README |
| ORM / DB layer | **Drizzle ORM** with D1 adapter | Type-safe, lightweight, migrations via drizzle-kit |
| Validation | **Zod** | security-checklist.md line 12 |
| Auth method | **Email magic link via Cloudflare Email Service** (`send_email` binding + D1 tokens + D1 sessions) | User picked CF Email over Resend; keeps stack fully inside Cloudflare; has official magic-link example. **Requires Workers Paid plan ($5/mo)** + beta service |
| Custom domain | **`heritage.jairukchan.com`** | Worker route binding + source for `from:` in magic-link emails (`noreply@jairukchan.com`) |
| Tree ownership model | **Per-user trees + public demo** | Demo at `/demo/wongsuriya` read-only anonymous; logged-in users own their own tree(s) |
| Seed strategy | **Demo tree seeded separately** | Wongsuriya demo seeded via migration; `users` table starts empty; real users create their own tree on signup |

## Cloudflare Resource Names (per cloudflare-naming skill)

| Resource | Name |
|---|---|
| Worker | `heritage-worker-api` |
| D1 (main) | `heritage-d1-main` |
| R2 (photos) | `heritage-r2-photos` |
| KV (rate limit) | `heritage-kv-ratelimit` |
| Email binding | `EMAIL` (send_email with `remote: true`) |
| Route | `heritage.jairukchan.com/*` |
| Email sender | `noreply@jairukchan.com` (onboarded via Email Service) |

## Security Posture

Following `references/security-checklist.md`:
- Parameterized queries (Drizzle enforces)
- Zod validation at every API boundary
- File upload: MIME sniff + size cap (2MB) + content-type whitelist (image/jpeg, image/png, image/webp)
- HttpOnly + Secure + SameSite=Lax cookies; session rotation on privilege change
- CSP header, no inline scripts once Babel is gone
- Rate limiting on auth + upload endpoints (KV counter or Durable Object)
- No secrets in client; all env via `wrangler.toml` / `.dev.vars`
- CORS: same-origin only (worker serves both frontend + API)
