# Active Tasks

> Session goal (2026-06-17): "ทำยังไงให้ UI สวย + หา MCP ช่วย" → audited UI (workflow, 85 findings), root cause = inline-style drift.
> Phase 0 foundation SHIPPED (focus-visible ring, overflow scope, reduced-motion, index.html meta).
> Phase 3 hero tree-canvas overhaul SHIPPED + adversarially reviewed (3 lenses) + all real findings fixed.
> MCP decision: add Chrome DevTools MCP; skip Tailwind-based tools; use frontend-design + Playwright loop.

## Done — Hero tree canvas overhaul (2026-06-17)
- [x] TreeCanvas: Pointer Events (mouse/touch/pen) + pinch-zoom; replaced mouse-only handlers
- [x] TreeCanvas: zoom-to-cursor/center anchor (wheel via NATIVE non-passive listener — React onWheel is passive)
- [x] TreeCanvas: keyboard pan (arrows) + zoom (+/−) + reset (0) on focusable role=application canvas
- [x] TreeCanvas: useMemo edges/coupleLinks; 2→1 pinch hand-off to pan; screen-space drag threshold; pointer-register-before-control-return; suppressClick self-heal
- [x] PersonNode: transparent <button class=node-select> overlay (de-nests upstream toggle → no button-in-button); aria-label + aria-pressed; native Enter/Space
- [x] LineageNode: drag delegated; killed Cormorant serif (both nodes)
- [x] styles.css: touch-action:none; .node-select overlay
- [x] Verified: typecheck 0 · 631 unit tests · live zoom/pan/reset/click-select · wheel defaultPrevented · de-nest

## Deferred follow-ups (from adversarial review — not regressions)
- [ ] Roving tabindex on nodes (currently every node is a tab stop — fine at typical scale, "explodes" on huge trees)
- [ ] LineageNode keyboard a11y (currently drag-only/decorative)
- [ ] Move overrides localStorage write out of setState updater (dev-only StrictMode double-write; idempotent)
- [ ] onPointerLeave ends drag at canvas edge (matches old onMouseLeave behavior; pointer-capture would smooth it)

## Remaining UI plan (from the audit — not started)
- Phase 1: purge stale sage/tan fallbacks + phantom fonts (sweep); build shared <Modal>/<Popover>/Field UI kit
- Phase 2: auth-slice classes; ProfileDrawer re-tokenize + danger tokens; standalone pages off inline styles; TweaksPanel re-skin
- Quick wins: fabricated "4 generations" stat; aria-live sweep; tabular-nums

## File Lock Registry
| File | Locked by | Task | Since |
|------|-----------|------|-------|
| _(none)_ | | | |
