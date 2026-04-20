---
name: git-push
description: Push, merge, and monitor GitHub Actions. Use when user says "push", "merge", "merge to [branch]". Supports merge chains (feature→develop→main). Monitors GitHub Actions until success, auto-fixes failures when possible.
---

# Git Push

Push and monitor CI/CD until success.

## Workflow

### 1. Push

```bash
git push origin [branch]
```

### 2. Check for GitHub Actions

```bash
ls .github/workflows/ 2>/dev/null
```

If workflows exist → monitor them.

### 3. Monitor Actions

```bash
gh run list --limit 3
gh run view [run-id]
gh run view [run-id] --log-failed  # if failed
```

### 4. Handle failures

```
Action failed?
├── Read error logs
├── Can fix automatically? → Fix → commit → push → re-monitor
└── Need user input? → Ask user (secrets, permissions, etc.)
```

Loop until success or user intervention needed.

## Merge Flow

When user says "merge to [branch]":

```bash
git checkout [target]
git merge [source]
git push origin [target]
# Monitor Actions on target branch
```

### Merge Chains

"merge to main" from feature branch:

```
feature → develop (push, monitor Actions)
    ↓ success
develop → main (push, monitor Actions)
    ↓ success
Done ✅
```

Wait for each stage to pass before proceeding.

## Commands Reference

```bash
gh run list --limit 5
gh run list --branch main --limit 5
gh run view <run-id>
gh run view <run-id> --log-failed
gh run rerun <run-id> --failed
gh run watch <run-id>
```
