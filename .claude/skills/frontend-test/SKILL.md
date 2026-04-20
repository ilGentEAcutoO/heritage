---
name: frontend-test
description: Frontend testing using MCP Playwright. Use when user says "test frontend", "ทดสอบหน้าเว็บ", "เทส UI", "check the page", or after making frontend code changes. Has two phases — plan (create test scenarios, add to plan.md/todos.md, wait for approval) and execute (run tests via MCP Playwright, fix all issues found). Acts as code owner who fixes ALL console warnings/errors.
---

# Frontend Test

Test frontend using MCP Playwright and **FIX ALL ISSUES** found.

## Two Phases

### Phase 1: Plan (if no test tasks exist)

1. Use agent team to analyze plan/tasks/codebase
2. Create test scenarios
3. Add scenarios to `./instruction/work/plan.md` and `./instruction/work/todos.md` (additive)
4. Show scenarios to user → **wait for approval**

### Phase 2: Execute (if test tasks exist or after approval)

Run tests via MCP Playwright. Three ways to trigger:
- `/frontend-test` again (detects pending test tasks → execute)
- `/workflow-work` (picks up test tasks with other work)
- Approve and say "ลุย" in same session

## Core Philosophy: Act as Code Owner

- Found a bug? Fix it.
- Found a warning? Fix it.
- Found an error you didn't cause? Still fix it.

## Test Goals

1. Changes work as requirement specifies
2. No warnings in browser console
3. No errors in browser console

## Execution Workflow

```
Navigate → Screenshot → Console Check → Fix Loop → Report
     ↑______________________________________|
            (repeat until all clear)
```

## Fix Loop

```
Found issue?
├── Yes
│   ├── Identify source file
│   ├── Check framework skills (.claude/skills/)
│   ├── Apply fix
│   └── Re-test → still issues? → repeat
└── No → ✅ Done
```

## MCP Playwright Commands

```
playwright_navigate: { url: "..." }
playwright_screenshot: {}
playwright_console: {}
playwright_click: { selector: "..." }
playwright_fill: { selector: "...", value: "..." }
playwright_select: { selector: "...", value: "..." }
playwright_hover: { selector: "..." }
playwright_evaluate: { script: "..." }
```

## Report Format

```markdown
# Frontend Test Report
> Tested: YYYY-MM-DD HH:mm

## Results
| Page/Component | Status | Issues Found | Fixed |
|---------------|--------|-------------|-------|
| /login | ✅ | 2 warnings | 2/2 |

## Fixes Applied
1. [file]: [what was fixed]
```
