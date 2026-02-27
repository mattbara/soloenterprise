# SoloEnterprise — Full Task Flow

> Complete end-to-end flow from scope approval to agent task completion.
> Every step, every status transition, every guard documented.

---

## Visual Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         PHASE 1: SCOPE & APPROVAL                        │
│                                                                          │
│  ┌─────────────┐     ┌──────────────┐     ┌─────────────────────┐       │
│  │   Project    │────▶│   Scoper     │────▶│  Scope Review UI    │       │
│  │   Created    │     │   Agent      │     │  (Human Reviews)    │       │
│  │             │     │  Generates   │     │                     │       │
│  │  status:    │     │  scope doc   │     │  ┌───────┐ ┌─────┐ │       │
│  │  'draft'    │     │  + estimates │     │  │Approve│ │Reject│ │       │
│  └─────────────┘     └──────────────┘     │  └───┬───┘ └──┬──┘ │       │
│                                            └──────┼────────┼────┘       │
│                                                   │        │            │
│                                            ┌──────▼──┐  ┌──▼──────┐    │
│                                            │ Continue │  │  STOP   │    │
│                                            │ to       │  │  Flow   │    │
│                                            │ Phase 2  │  │  ends   │    │
│                                            └─────────┘  └─────────┘    │
└──────────────────────────────────────────────────────────────────────────┘

                                    │
                                    ▼

┌──────────────────────────────────────────────────────────────────────────┐
│                     PHASE 2: APPROVAL PIPELINE                           │
│                                                                          │
│  POST /api/scopes/{id}/approve                                          │
│                                                                          │
│  Step 2a: Link scope ↔ project (bidirectional)                          │
│           project.scopeId = scope.id                                     │
│           projectScope.projectId = project.id                            │
│           project.status → 'active'                                      │
│                                                                          │
│  Step 2b: Check worker status                                           │
│           getAllWorkerStatuses()                                          │
│           If all stopped → spawn `pnpm worker` (detached process)       │
│                                                                          │
│  Step 2c: Create orchestrator task                                       │
│           createTask(projectId, {                                        │
│             agentType: 'orchestrator',                                    │
│             priority: 'high',                                            │
│             context: { scopeId, scopeData, clientDocument }              │
│           })                                                             │
│                                                                          │
│  File: src/app/api/scopes/[id]/approve/route.ts                        │
└──────────────────────────────────────────────────────────────────────────┘

                                    │
                                    ▼

┌──────────────────────────────────────────────────────────────────────────┐
│                     PHASE 3: TASK CREATION & QUEUEING                    │
│                                                                          │
│  createTask() — packages/core/src/services/task-service.ts:59           │
│                                                                          │
│  1. Verify project exists in DB                                          │
│  2. INSERT into tasks table:                                             │
│     ┌─────────────────────────────────────┐                              │
│     │ status:      'queued'               │                              │
│     │ agentType:   'orchestrator'         │                              │
│     │ priority:    'high'                 │                              │
│     │ context:     { scopeData, ... }     │                              │
│     │ dependsOn:   []                     │                              │
│     │ attemptCount: 0                     │                              │
│     └─────────────────────────────────────┘                              │
│  3. Determine queue: 'orchestrator-tasks'                                │
│  4. Add job to Redis (BullMQ):                                           │
│     jobId: task-{uuid}-attempt-1                                         │
│     payload: { taskId, projectId, name, description, context }           │
│                                                                          │
│  Status: → QUEUED                                                        │
└──────────────────────────────────────────────────────────────────────────┘

                                    │
                                    ▼

