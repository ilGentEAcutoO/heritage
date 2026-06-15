# Active Tasks

> Last updated: 2026-06-16 (resumed — workflow-work)
> Workstream: 06-ci-and-e2e-cleanup
> Plan: `instruction/work/plan.md` · Requirements: `instruction/work/requirements.md`

## Main Tasks

### TASK-001: Fix M4-T3 e2e console-error assertion (no masking)
- Status: ✅ tested (M4-T1..T4 pass locally; before/after proof done; silent-failure review = NOT MASKING)
- Assigned: Main agent (Opus)
- Completed: 2026-06-15 22:14
- Root cause: Chrome auto-logs "status of 400" resource error for the deliberately-mocked
  expired-link 400. App handles 400 gracefully (no app `console.error`). Same noise class
  as the existing 401/404 ignores.
- Fix: test-local filter in M4-T3 (drop the one expected 400), keep other specs strict.
- Files: `tests/e2e/10-magic-link.spec.ts`
- Parallel-safe with: TASK-002 (different files)
- Sub-tasks:
  - [x] Filter expected 400 resource-noise in M4-T3 errors assertion + comment
  - [x] Run M4-T3 locally against `vite dev` → pass (functional assertions intact)
  - [x] Before/after proof: temp assertion confirmed the 400 IS captured (filter not a no-op)
  - [x] M4-T1..T4 all pass (sibling regression check); T5 skipped (needs E2E_LOCAL_DB)
  - [x] Adversarial review (silent-failure-hunter): VERDICT NOT MASKING, no fix required

### TASK-002: Clear GitHub Actions node20 runtime deprecation
- Status: ✅ tested (CI run 27583339088 green on node24; ZERO annotations → node20 deprecation cleared)
- Completed: 2026-06-16
- Assigned: Main agent (Opus)
- Verified versions (GitHub API, all `using: node24`): checkout v6.0.3, setup-node v6.4.0,
  pnpm/action-setup v6.0.9, wrangler-action v4.0.0. wrangler-action v4 inputs (`apiToken`/
  `accountId`) confirmed unchanged via its action.yml at the v4.0.0 tag → drop-in.
- Files: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`
- Parallel-safe with: TASK-001
- Sub-tasks:
  - [x] ci.yml: checkout@v6, setup-node@v6 (node 22→24), pnpm/action-setup@v6
  - [x] deploy.yml: same + wrangler-action@v4
  - [x] typecheck (exit 0) + unit (415/415) green — no regression
  - [x] Push → CI green on node24 runtime (run 27583339088, success in 35s, 0 annotations)
  - [x] code-reviewer YAML review (Opus, re-run 2026-06-16): VERDICT SAFE TO PUSH, 5/5 PASS
  - NOTE: ci.yml proven on push; deploy.yml (workflow_dispatch only) NOT exercised by this
    push — its node24/wrangler-action@v4 changes verified offline + will run on next deploy

### TASK-003: Verify + finish
- Status: ✅ tested (RESUMED + COMPLETED 2026-06-16 via workflow-work)
- Completed: 2026-06-16
- Dependencies: TASK-001 ✅, TASK-002 🟢
- Resume checks (2026-06-16): git state matches RESUME CONTEXT (one WIP commit, clean tree,
  main +1/-0 vs origin). Re-verified action versions are current latest via gh api:
  checkout v6.0.3, setup-node v6.4.0, pnpm/action-setup v6.0.9, wrangler-action v4.0.0.
  No packageManager/engines/.nvmrc conflict; pnpm-lock.yaml present.
- Sub-tasks:
  - [x] Adversarial review — silent-failure-hunter on the test change (NOT MASKING)
  - [x] Adversarial review — code-reviewer on YAML (Opus): VERDICT SAFE TO PUSH, 5/5 PASS,
        no blocking issues (pnpm/action-setup@v6 keeps `version:` input; wrangler-action@v4
        apiToken/accountId unchanged + command defaults to deploy; lockfileVersion 9.0 matches)
  - [x] reset WIP commit → 3 proper conventional commits (test / ci / docs) via git-commit
  - [x] git-push origin main + monitor CI green on node24 (run 27583339088, 0 annotations)
  - [x] Update RESUME CONTEXT → session complete

## File Lock Registry

| File | Locked by | Task | Since |
|------|-----------|------|-------|
| _(none — all released at exit)_ | | | |

---

## RESUME CONTEXT

> Completed: 2026-06-16 — workstream 06 finished (resumed via workflow-work)

### Session state: ✅ COMPLETE — all tasks tested, pushed, CI green

No sub-agents running · no dev server · no file locks · working tree clean.

#### What shipped (commits on `main`, pushed to origin)
- `fdf9ba3` **test(e2e)** — M4-T3 magic-link: filter the deliberately-mocked expired-link
  400 console noise (app handles via error UI; silent-failure-hunter = NOT MASKING).
- `8ececd1` **ci** — node24 runtime bump: checkout@v6, pnpm/action-setup@v6 (version 9),
  setup-node@v6 (node 22→24) in ci.yml + deploy.yml; deploy.yml also wrangler-action@v4.
- `15be0de` **docs(work)** — archive workstream 05, add workstream 06 tracking docs.

#### Proof
- CI run **27583339088** = success in 35s on node24, **0 annotations** → node20 deprecation
  cleared. Steps green: checkout@v6, pnpm setup, node24, install --frozen-lockfile, typecheck,
  test, pnpm audit, both guard steps.
- Pre-push: Opus code-reviewer adversarial YAML review = SAFE TO PUSH (5/5 PASS).

#### Caveat (honest)
- `deploy.yml` is `workflow_dispatch`-only, so the push did NOT exercise it. Its node24 +
  wrangler-action@v4 changes are verified offline (versions current, inputs unchanged) and
  will get real exercise on the next manual Deploy run.

#### Open / next (not part of this workstream)
- GitHub reports 2 Dependabot advisories on default branch (1 high, 1 low) — see
  https://github.com/ilGentEAcutoO/heritage/security/dependabot
- Clean closeout available: run **workflow-end** to security-review + archive workstream 06.

