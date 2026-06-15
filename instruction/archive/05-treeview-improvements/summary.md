# Summary: 05-treeview-improvements

> Archived: 2026-06-15 · Status: ✅ COMPLETE (shipped + prod-verified)

## What shipped
Two TreeView features + four bug fixes, all deployed to production.

- **Feature 1 — UserMenu**: dropdown in TreeView header (guest/auth/loading states,
  click-outside, Escape, full a11y). `src/app/components/UserMenu.tsx`.
- **Feature 2 — POV from ProfileDrawer**: "set active view" button/chip wired through
  `ProfileDrawer` → `TreeView`.

## Bug fixes found during verification (root-cause, not masked)
1. **CSS stacking trap** — `.app-header` z-index 3→11 so UserMenu dropdown renders
   above the open ProfileDrawer (z-index 10).
2. **displayName never reached client** — session middleware projected only
   `id/email/email_verified_at`; added `displayName` to session user + all 4 user
   responses + `HonoEnv.Variables.user` type.
3. **Windows dev tooling** — `scripts/seed-demo.ts`: `URL.pathname`→`fileURLToPath`,
   `execFileSync('pnpm')`→`shell:true` (Node 25 won't execFile `.cmd`).
4. **e2e D1 backchannel** — `tests/e2e/helpers/d1.ts`: hardcoded `--remote`→
   env-gated `--local` via `E2E_LOCAL_DB`.

## Also shipped
- **Security bump** (commit `bcd585d`): react-router-dom 7.14.2→7.17.0 (HIGH DoS,
  GHSA-8x6r-g9mw-2r78) + hono →4.12.25 (8 moderate). `pnpm audit --prod` clean.

## Verification
- unit 415/415 · typecheck clean · e2e 9/9 (local + prod) · MCP frontend-test clean.
- Deployed to prod (Deploy runs 27469049994, 27470955543); prod smoke 200/200/401.

## Commits
`6f2141d` (seed Windows) · `7b29221` (e2e local D1) · `36d7008`/`cf825c9` (docs) ·
`bcd585d` (security bump) · `6971136` (exit context) — plus the feature/bugfix commits
`c02ffaf..36d7008`.

## Follow-ups (carried into workstream 06)
- `10-magic-link M4-T3` e2e console-error assertion (pre-existing, from workstream 04).
- GitHub Actions on node20 action-runtime (deprecation) — bump to node24-runtime actions.

## Note on close-out
Security review was performed at ship time (workstreams 02/03 hardening still in force;
no new auth/data surfaces added beyond displayName projection, which was reviewed). This
archive was a lightweight move during the start of workstream 06; the full `workflow-end`
ceremony was not separately run because no new code shipped after prod-verification.