┌──────────────────────────────────────────────────────────────────────────┐
│                     PHASE 4: WORKER PICKUP                               │
│                                                                          │
│  packages/core/src/worker.ts                                            │
│                                                                          │
│  `pnpm worker` process starts all agent workers:                        │
│  ┌───────────────────────────────────────────────────┐                  │
│  │ • createOrchestratorWorker()  → orchestrator-tasks │                  │
│  │ • createBackendWorker()       → backend-tasks      │                  │
│  │ • createFrontendWorker()      → frontend-tasks     │                  │
│  │ • createQAWorker()            → qa-tasks           │                  │
│  │ • createScoperWorker()        → scoper-tasks       │                  │
│  │ • createClientReporterWorker()→ client-reporter    │                  │
│  └───────────────────────────────────────────────────┘                  │
│                                                                          │
│  BullMQ auto-polls Redis queues. When a job is ready:                   │
│  → Worker emits 'active' event                                           │
│  → Calls processOrchestratorTask(job)                                    │
│                                                                          │
│  Heartbeat: every 10s                                                    │
│  Idle shutdown: 300s with no tasks                                       │
└──────────────────────────────────────────────────────────────────────────┘

                                    │
                                    ▼

┌──────────────────────────────────────────────────────────────────────────┐
│                     PHASE 5: ORCHESTRATOR EXECUTION                      │
│                                                                          │
│  packages/core/src/agents/orchestrator-agent.ts:184                     │
│                                                                          │
│  ┌─ GUARD: claimTaskForProcessing(taskId) ─────────────────────────┐    │
│  │  Atomic: UPDATE tasks SET status='running'                       │    │
│  │          WHERE id=taskId AND status='queued'                     │    │
│  │  If fails → return { noop: true } (another worker got it)       │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Status: QUEUED → RUNNING                                                │
│                                                                          │
│  Step 5a: Load orchestrator skills                                       │
│           loadSkillsForOrchestrator(description)                         │
│           → SKILL-orchestrator-core.md + action-specific layers          │
│                                                                          │
│  Step 5b: Build project context                                          │
│           buildOrchestratorContextWithDiff(projectId)                     │
│           → Active tasks, blocked tasks, questions, locks, scope data    │
│                                                                          │
│  Step 5c: Extract image requirements (if attached)                       │
│           extractImageRequirements(taskId)                                │
│                                                                          │
│  Step 5d: Circuit breaker check                                          │
│           If orchestrator has asked ≥ 5 question rounds:                 │
│           → Create escalation question                                   │
│           → Status: RUNNING → WAITING_HUMAN                              │
│           → STOP                                                         │
│                                                                          │
│  Step 5e: Model selection                                                │
│           selectOrchestratorModel()                                       │
│           Default: claude-opus-4-6                                        │
│                                                                          │
│  Step 5f: Call Claude API (streaming)                                    │
│           System prompt: skills + context (cached)                        │
│           User prompt: description + images + scope                      │
│           → Returns YAML with task decomposition                         │
│                                                                          │
│  Step 5g: Record cost                                                    │
│           recordAgentCost({ model, tokens, ... })                        │
│                                                                          │
│  Step 5h: Parse YAML response                                           │
│           parseOrchestratorOutput(responseText)                           │
│           → { tasks[], questions[], statusUpdates[], fileLocks[] }       │
│           If parse fails → Status: RUNNING → FAILED                      │
│                                                                          │
│  Step 5i: Check for questions from Claude                                │
│           If questions found:                                            │
│           → Insert question records in DB                                │
│           → Status: RUNNING → WAITING_HUMAN                              │
│           → STOP (wait for human answers)                                │
│                                                                          │
│  Step 5j: Execute commands                                               │
│           executeOrchestratorCommands(projectId, taskId, parseResult)     │
│           → Creates subtasks (see Phase 6)                               │
│                                                                          │
│  Step 5k: No-output guard                                                │
│           If 0 commands executed and no questions:                        │
│           → Create escalation question                                   │
│           → Status: RUNNING → WAITING_HUMAN                              │
│                                                                          │
│  Step 5l: Mark orchestrator task complete                                │
│           Status: RUNNING → COMPLETED                                    │
│                                                                          │
│  Possible outcomes:                                                      │
│  ┌──────────────┬──────────────┬──────────────┬──────────────┐          │
│  │  COMPLETED   │   FAILED     │ WAITING_HUMAN│ WAITING_HUMAN│          │
│  │  (subtasks   │  (YAML parse │ (questions   │ (circuit     │          │
│  │   created)   │   failed)    │  for human)  │  breaker)    │          │
│  └──────────────┴──────────────┴──────────────┴──────────────┘          │
└──────────────────────────────────────────────────────────────────────────┘

                                    │
                                    ▼

