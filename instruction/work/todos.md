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

## Done — Wave A + B + a11y sweep (2026-06-17 14:30) — typecheck 0 · 631 tests each wave
- [x] Wave A: phantom Sarabun/Cormorant fonts → Prompt; real generation count; tabular-nums; ellipsis
- [x] Wave B: <Modal> shell (focus-trap/ESC/restore/entrance) + .field-*/.segmented/.btn-danger + --danger tokens
- [x] Wave B: migrate CreateTreeDialog, ShareDialog, AddPersonDialog onto Modal (net -302 lines)
- [x] Wave B: ThemePicker/NodeStylePicker popovers tokenized (radius/shadow tokens, dead fallbacks dropped)
- [x] a11y: role=alert on errors + aria-live on status across all auth pages + Trees

## Wave C — mostly DONE (2026-06-17, all deployed)
- [x] ProfileDrawer re-tokenize → --danger tokens, stripped dead fallbacks, normalized radii, role=alert/aria-live
- [x] TweaksPanel re-skin to soft-modern + Thai labels + aria-pressed; ⚙ toggle aria-label
- [x] Dead CSS-variable fallback sweep app-wide (71 removed; the stale sage/tan palette is gone everywhere)

## Last polish layer — DONE (2026-06-17, deployed)
- [x] Auth slice: .auth-screen/.auth-card/.auth-title/.auth-tab/.auth-link + single <AuthLogo> across all 6 auth pages
      (resolves card radius/shadow + link-green + logo-stem drift; adds hover; verified live on prod /login + /signup)
- [x] Standalone pages: .menu/.menu-item/.tree-row classes; UserMenu/Trees/Landing off inline styles; JS-hover hacks removed

## Nothing outstanding in the audit plan. Optional future polish:
- [ ] Extract a real <Popover> primitive (the two pickers already work + are tokenized — low priority)
- [ ] Hero canvas: roving tabindex on nodes (only matters on very large trees) — see hero deferred list above
- [ ] (chore) emails in src/worker/lib/email.ts still use the old sage #6b8f5e brand colour — out of UI scope, decide separately

## File Lock Registry
| File | Locked by | Task | Since |
|------|-----------|------|-------|
| _(none)_ | | | |
