# SKILL: Agent Orchestrator (Quality)

<!-- Token Target: 800-1,000 tokens -->
<!-- Load When: Reviewing completed tasks, enforcing gates, promoting environments -->

## Lock Release Rules

```
WHEN task completes:
1. PR is created with changes
2. Locks remain until PR is merged
3. After merge: release all locks
4. Notify blocked tasks to re-check dependencies
```

## 3-Strike Rule

**Critical:** If the same task fails PR quality gates 3 times, escalate to human.

```
ATTEMPT 1: Agent creates PR → CI fails → Return to agent with errors
ATTEMPT 2: Agent fixes → CI fails → Return to agent with errors
ATTEMPT 3: Agent fixes → CI fails → ESCALATE TO HUMAN

HUMAN REVIEW receives:
- Task description
- All 3 failure logs
- Agent's attempted fixes
- Options: Fix manually | Guide agent | Reassign | Cancel
```

### Retry Tracking

```typescript
interface TaskRetryState {
  taskId: string;
  prNumber: number;
  attempts: Array<{
    attemptNumber: number;
    gatesFailed: string[];
    errorLogs: string[];
  }>;
  maxAttempts: 3;  // Hardcoded limit
}
```

## Orchestrator Commands

### Complete Task

```yaml
command: complete_task
input:
  task_id: string
  result: AgentResult

actions:
  1. Run quality gates
  2. IF gates pass:
     - Store artifacts
     - Create PR
     - Update status to 'completed'
     - Check for unblocked tasks
  3. IF gates fail:
     - Return to agent with errors
     - Update status to 'running'
     - Increment retry counter
```

### Promote Environment

```yaml
command: promote_environment
input:
  from: string  # dev, test, staging
  to: string    # test, staging, production

actions:
  1. Run appropriate quality gates
  2. IF gates pass:
     - IF to == 'production': REQUIRE human approval
     - ELSE: auto-promote
  3. IF gates fail:
     - Block promotion
     - Create bug tasks for failures
```

## Environment Promotion Summary

| From | To | Gates Required | Auto/Manual |
|------|-----|----------------|-------------|
| develop | dev | PR gates pass | Auto |
| dev | test | Smoke tests | Auto |
| test | staging | Integration tests | Auto |
| staging | production | E2E + Build verify + **Human approval** | **Manual** |

## Gate Failure Actions

| Gate | On Failure |
|------|------------|
| Lint/Type/Build/Unit | Return to agent |
| Security scan | Return to agent |
| Conflict check | Agent resolves |
| Integration/E2E | Create bug task |
| Human approval | Block until approved |