┌──────────────────────────────────────────────────────────────────────────┐
│                PHASE 6: COMMAND EXECUTOR (3-PASS SYSTEM)                  │
│                                                                          │
│  packages/core/src/agents/utils/orchestrator-command-executor.ts:88     │
│                                                                          │
│  ┌─ PRE-PASS 1: Agent Availability Filter ─────────────────────────┐    │
│  │  Available agents: ['backend', 'frontend', 'qa']                 │    │
│  │  Reject tasks for unavailable agents (devops, feedback)          │    │
│  │  Create human question for rejected tasks                        │    │
│  │  Strip rejected IDs from other tasks' dependency arrays          │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─ PRE-PASS 2: Deduplication ─────────────────────────────────────┐    │
│  │  Query existing child tasks under parent                         │    │
│  │  Build existingTaskNames set for skip check                      │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─ PASS 1: Insert Tasks ─────────────────────────────────────────┐     │
│  │  For each task in orchestrator YAML:                             │     │
│  │  INSERT into tasks table:                                        │     │
│  │  ┌───────────────────────────────────────┐                       │     │
│  │  │ status:       'pending'               │                       │     │
│  │  │ agentType:    'backend'|'frontend'|.. │                       │     │
│  │  │ dependsOn:    [] (empty for now)      │                       │     │
│  │  │ parentTaskId: orchestratorTaskId      │                       │     │
│  │  └───────────────────────────────────────┘                       │     │
│  │  Build idMapping: placeholder-ID → real-UUID                     │     │
│  │                                                                  │     │
│  │  Status: → PENDING                                               │     │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─ PASS 2: Resolve Dependencies ─────────────────────────────────┐     │
│  │  For each task:                                                  │     │
│  │  Map placeholder deps ("TASK-001") → real UUIDs                  │     │
│  │  UPDATE tasks SET dependsOn = [resolved UUIDs]                   │     │
│  │                                                                  │     │
│  │  Example:                                                        │     │
│  │  TASK-BLOG-001 (backend) → uuid-aaa                             │     │
│  │  TASK-BLOG-002 (frontend, depends on 001) → uuid-bbb            │     │
│  │  TASK-BLOG-003 (qa, depends on 001, 002) → uuid-ccc             │     │
│  │                                                                  │     │
│  │  After pass 2:                                                   │     │
│  │  uuid-aaa.dependsOn = []                                        │     │
│  │  uuid-bbb.dependsOn = [uuid-aaa]                                │     │
│  │  uuid-ccc.dependsOn = [uuid-aaa, uuid-bbb]                      │     │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─ PASS 3: Spec Generation + Queueing ───────────────────────────┐     │
│  │                                                                  │     │
│  │  Separate tasks into two groups:                                 │     │
│  │                                                                  │     │
│  │  ┌─────────────────────┐   ┌──────────────────────────┐         │     │
│  │  │ NO dependencies     │   │ HAS dependencies         │         │     │
│  │  │ (wave 1 tasks)      │   │ (blocked until deps done)│         │     │
│  │  │                     │   │                          │         │     │
│  │  │ 1. Batch generate   │   │ Stay in PENDING status   │         │     │
│  │  │    architect specs  │   │ Wait for dependency      │         │     │
│  │  │    (single API call)│   │ resolver to queue them   │         │     │
│  │  │                     │   │                          │         │     │
│  │  │ 2. enqueueTask()    │   │                          │         │     │
│  │  │    for each task    │   │                          │         │     │
│  │  │                     │   │                          │         │     │
│  │  │ PENDING → QUEUED    │   │ PENDING (waiting)        │         │     │
│  │  └─────────────────────┘   └──────────────────────────┘         │     │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─ POST-PASS: Rejected Tasks ────────────────────────────────────┐     │
│  │  If any tasks targeted unavailable agents:                       │     │
│  │  Create human question listing them (non-blocking)               │     │
│  └──────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘

                                    │
                                    ▼

