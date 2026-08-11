---
name: workflow-end
description: Complete session with security review and archiving. Use when user says "ตรวจสอบ", "จบงาน", "done", "เสร็จแล้ว", or when all tasks show tested status. Runs security checks, generates summary, and archives completed work.
---

# Workflow End

Complete work session with security review and archiving.

## Workflow

### 1. Verify all tasks complete

Check todos.md — all tasks must be ✅ tested. If incomplete → inform user, suggest workflow-work.

### 2. Final test suite

```bash
npm run test
npm run lint
npx tsc --noEmit
```

### 3. Security review

```bash
npm audit
grep -rn "password\|secret\|api_key\|token" src/ --include="*.ts" --include="*.vue" --include="*.js"
cat .gitignore | grep -E "\.env"
```

If issues found → create fix tasks, return to workflow-work.

### 4. Generate summary

Create `./instruction/work/session-summary-YYYYMMDD.md`:

```markdown
# Work Session Summary

> Completed: YYYY-MM-DD HH:mm

## Tasks Completed
| Task | Status | Coverage |
|------|--------|----------|
| TASK-001 | ✅ | 100% |

## Test Results
[unit, e2e, coverage]

## Security Review
[status, vulnerabilities, recommendations]

## Files Changed
[list of modified files]
```

### 5. Archive

```bash
NEXT=$(ls ./instruction/archive/ 2>/dev/null | grep -oE "^[0-9]+" | sort -rn | head -1 || echo 0)
DIR=$(printf "%03d" $((NEXT + 1)))-[plan-name]
mkdir -p ./instruction/archive/$DIR
cp ./instruction/work/{requirements,plan,todos,session-summary-*}.md ./instruction/archive/$DIR/ 2>/dev/null
```

### 6. Reset active work

Clear todos.md to empty state, remove plan.md / requirements.md from work/.

### 7. Report completion with archive location.
