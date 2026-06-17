# Work Session Summary

> Completed: 2026-06-17 09:05
> Workstream: 15-optional-followups (goal: "/workflow-todo /workflow-work มีงานอะไรค้างบ้าง")
> Coordinator: Opus · Workers: Sonnet (impl) + Opus (adversarial review) — cross-review per workflow-work

## Context
workflow-todo found NO mandatory pending work (09–14 all shipped & live). User picked all 3 OPTIONAL
follow-ups. 15A + 15C built & shipped this session; 15B = this archive.

## Tasks Completed
| Task | Status | Proof |
|------|--------|-------|
| TASK-15A Mobile slide-out nav (≤820px) | ✅ SHIPPED | 601/601 · CI 27657268697 · Deploy 27657333104 · e2e 19-mobile-nav MN1-3 vs prod · desktop unchanged (real-browser) · commits a0a97db, 40315b6 |
| TASK-15C Per-tree node style (mirror theme) | ✅ SHIPPED | 630/630 · CI 27660558953 · prod D1 migrated 0008 · Deploy 27660604068 · e2e 20-node-style NS1-3 vs prod · VISUAL confirmed (Square→square nodes) · commit 02e7b8d |
| TASK-15B Archive 09–15 (this) | ✅ DONE | this summary + archived to instruction/archive/ |

## What shipped
- **15A**: hamburger toggle + off-canvas sidebar drawer ≤820px (was display:none). Slide from left + backdrop,
  close on select/ESC/backdrop, a11y (aria-expanded/controls, focus return, visibility:hidden when closed so
  it leaves tab order, prefers-reduced-motion). Header z-index:31 mobile-only so toggle stays live. Desktop
  unchanged. Files: TreeView.tsx, Sidebar.tsx, styles.css + unit + e2e 19.
- **15C**: per-tree `node_style` (circle/polaroid/square) persisted on tree meta, mirroring theme. Owner sets
  (PATCH /api/tree/:slug/node-style, owner-only/zod), non-owner ephemeral preview, ⚙ tweak = fallback.
  Precedence "Tree wins": effectiveNodeStyle = preview ?? meta.nodeStyle ?? tweaks.nodeShape, applied as a
  shape-* class on `.app` (mirrors theme's paletteStyle). D1 migration 0008. Files: schema.ts, tree-query.ts,
  shares.ts, api.ts, types.ts, NodeStylePicker.tsx (new), TreeView.tsx, TreeCanvas.tsx, useTweaks.ts,
  styles.css + integration + unit + e2e 20.

## Notable review catch (why cross-review mattered)
15C passed 626/626 tests but had a silent BLOCKER: `effectiveNodeStyle` drove only a DEAD TreeCanvas prop;
the real shape mechanism was `body.shape-*` set from the per-user tweak — so the feature had ZERO visual
effect (CSS bundle hash was unchanged). Opus adversarial review caught it; fix re-routed shape application to
the `.app` container (CSS `body.shape-*` → `.app.shape-*`), proven by changed CSS hash + e2e asserting the
rendered class + live visual check. 15A similarly had 2 review-driven fix rounds (z-index, a11y visibility).

## Test Results
- Unit/integration (vitest, node env — source-assertion + real persist/readback): 630/630, 58 files.
- typecheck: 0 errors. build: OK.
- e2e (Playwright vs PROD): 19-mobile-nav 3/3, 20-node-style 3/3, no console errors.

## Security Review
- pnpm audit --prod: No known vulnerabilities.
- No hardcoded secret literals in src/. .gitignore covers .env / .dev.vars.
- New PATCH /node-style route is owner-only (resolveOwnerTree) + zod enum-gated (no injection), mirrors theme.
- D1 migration 0008 additive + nullable (existing rows → NULL → tweak fallback; no data risk).

## Prior workstreams folded into this archive (already shipped in earlier sessions)
09 multi-tree epic (create/CRUD/sharing/photo/theme) · 12 abuse-hardening · 13 QA+theme-redesign+demo-preview
· 14 soft-modern UI redesign. All ✅ live on https://heritage.jairukchan.com.

## Optional future notes (only if user asks)
- 15A left mobile sidebar as a slide-out; no further nav work outstanding.
- Per-tree node style has no "reset to auto/null" picker option (YAGNI); null only as initial DB state.