┌──────────────────────────────────────────────────────────────────────────┐
│                     PHASE 7: ARCHITECT SPEC GENERATION                   │
│                                                                          │
│  packages/core/src/agents/utils/architect-spec-generator.ts:154         │
│                                                                          │
│  Called at TWO points:                                                   │
│  • PASS 3 of command executor (batch, for wave-1 tasks)                 │
│  • Dependency resolver (single, when blocked task becomes ready)         │
│                                                                          │
│  For each task:                                                          │
│  1. Skip if spec already exists                                          │
│  2. Select context profile (simple/database/full-feature/bug-fix)       │
│  3. Load dependency artifacts (if task has completed deps):              │
│     Read files from project-files/tasks/{depTaskId}/                      │
│     Summarize large files (API Surface Summary)                          │
│  4. Build prompt:                                                        │
│     - Task name, agent type, description, requirements                  │
│     - Dependency context blocks (what was built upstream)                │
│     - FOUNDATIONAL_TASK_NOTE for 0-dependency tasks                     │
│  5. Call Claude API (Opus model, 4096 max tokens)                       │
│  6. Save spec to task record: technicalSpec field                        │
│  7. Record cost                                                          │
│                                                                          │
│  Output: Technical specification stored on the task record               │
│  Used by: Agent during execution (injected into scaffold prompt)        │
└──────────────────────────────────────────────────────────────────────────┘

                                    │
                                    ▼

