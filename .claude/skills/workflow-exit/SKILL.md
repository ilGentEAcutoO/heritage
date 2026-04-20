---
name: workflow-exit
description: Emergency save before closing session. Use when user says "save", "บันทึก", "หยุดก่อน", "ปิดเครื่อง", "เดี๋ยวกลับมา", or needs to interrupt work unexpectedly. Saves all sub-agent states so work can resume later via workflow-todo.
---

# Workflow Exit

Emergency save for session interruption.

## Tell user: "อย่าปิด terminal จนกว่าจะเสร็จ!"

## Workflow

### 1. Signal all sub-agents to save

Each records: progress %, last action, modified files, current state, next steps, blockers.

### 2. Append RESUME CONTEXT to todos.md

```markdown
## RESUME CONTEXT

> Exit time: YYYY-MM-DD HH:mm
> Reason: [user request]

### Agent States
#### Agent-1: TASK-XXX
- Progress: X%
- Last action: ...
- Modified files: ... (staged/unstaged)
- Next step: ...
```

### 3. Stage uncommitted changes

```bash
git add -A
git stash save "workflow-exit: $(date +%Y%m%d-%H%M)"
# or: git commit -m "WIP: [summary]"
```

### 4. Release all file locks

### 5. Confirm save complete

```
✅ SAVE COMPLETE
================
Progress saved to: ./instruction/work/todos.md
Changes stashed/committed

To resume: "มีงานค้างไหม" or "continue"
Safe to close now.
```
