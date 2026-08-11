---
name: workflow-plan
description: TDD planning with research and security-first approach. Use when user says "วางแผน", "plan", "อยากทำ...", "เพิ่มฟีเจอร์...", or when change request detected during work. Supports amendment mode for mid-work changes. Creates plan.md and todos.md with parallel-friendly task structure.
---

# Workflow Plan

Plan with TDD, research, and security-first approach.

## Modes

**New Plan:** Full planning from scratch
**Amendment:** Mid-work change request — analyze impact, update existing plan

## Workflow

### 1. Capture Requirements

Save user request to `./instruction/work/requirements.md` with timestamp.

### 2. Research

Use sub-agents to research in parallel:
- Context7 / llm.txt for framework docs
- MCP tools for platform-specific info
- Existing codebase analysis

### 3. Discussion

Ask clarifying questions. Record decisions in requirements.md:

```markdown
## Agreed Scope
- [x] Feature A
- [x] Feature B
- [ ] Feature C (deferred)

## Technical Decisions
- Auth: JWT + refresh token
- Storage: D1 database
```

### 4. Create TDD Plan

Write `./instruction/work/plan.md`:

```markdown
# Plan: [Feature Name]

> Created: YYYY-MM-DD HH:mm

## Architecture
[High-level design]

## Test Specifications
[Tests FIRST — what must pass before code is done]

## Implementation Steps
[Ordered, parallel-friendly]

## Security Considerations
[From security-checklist.md reference]
```

### 5. Generate Tasks

Write tasks to `./instruction/work/todos.md`:

```markdown
# Active Tasks

> Last updated: YYYY-MM-DD HH:mm

## Main Tasks

### TASK-001: [Name]
- Status: ⚪ pending
- Assigned: -
- Sub-tasks:
  - [ ] Implement [component]
  - [ ] Write tests
  - [ ] Integration test

### TASK-002: [Name]
- Status: ⚪ pending
- Dependencies: TASK-001

## File Lock Registry

| File | Locked by | Task | Since |
|------|-----------|------|-------|
```

### 6. Design for parallel execution

Group tasks so multiple sub-agents can work simultaneously. Mark dependencies explicitly.

## Amendment Mode

When change request during workflow-work:

1. Pause current work
2. Analyze impact on existing plan
3. Update plan.md (mark amendments)
4. Add/modify tasks in todos.md
5. Add new test specs
6. User confirms → resume workflow-work