┌──────────────────────────────────────────────────────────────────────────┐
│                     PHASE 8: AGENT TASK EXECUTION                        │
│                                                                          │
│  (Same flow for backend, frontend, qa agents)                           │
│  Example: packages/core/src/agents/backend-agent.ts                     │
│                                                                          │
│  ┌─ GUARD: claimTaskForProcessing(taskId) ─────────────────────────┐    │
│  │  Atomic: UPDATE ... WHERE status='queued'                        │    │
│  │  + Dependency guard: verify all deps are 'completed'             │    │
│  │  If claim fails or deps not met → return { noop: true }         │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Status: QUEUED → RUNNING                                                │
│                                                                          │
│  Step 8a: Load skills                                                    │
│           loadSkillsForTask(agentType, description)                      │
│           ┌─────────────────────────────────────────┐                    │
│           │ Complexity classification:               │                    │
│           │   simple → core layer only (~1800 tok)  │                    │
│           │   database → core + patterns (~2600 tok)│                    │
│           │   newPattern → core + patterns + examples│                   │
│           └─────────────────────────────────────────┘                    │
│                                                                          │
│  Step 8b: Load codebase context                                          │
│           buildContextWithProfile(description)                            │
│           ┌─────────────────────────────────────────┐                    │
│           │ Profile selection (3-pass):              │                    │
│           │   Pass 1: Override keywords (short-circuit)│                  │
│           │   Pass 2: Positive signals               │                    │
│           │   Pass 3: Negative signals (demotion)    │                    │
│           │                                          │                    │
│           │   bug-fix:         60% token savings     │                    │
│           │   simple-endpoint: 35% token savings     │                    │
│           │   database-task:   25% token savings     │                    │
│           │   full-feature:    0% token savings      │                    │
│           └─────────────────────────────────────────┘                    │
│                                                                          │
│  Step 8c: Load architect tech spec (from task record)                    │
│                                                                          │
│  Step 8d: Generate scaffold                                              │
│           generateScaffold({ agentType, taskDescription, techSpec })      │
│           ┌─────────────────────────────────────────┐                    │
│           │ Backend:                                 │                    │
│           │   routes/endpoints → backend-route       │                    │
│           │   services/queries → backend-service     │                    │
│           │ Frontend:                                │                    │
│           │   forms → frontend-form                  │                    │
│           │   pages → frontend-page                  │                    │
│           │ QA:                                      │                    │
│           │   always → test-shell                    │                    │
│           │                                          │                    │
│           │ Produces:                                │                    │
│           │   • Pre-generated files with TODOs       │                    │
│           │   • Zod validation schemas               │                    │
│           │   • TypeScript types                     │                    │
│           │   • Import map (available imports)       │                    │
│           │   • Formatted prompt for Claude          │                    │
│           └─────────────────────────────────────────┘                    │
│                                                                          │
│  Step 8e: Build cached system prompt                                     │
│           Skills (cached) + context (dynamic)                            │
│                                                                          │
│  Step 8f: Call Claude API                                                │
│           Model: per agent config (Haiku for backend/frontend,          │
│                  Sonnet for QA)                                           │
│           System: cached skills + context                                │
│           User: scaffold prompt + tech spec + requirements               │
│           Max tokens: 16384                                              │
│                                                                          │
│  Step 8g: Parse agent output                                             │
│           parseAgentOutput(responseText)                                  │
│           → Extract <file> blocks → { path, content }[]                 │
│           → Extract questions (if any)                                   │
│                                                                          │
│  Step 8h: Handle questions (if any)                                      │
│           Insert question records in DB                                   │
│           Status: RUNNING → WAITING_HUMAN                                │
│           → STOP (wait for human answers, then re-queue)                 │
│                                                                          │
│  Step 8i: Write generated files                                          │
│           writeGeneratedFiles(taskId, files, agentType)                   │
│           ┌─────────────────────────────────────────┐                    │
│           │ Target: packages/project-files/          │                    │
│           │         tasks/{taskId}/                  │                    │
│           │                                          │                    │
│           │ Creates:                                 │                    │
│           │   • All generated source files           │                    │
│           │   • manifest.json (metadata)             │                    │
│           │                                          │                    │
│           │ SANDBOXED — cannot write outside         │                    │
│           │ the generated directory                  │                    │
│           └─────────────────────────────────────────┘                    │
│                                                                          │
│  Step 8j: Record cost                                                    │
│           recordAgentCost({ model, tokens, ... })                        │
│           → Insert into cost_tracking table                              │
│                                                                          │
│  Step 8k: Update task status                                             │
│           Status: RUNNING → COMPLETED                                    │
│           Store summary + artifact paths                                 │
│                                                                          │
│  Possible outcomes:                                                      │
│  ┌──────────────┬──────────────┬──────────────┐                         │
│  │  COMPLETED   │   FAILED     │ WAITING_HUMAN│                         │
│  │  (files      │  (Claude     │ (questions   │                         │
│  │   generated) │   error)     │  for human)  │                         │
│  └──────────────┴──────────────┴──────────────┘                         │
└──────────────────────────────────────────────────────────────────────────┘

                                    │
                                    ▼

