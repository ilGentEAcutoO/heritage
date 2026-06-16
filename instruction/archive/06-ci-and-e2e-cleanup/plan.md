# Plan: 06-ci-and-e2e-cleanup

> Created: 2026-06-15 22:07 (+07)

## Architecture
Two independent, low-blast-radius fixes. No shared files → fully parallel-safe.

| Item | Concern | Files | Risk |
|------|---------|-------|------|
| 1 | e2e test assertion (M4-T3 console) | `tests/e2e/10-magic-link.spec.ts` | low (test-only) |
| 2 | CI/Deploy action-runtime deprecation | `.github/workflows/{ci,deploy}.yml` | low–med (deploy = wrangler-action major bump, but manual + inputs unchanged) |

## Test Specifications (what must be green before "done")
1. `pnpm typecheck` → exit 0 (unchanged surface; sanity).
2. `pnpm test` (vitest) → 415/415 (no regression; neither change touches unit-tested code).
3. **Item 1 proof**: `E2E_BASE_URL=http://localhost:5173 pnpm e2e -g "M4-T3"` against a
   local `vite dev` → **pass** (was failing only on the console-error assertion).
   - All M4-T3 functional assertions still pass (error UI visible, retry href correct).
   - The expected 400 resource-noise is filtered; no other console error appears.
4. **Item 2 proof**: push → `CI` workflow run is **green** and its job logs show the
   node24 action runtime (no node20 deprecation warnings).

## Implementation Steps

### Item 1 — M4-T3 console filter (surgical)
Replace the bare `expect(consoleMsgs.errors).toEqual([])` in M4-T3 with a filter that
drops the single expected, self-mocked 400 resource-load message, plus an explaining
comment. Leave M4-T1/T2/T4/T5 untouched (they don't trigger a 4xx that escapes the
existing ignore list).

### Item 2 — action-runtime bump
- `ci.yml`: `actions/checkout@v4→v6`, `actions/setup-node@v4→v6` (`node-version: 22→24`),
  `pnpm/action-setup@v4→v6` (keep `version: 9`).
- `deploy.yml`: same three bumps + `cloudflare/wrangler-action@v3→v4`.

## Security Considerations
- No new runtime surfaces. Action bumps move to vendor-maintained node24 builds (security
  positive — node20 runtime is EOL-bound). wrangler-action v4 keeps the same secret inputs
  (`apiToken`/`accountId`); no secret-handling change.
- Test filter does not weaken detection: other specs keep strict 400 detection; only the
  one deliberately-mocked 400 in M4-T3 is tolerated.

## Verification & close-out
1. typecheck + unit (fast gate).
2. Local M4-T3 e2e (Item 1 proof).
3. YAML lint (actionlint if available, else structural review).
4. Adversarial code review (sub-agent) on the diff.
5. Commit (git-commit skill, no AI signature) → push (git-push skill) → monitor CI green.
