# Summary — Workstream 07: Anonymous homepage = demo tree + top-right login button

> Completed: 2026-06-16 · Branch: main · Live on https://heritage.jairukchan.com/

## What shipped (commits on main)
- `49b2180` **feat(home)** — guests at `/` see the Wongsuriya demo tree in place (URL stays `/`);
  logged-in users keep the splash; TreeView header shows a visible "เข้าสู่ระบบ" `<Link>` (top-right)
  for guests, replacing the 👤 menu. Landing reduced to the logged-in splash.
- `af83936` **test** — rewrote 01-landing (S1 guest, +S1b logged-in), 11-user-menu (M1/M2 guest button,
  M4 updated, M5/M6 authenticated); added Home unit test + TreeView header assertions.
- `d302d41` / `b62bfe6` **docs(work)** — tracking.
- Bonus fix in `49b2180`: `useTree` starts in loading state → no "ต้นไม้ไม่พบ" flash on first paint.

## Proof
- typecheck 0 · unit 425/425 · Opus adversarial review PASS (14/14) · frontend-test (local) guest `/`.
- CI green (27585595350) · Deploy green (27585796678, first live exercise of ws06 wrangler-action@v4+node24).
- e2e vs PROD: 10/10 (guest S1/M1/M2 + logged-in S1b/M3/M4 + S9 regression guard).

## Key decisions
- Logged-in `/` keeps the splash (guest splash dropped); login control is a `<Link>` named "เข้าสู่ระบบ"
  (so 05-logout S9's post-logout role=link assertion stays green).