┌──────────────────────────────────────────────────────────────────────────┐
│              PHASE 9: COMPLETION & DEPENDENCY RESOLUTION                  │
│                                                                          │
│  packages/core/src/worker.ts (event handlers)                           │
│  packages/core/src/services/dependency-resolver.ts                      │
│                                                                          │
│  ═══════════════════════════════════════════════                         │
│  ON TASK COMPLETED (worker.ts:107-130)                                  │
│  ═══════════════════════════════════════════════                         │
│                                                                          │
│  1. Publish SSE event: 'task-completed'                                 │
│  2. resolveCompletedDependency(taskId):                                  │
│     ┌──────────────────────────────────────────────────────────────┐    │
│     │ a. Verify task status is 'completed' in DB                    │    │
│     │    If not → delegate to handleFailedDependency()              │    │
│     │                                                               │    │
│     │ b. Find ALL pending tasks in same project                     │    │
│     │                                                               │    │
│     │ c. For each pending task whose dependsOn includes taskId:     │    │
│     │    - Check if ALL dependencies are 'completed'                │    │
│     │    - If ALL completed:                                        │    │
│     │      • Atomic: pending → queued                               │    │
│     │      • Generate architect tech spec (with dep artifacts)      │    │
│     │      • enqueueTask() → add to agent Redis queue               │    │
│     │    - If not all completed:                                    │    │
│     │      • Stay in PENDING, wait for more deps                    │    │
│     └──────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  3. unblockDependentTasks(taskId):                                       │
│     ┌──────────────────────────────────────────────────────────────┐    │
│     │ Secondary check for tasks in 'blocked' status                 │    │
│     │ (tasks that were blocked because a dep previously failed)     │    │
│     │                                                               │    │
│     │ For each blocked task whose context.blockedByTaskId matches:  │    │
│     │ - Check if ALL dependencies are now 'completed'               │    │
│     │ - If yes: blocked → queued, generate spec, enqueue            │    │
│     └──────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ═══════════════════════════════════════════════                         │
│  ON TASK FAILED (worker.ts:132-183)                                     │
│  ═══════════════════════════════════════════════                         │
│                                                                          │
│  1. Check if task status is 'waiting_human' in DB                       │
│     If yes → publish waiting event, return (no retry burned)            │
│                                                                          │
│  2. Check for rate limit error                                           │
│     If yes → handleRateLimit(), return (no retry burned)                │
│                                                                          │
│  3. Publish SSE event: 'task-failed'                                    │
│                                                                          │
│  4. handleFailedDependency(taskId):                                      │
│     ┌──────────────────────────────────────────────────────────────┐    │
│     │ Find all pending tasks that depend on failed task             │    │
│     │ For each:                                                     │    │
│     │   Status: PENDING → BLOCKED                                   │    │
│     │   context.blockedReason = "Dependency task {id} failed"       │    │
│     │   context.blockedByTaskId = failedTaskId                      │    │
│     └──────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ═══════════════════════════════════════════════                         │
│  ON TASK RETRY (task-queue.ts:212-293)                                  │
│  ═══════════════════════════════════════════════                         │
│                                                                          │
│  If attemptCount < maxAttempts (default 3):                              │
│     Status: FAILED → PENDING (reset for retry)                           │
│     attemptCount++                                                       │
│     → Dependency resolver will re-queue when appropriate                │
│                                                                          │
│  If attemptCount >= maxAttempts (3-strike rule):                         │
│     Status: FAILED → WAITING_HUMAN (escalate to human)                  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

                                    │
                                    ▼

┌──────────────────────────────────────────────────────────────────────────┐
│              PHASE 10: HUMAN INTERVENTION (when needed)                   │
│                                                                          │
│  Triggered when task enters WAITING_HUMAN status                        │
│                                                                          │
│  Causes:                                                                 │
│  • Agent asked a question (needs clarification)                         │
│  • 3-strike failure (task failed 3 times)                               │
│  • Orchestrator circuit breaker (5 question rounds)                     │
│  • No-output guard (orchestrator produced no useful output)             │
│                                                                          │
│  Human sees questions in dashboard UI                                    │
│  Human provides answers                                                  │
│                                                                          │
│  On answer:                                                              │
│  1. Question marked as answered in DB                                   │
│  2. Task re-queued with answer context:                                  │
│     Status: WAITING_HUMAN → QUEUED                                      │
│     jobId includes timestamp to prevent BullMQ dedup                    │
│  3. Agent picks up task with previous context + human answer            │
│  4. Flow returns to Phase 8 (agent execution)                           │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

---

## Complete Status Lifecycle

