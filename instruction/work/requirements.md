# Requirements: 06-ci-and-e2e-cleanup

> Created: 2026-06-15 22:07 (+07)
> Source: user request — "แก้พวกนี้ให้จบเลย" (the two known/out-of-scope items
> carried over from workstream 05).

## User request (verbatim)
> แก้พวกนี้ให้จบเลย
> - 10-magic-link M4-T3 e2e — console-error assertion เก่าจาก workstream 04 (รอ triage แยก)
> - GitHub Actions ยังใช้ Node.js 20 (deprecation — ถูกบังคับเป็น Node 24 หลัง 2026-06-16) → งาน infra แยก

## Agreed Scope
- [x] **Item 1** — Make `10-magic-link.spec.ts` M4-T3 pass on its console-error
  assertion without masking a real app bug.
- [x] **Item 2** — Clear the GitHub Actions node20 action-runtime deprecation before
  the 2026-06-16 forced-migration date.

## Research findings (cross-checked against the live repo + GitHub API, 2026-06-15)

### Item 1 — root cause CONFIRMED (not an app bug)
- `Magic.tsx` calls `apiClient.consumeMagicLink()` → `api()` wrapper. On a 400 the
  wrapper `throw`s a typed `ApiError`; `Magic.tsx` `.catch()`es it and renders the
  error UI. **There is no `console.error` anywhere in the app path.**
- The console error captured by M4-T3 is Chrome's *automatic* resource-load message
  ("Failed to load resource: the server responded with a status of 400 (Bad Request)")
  emitted for the **deliberately-mocked** 400 from `/api/auth/magic/consume`.
- This is the same class of noise already whitelisted for 401/404 in
  `tests/e2e/helpers/console.ts` (`IGNORED_SUBSTRINGS`).
- Decision: **surgical, test-local filter** in M4-T3 (tolerate the one expected 400),
  NOT a global ignore — keeps the ~11 other specs strict against unexpected 400s.

### Item 2 — todo note was stale; real fix is action-runtime versions
- Both workflows already use `node-version: 22` (not 20). The deprecation is about the
  **action runtime** (`runs.using`), which `actions/checkout@v4` and
  `actions/setup-node@v4` declare as `node20`.
- Authoritative latest majors (GitHub API, 2026-06-15) — all confirmed `using: node24`:
  - `actions/checkout` → **v6.0.3**
  - `actions/setup-node` → **v6.4.0**
  - `pnpm/action-setup` → **v6.0.9** (keep `version: 9`)
  - `cloudflare/wrangler-action` → **v4.0.0** (inputs `apiToken`/`accountId` unchanged →
    drop-in for deploy.yml)
- Also bump `node-version: 22 → 24` (current LTS; local dev already runs Node 25, so 24
  is safe and matches the user's stated target).

## Technical Decisions
- **No masking**: M4-T3's other assertions (error UI visible, retry link href) stay
  intact; only the self-induced 400 resource-noise is filtered, with a comment.
- **Version pinning**: keep the repo's existing major-tag convention (`@v6` etc.), not
  full SHA pins.
- **Verification**: run M4-T3 locally against `vite dev` (route-mocked, no D1 needed) to
  prove green; push to trigger CI to prove the node24 runtime bump is green.

## Out of scope
- Full `workflow-end` security ceremony for workstream 05 (done lightweight; code was
  prod-verified).
- `@types/node` bump (^22) — harmless mismatch with runtime 24; left untouched.
