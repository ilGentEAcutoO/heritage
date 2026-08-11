---
name: workflow-todo
description: Check and load pending tasks from previous sessions. Use when user asks "มีงานค้างไหม", "status", "continue", "ทำต่อ", "สถานะงาน", or at the start of any new session. Reads ./instruction/work/todos.md and loads tasks into active context. Detects interrupted sessions from RESUME CONTEXT blocks.
---

# Workflow Todo

Load pending tasks and detect interrupted sessions.

## Workflow

### 1. Check for existing tasks

```bash
cat ./instruction/work/todos.md 2>/dev/null || echo "No todos found"
```

### 2. Parse and display status

Read todos.md, count tasks by status:

| Icon | Status | Meaning |
|------|--------|---------|
| ⚪ | pending | Not started |
| 🔵 | in-progress | Currently working |
| 🟢 | implemented | Code done, needs test |
| ✅ | tested | Fully complete |
| ❌ | blocked | Has blocker |

### 3. If tasks exist, ask user

```
Options:
1. Continue pending tasks → use workflow-work skill
2. Start fresh (archive old) → use workflow-plan skill
3. View task details
```

### 4. If RESUME CONTEXT exists

Previous session was interrupted. Show:

```
⚠️ INTERRUPTED SESSION DETECTED

Last exit: [timestamp]
Progress at exit:
- TASK-001: 75% - [last action]
- TASK-002: 100% - waiting for test

Resume from where you left off?
```

### 5. If no tasks

```
ไม่มีงานค้าง พร้อมรับงานใหม่
→ Describe requirements for workflow-plan skill
```
