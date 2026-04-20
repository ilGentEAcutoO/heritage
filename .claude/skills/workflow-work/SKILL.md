---
name: workflow-work
description: Implementation with sub-agent teams. Use when user approves plan, says "ลุย", "ทำเลย", "โอเคกับแพลน", "เริ่มเลย", "approved", "go ahead". Always creates a team of sub-agents for parallel execution — never work alone. Coordinates progress and ensures all tasks reach tested status.
---

# Workflow Work

Implement plan by assembling a team of sub-agents. **Never work alone.**

## Team Assembly

Main agent (Opus 4.6) acts as **coordinator** — it does NOT implement tasks directly. Instead:

1. Read plan and identify task groups
2. Spawn sub-agents for parallel execution
3. Coordinate, review, and make decisions
4. Handle blockers and user communication

## Model Selection for Sub-Agents

| Task Type | Model |
|-----------|-------|
| Standard implement/test | Sonnet 4.6 |
| Security review | Opus 4.6 |
| Architecture decisions | Opus 4.6 |
| Complex debugging | Opus 4.6 |
| Simple formatting/file ops | Sonnet 4.6 |

## Execution Pattern

```
Main Agent (Opus 4.6 - Coordinator)
├── Agent A (implement TASK-001)
├── Agent B (implement TASK-002)
└── Agent C (research/prepare TASK-003)

When Agent A finishes:
├── Agent D (test TASK-001)  ← cross-review
└── Agent A → picks up next task
```

## Change Request During Work

If user requests changes mid-work:

1. Pause current tasks
2. Switch to **workflow-plan** (amendment mode)
3. Update plan.md and todos.md
4. User confirms → resume

## Task Completion Flow

```
⚪ pending → 🔵 in-progress → 🟢 implemented → ✅ tested
                                      ↓
                              (another agent tests)
                                      ↓
                              Pass? → ✅ tested
                              Fail? → 🔵 back to fix
```

## Coordination Checklist

Before starting:
- [ ] Read plan.md and todos.md
- [ ] Identify parallel task groups
- [ ] Check file lock registry
- [ ] Spawn sub-agents with clear instructions

During work:
- [ ] Update todos.md on every state change
- [ ] Cross-review: agent A implements, agent B tests
- [ ] Handle blockers immediately
- [ ] Use relevant skills (env-sync, cloudflare-naming, etc.)

After all tasks:
- [ ] Full test suite
- [ ] frontend-test on changed pages
- [ ] Check conflicts/inconsistencies
- [ ] All tasks → ✅ tested
