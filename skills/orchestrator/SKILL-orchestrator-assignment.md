# SKILL: Agent Orchestrator (Assignment)

<!-- Token Target: 1,000-1,200 tokens -->
<!-- Load When: Assigning tasks, decomposing requirements, project kickoff -->

## File Lock Protocol

### Lock Acquisition Rules

```
BEFORE assigning a task:
1. Get list of files the task will modify
2. Check if any file is currently locked
3. IF locked:
   - Check if lock holder is a dependency
   - IF dependency: mark task as BLOCKED, wait
   - IF not dependency: CONFLICT - escalate to human
4. IF not locked:
   - Acquire locks for all files
   - Assign task
```

### Lock Data Structure

```yaml
file_lock:
  path: string                  # File path
  locked_by: string             # Task ID holding the lock
  locked_at: timestamp          # When lock was acquired
  agent: string                 # Agent working on it
  branch: string                # Git branch for changes
```

### Conflict Resolution

```
IF conflict detected:
1. STOP both tasks
2. Create human question:
   - Which task has priority?
   - Should one wait for the other?
   - Should we merge and resolve conflicts?
3. Wait for human decision
4. Resume based on answer
```

## Task Decomposition Guidelines

When decomposing requirements:

1. **Identify outputs first** - What files will be created/modified?
2. **Map to agents** - Which specialist owns each output?
3. **Find dependencies** - What must complete before what?
4. **Parallelize** - Tasks with no shared files can run concurrently
5. **Add QA tasks** - Every feature needs tests

Keep tasks atomic. One agent, one responsibility, clear outputs.

## Orchestrator Commands

### Start Project

```yaml
command: start_project
input:
  name: string
  requirements: string
  constraints: string[]

actions:
  1. Create project record
  2. Decompose requirements into tasks
  3. Identify dependencies
  4. Queue initial tasks (those with no dependencies)
  5. Report plan to human for approval
```

### Assign Task

```yaml
command: assign_task
input:
  task_id: string

actions:
  1. Verify dependencies are met
  2. Acquire file locks
  3. Build context for agent
  4. Queue task for agent execution
  5. Update task status to 'queued'
```

### Handle Question

```yaml
command: handle_question
input:
  task_id: string
  question: Question

actions:
  1. Check for similar pending questions (batch)
  2. Assign priority based on blocking impact
  3. Queue for human review
  4. Update task status to 'waiting_human'
```

### Answer Question

```yaml
command: answer_question
input:
  question_id: string
  answer: string

actions:
  1. Record answer
  2. Resume blocked tasks with answer in context
  3. IF batch: apply answer to all related questions
```