```
                                    ┌─────────┐
                                    │ PENDING  │ (created by orchestrator, has dependencies)
                                    └────┬─────┘
                                         │
                          ┌──────────────┼──────────────┐
                          │              │              │
                    All deps done   Dep failed    Manual queue
                          │              │              │
                          ▼              ▼              │
                    ┌──────────┐   ┌─────────┐         │
                    │  QUEUED  │◀──│ BLOCKED  │         │
                    └────┬─────┘   └─────────┘         │
                         │              ▲              │
                         │              │ (dep retried │
                         │              │  & completed)│
                         │              │              │
                         ▼                             │
                    ┌──────────┐                       │
                    │ RUNNING  │◀──────────────────────┘
                    └────┬─────┘
                         │
              ┌──────────┼──────────────┐
              │          │              │
              ▼          ▼              ▼
        ┌───────────┐ ┌────────┐ ┌──────────────┐
        │ COMPLETED │ │ FAILED │ │WAITING_HUMAN │
        └───────────┘ └───┬────┘ └──────┬───────┘
                          │             │
                          │             │ (human answers)
                          │             ▼
                          │        ┌──────────┐
                          │        │  QUEUED  │ (re-queued with answer)
                          │        └──────────┘
                          │
                   attempt < 3?
                     ┌────┴────┐
                     │ YES     │ NO
                     ▼         ▼
               ┌─────────┐ ┌──────────────┐
               │ PENDING  │ │WAITING_HUMAN │ (3-strike escalation)
               │ (retry)  │ └──────────────┘
               └─────────┘
```

---

## Guards & Safety Checks Summary

| Guard | Location | Purpose |
|-------|----------|---------|
| Claim guard | task-service.ts:177 | Atomic queued→running, prevents double-processing |
| Dependency guard | claimTaskForProcessing | Verifies all deps completed before API call |
| Rate limit intercept | worker.ts:157 | Catches rate limit errors, doesn't burn retry |
| Waiting human intercept | worker.ts:141 | Skips failure cascade for human-blocked tasks |
| Status precedence | command-executor.ts | Won't downgrade completed/failed tasks |
| Agent availability | command-executor.ts:114 | Rejects tasks for unavailable agents |
| Circuit breaker | orchestrator-agent.ts:234 | Stops after 5 question rounds |
| No-output guard | orchestrator-agent.ts:400 | Escalates if orchestrator produces nothing |
| Deduplication | command-executor.ts:175 | Skips tasks with duplicate names |
| File sandbox | file-writer.ts:41 | All writes confined to generated/ directory |

---

## Key File Reference

| Phase | File | Key Function | Line |
|-------|------|-------------|------|
| 1 | src/components/ScopeReviewPanel.tsx | handleAction() | 68 |
| 2 | src/app/api/scopes/[id]/approve/route.ts | POST() | 14 |
| 3 | packages/core/src/services/task-service.ts | createTask() | 59 |
| 3 | packages/core/src/queue/task-queue.ts | enqueueTask() | 109 |
| 4 | packages/core/src/worker.ts | start() | 63 |
| 5 | packages/core/src/agents/orchestrator-agent.ts | processOrchestratorTask() | 184 |
| 6 | packages/core/src/agents/utils/orchestrator-command-executor.ts | executeOrchestratorCommands() | 88 |
| 7 | packages/core/src/agents/utils/architect-spec-generator.ts | generateTechSpec() | 154 |
| 8 | packages/core/src/agents/backend-agent.ts | processBackendTask() | ~184 |
| 8 | packages/core/src/agents/frontend-agent.ts | processFrontendTask() | ~184 |
| 8 | packages/core/src/agents/qa-agent.ts | processQATask() | ~184 |
| 8 | packages/core/src/scaffolder/scaffold-orchestrator.ts | generateScaffold() | 229 |
| 8 | packages/core/src/agents/utils/skill-loader.ts | loadSkillsForTask() | 185 |
| 8 | packages/core/src/agents/utils/context-profiles.ts | selectContextProfile() | 162 |
| 8 | packages/core/src/agents/utils/file-writer.ts | writeGeneratedFiles() | 35 |
| 9 | packages/core/src/services/dependency-resolver.ts | resolveCompletedDependency() | 25 |
| 9 | packages/core/src/services/dependency-resolver.ts | handleFailedDependency() | 145 |
| 9 | packages/core/src/services/dependency-resolver.ts | unblockDependentTasks() | 196 |
| 9 | packages/core/src/services/cost-tracking-service.ts | recordAgentCost() | 32 |
| 10 | packages/core/src/queue/task-queue.ts | markTaskFailed() (retry) | 212 |
