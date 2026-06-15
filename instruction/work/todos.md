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
- Status: 🟢 implemented (code done + versions verified via GitHub API + typecheck/unit green; CI-on-push not yet verified)
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
  - [ ] Push → CI green on node24 runtime  ← REMAINING (needs push; outward-facing)
  - [ ] (interrupted) feature-dev:code-reviewer YAML review — rejected mid-run; versions
        were directly verified via `gh api` + action.yml `runs.using`, so low risk

### TASK-003: Verify + finish
- Status: 🔵 in-progress (RESUMED 2026-06-16 via workflow-work)
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
  - [ ] git reset --soft HEAD~1 → proper conventional commit(s) via git-commit skill
  - [ ] git-push + monitor CI green on node24 runtime  ← REMAINING (real Item-2 proof)
  - [x] Update RESUME CONTEXT

## File Lock Registry

| File | Locked by | Task | Since |
|------|-----------|------|-------|
| _(none — all released at exit)_ | | | |

---

## RESUME CONTEXT

> Exit time: 2026-06-15 22:15 (+07) — /workflow-exit
> Reason: user interrupted (requested save/stop)

### Session state: ⏸️ WORK ~90% DONE — saved as WIP commit, nothing in flight

No sub-agents running · no dev server (killed) · no file locks. All changes captured in
a single **WIP commit on `main`** (NOT pushed). Working tree clean after the WIP commit.

#### What's DONE & verified this session
- **Item 1 — M4-T3 console fix** ✅ fully done: surgical test-local filter for the
  deliberately-mocked 400 (Chrome resource-noise; app handles 400 via error UI, no app
  `console.error`). Proven: M4-T1..T4 pass locally; before/after temp-assertion confirmed
  the filter is meaningful; silent-failure-hunter verdict = **NOT MASKING, no fix needed**.
- **Item 2 — CI/Deploy node24 runtime bump** 🟢 code done & verified:
  - `ci.yml` + `deploy.yml`: checkout@v6, setup-node@v6 (node-version 22→24),
    pnpm/action-setup@v6 (version:9 kept), deploy.yml also wrangler-action@v3→v4.
  - Versions verified authoritative via `gh api .../releases/latest` + each action.yml
    `runs.using: node24`. wrangler-action v4 `apiToken`/`accountId` inputs unchanged.
  - typecheck exit 0 · unit 415/415 green.
- **Housekeeping**: archived completed workstream 05 → `instruction/archive/05-treeview-improvements/`
  (+ summary.md). Created workstream 06 docs (requirements/plan/todos).

#### REMAINING to fully close (2 steps)
1. **(optional) finish Item 2 YAML adversarial review** — the code-reviewer agent was
   interrupted. Versions already verified directly via GitHub API, so this is a nice-to-have.
2. **Commit properly + push + monitor CI** — current state is ONE `WIP:` commit. On resume:
   `git reset --soft HEAD~1` then make proper conventional commit(s) via **git-commit** skill
   (NO AI signature per CLAUDE.md #7), then **git-push** → watch the `CI` workflow go green on
   the node24 runtime (that's the real Item-2 proof). NOTE: ci.yml does NOT run e2e — Item 1
   was proven locally instead.

#### To resume: say "มีงานค้างไหม" or "continue"  → then "push" / "commit and push"

