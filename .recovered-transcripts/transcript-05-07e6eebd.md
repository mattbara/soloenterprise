# Transcript: 07e6eebd-7d48-4fb8-91cc-29ec03678355
## Date: Feb 17 19:59

---
### Human
[Request interrupted by user for tool use]

---
### Human
Implement the following plan:

# Plan: On-Demand Worker Startup + Per-Project Activity Dashboard

## Context

Currently, creating a project or approving a scope spawns ALL 7 workers via `spawn("pnpm", ["worker"])`. Workers that won't be needed for 10+ minutes (frontend, backend, QA) sit idle, burning ~56 Redis heartbeats/min + BullMQ polling + stop-request checks. With 10 concurrent projects this is pure waste.

The dashboard is also global-only — no way to see which agents are working on which project or view per-project logs.

**Two tracks:** (A) On-demand worker startup, (B) Per-project activity dashboard.

---

## Track A: On-Demand Worker Startup

### A1. Add Missing Worker Scripts

**Root `package.json`** — add:
- `"worker:scoper": "pnpm --filter @soloenterprise/core worker:scoper"`
- `"worker:client-reporter": "pnpm --filter @soloenterprise/core worker:client-reporter"`

**`packages/core/package.json`** — add:
- `"worker:client-reporter": "tsx src/worker.ts client-reporter"`

### A2. Create `worker-supervisor.ts`

**New file:** `packages/core/src/services/worker-supervisor.ts`

Single export: `ensureWorkerRunning(agentType: string): Promise<{ started: boolean; pid?: number }>`

Logic:
1. Map agentType to worker script name (e.g., `"scoper"` → `"worker:scoper"`)
2. **In-process debounce** — if this type was spawned in last 15s, skip (prevents double-spawn from rapid enqueues)
3. Call `getWorkerStatus(type)` from worker-registry
4. If `"running"` → return `{ started: false }`
5. If `"stopped"` → `spawn("pnpm", ["worker:{type}"], { detached: true, stdio: "ignore", cwd: repoRoot })` where `repoRoot` is resolved from `__dirname` to avoid CWD issues when called from worker process context
6. Return `{ started: true, pid }`

**Export from:** `packages/core/src/services/index.ts`

### A3. Hook into Both Enqueue Paths

There are exactly **2 functions** that add jobs to BullMQ:

**Path 1: `createTask()`** in `packages/core/src/services/task-service.ts` (line 109)
- Called by: project creation route, scope approval route, orchestrator command executor
- After the `console.log` on line 109, add `ensureWorkerRunning(input.agentType)` (dynamic import to avoid circular deps)

**Path 2: `enqueueTask()`** in `packages/core/src/queue/task-queue.ts` (line 165)
- Called by: dependency-resolver.ts when blocked tasks become unblocked
- After the `console.log` on line 165, add `ensureWorkerRunning(agentType)` (dynamic import)

Both use `try/catch` — supervisor failure must never block task creation.

### A4. Remove "Start ALL Workers" from API Routes

**`src/app/api/companies/[companyId]/projects/route.ts`** (lines 100-122):
- Delete the entire "Auto-start workers if all are stopped" block
- Remove `import { spawn } from "child_process"`
- Remove `workersStarted` from response (or keep as always-false for backward compat)

**`src/app/api/scopes/[id]/approve/route.ts`** (lines 140-161):
- Delete the entire "Check worker statuses and start if needed" block
- Remove `import { spawn } from "child_process"`
- Remove `workersStarted` from response

The `createTask` call in both routes now auto-starts the right worker via the hook.

### A5. Manual Start/Stop Stays

`POST /api/workers` route unchanged — manual control for debugging. `WorkerDashboardPanel` start/stop buttons still work. Idle timeout (5 min) still handles shutdown.

### 10-Project Scalability

Workers are SHARED across projects. One backend worker processes backend tasks for ALL projects sequentially (concurrency: 1). The supervisor only ensures the right worker TYPE is running, not per-project instances. 10 projects = more jobs in the same queues, not more workers.

Race condition: two concurrent requests might both spawn the same worker type. Harmless — two BullMQ workers on the same queue share work, idle timeout cleans up the extra one in 5 min.

---

## Track B: Per-Project Activity Dashboard

### B1. New API: Per-Project Activity

**New file:** `src/app/api/projects/[id]/activity/route.ts`

`GET /api/projects/:id/activity` — queries tasks grouped by agentType for this project:
```
{ agents: { scoper: { status, taskCount, activeTask, recentTask }, ... },
  totalTasks, completedTasks, runningTasks, pendingTasks }
```

Agent status derived from task statuses: `running` if any task running, `completed` if all done, `pending` if tasks pending, `idle` if no tasks.

### B2. New API: Per-Project Logs

**New file:** `src/app/api/projects/[id]/logs/route.ts`

`GET /api/projects/:id/logs?agentType=backend` — reads `generated/tasks/{taskId}/task.log` for all tasks in this project (optionally filtered by agentType), combines with task headers, returns combined log string.

Follows same pattern as existing `GET /api/workers/all/logs`.

### B3. `ProjectActivityPanel` Component

**New file:** `src/components/ProjectActivityPanel.tsx`

Client component receiving server-fetched data as props. Shows:
1. **Agent pipeline** — horizontal stages: Scoper → Orchestrator → Backend/Frontend/QA with colored status dots
2. **Active tasks table** — agent type, task name, status, duration
3. **Per-agent "View Logs" button** — opens `WorkerLogModal` with custom endpoint

### B4. Project Detail Page

**New file:** `src/app/projects/[id]/page.tsx`

Server Component:
1. Fetches project details + activity data from DB (server-side, no API cost)
2. Renders project header + `ProjectActivityPanel` + task list
3. Links from project rows in `/projects` page

### B5. Modify `WorkerLogModal` for Custom Endpoints

**File:** `src/components/WorkerLogModal.tsx`

Add optional `logEndpoint?: string` prop. In `fetchLogs`, use `logEndpoint ?? /api/workers/${workerType}/logs`. Allows reuse for both global and per-project log views.

### B6. Add `client-reporter` to Global Dashboard

**File:** `src/components/WorkerDashboardPanel.tsx`

Add `'client-reporter'` to the `WORKER_TYPES` array (line ~65). Currently missing.

---

## Files Modified/Created Summary

| Action | File |
|--------|------|
| **Edit** | `package.json` (add 2 worker scripts) |
| **Edit** | `packages/core/package.json` (add 1 worker script) |
| **Create** | `packages/core/src/services/worker-supervisor.ts` |
| **Edit** | `packages/core/src/services/index.ts` (add export) |
| **Edit** | `packages/core/src/services/task-service.ts` (add hook after line 109) |
| **Edit** | `packages/core/src/queue/task-queue.ts` (add hook after line 165) |
| **Edit** | `src/app/api/companies/[companyId]/projects/route.ts` (remove spawn block) |
| **Edit** | `src/app/api/scopes/[id]/approve/route.ts` (remove spawn block) |
| **Create** | `src/app/api/projects/[id]/activity/route.ts` |
| **Create** | `src/app/api/projects/[id]/logs/route.ts` |
| **Create** | `src/components/ProjectActivityPanel.tsx` |
| **Create** | `src/app/projects/[id]/page.tsx` |
| **Edit** | `src/components/WorkerLogModal.tsx` (add logEndpoint prop) |
| **Edit** | `src/components/WorkerDashboardPanel.tsx` (add client-reporter) |

---

## Verification

### Track A Testing
1. Create a project → verify ONLY scoper worker starts (check `GET /api/workers`)
2. Wait for scoper to complete → verify scoper idles, no other workers started
3. Approve scope → verify ONLY orchestrator worker starts
4. Wait for orchestrator to create child tasks → verify only needed worker types start (e.g., backend + frontend, NOT qa if no qa tasks)
5. All tasks complete → verify workers idle-timeout and shut down after 5 min
6. Manual start/stop from dashboard still works

### Track B Testing
1. Navigate to `/projects/{id}` → verify project detail page renders with activity panel
2. Verify agent pipeline shows correct statuses from task data
3. Click "View Logs" on an agent → verify per-project logs load (not global)
4. Run 2 projects simultaneously → verify each project page shows only its own activity

### Full E2E
1. Create 2 projects in quick succession
2. Verify scoper starts once (shared), processes both scoper tasks sequentially
3. Approve scope on project 1 → orchestrator starts, creates child tasks → backend/frontend start
4. Approve scope on project 2 → orchestrator already running, picks up second task
5. All workers shut down after idle timeout


If you need specific details from before exiting plan mode (like exact code snippets, error messages, or content you generated), read the full transcript at: /Users/matteobaratella/.claude/projects/-Users-matteobaratella-Projects-PERSONAL-PROJECTS-SoloEnterprise-soloenterprise/d6b22184-6507-4119-ad10-0bbdba95daf0.jsonl

---
### Assistant
I'll start by reading all the files that need modification to understand their current state.

### Tool Call: TaskCreate
**subject:** Implement Track A: On-Demand Worker Startup
**description:** A1: Add missing worker scripts to package.json files. A2: Create worker-supervisor.ts. A3: Hook into createTask() and enqueueTask(). A4: Remove "start ALL workers" blocks from API routes.
**activeForm:** Implementing on-demand worker startup

### Tool Result
```
Task #1 created successfully: Implement Track A: On-Demand Worker Startup
```

### Tool Call: TaskCreate
**subject:** Implement Track B: Per-Project Activity Dashboard
**description:** B1: Per-project activity API. B2: Per-project logs API. B3: ProjectActivityPanel component. B4: Project detail page. B5: WorkerLogModal custom endpoint. B6: Add client-reporter to global dashboard.
**activeForm:** Implementing per-project activity dashboard

### Tool Result
```
Task #2 created successfully: Implement Track B: Per-Project Activity Dashboard
```

### Tool Call: TaskUpdate
**taskId:** 1
**status:** in_progress

### Tool Result
```
Updated task #1 status
```

---
### Assistant
Let me read all the files I need to modify.

### Tool Call: Read
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/package.json`

### Tool Result
```
     1→{
     2→  "name": "soloenterprise",
     3→  "private": true,
     4→  "scripts": {
     5→    "dev": "next dev",
     6→    "dev:turbo": "next dev --turbopack",
     7→    "build": "next build",
     8→    "start": "next start",
     9→    "lint": "next lint",
    10→    "dev:all": "turbo run dev",
    11→    "build:all": "turbo run build",
    12→    "test:all": "turbo run test",
    13→    "lint:all": "turbo run lint",
    14→    "db:generate": "pnpm --filter @soloenterprise/db generate",
    15→    "db:migrate": "pnpm --filter @soloenterprise/db migrate",
    16→    "db:push": "pnpm --filter @soloenterprise/db push",
    17→    "db:studio": "pnpm --filter @soloenterprise/db studio",
    18→    "db:sync-journal": "pnpm --filter @soloenterprise/db sync-journal",
    19→    "test:echo": "tsx scripts/test-echo.ts",
    20→    "test:backend": "tsx scripts/test-backend-agent.ts",
    21→    "worker": "pnpm --filter @soloenterprise/core worker",
    22→    "worker:echo": "pnpm --filter @soloenterprise/core worker:echo",
    23→    "worker:backend": "pnpm --filter @soloenterprise/core worker:backend",
    24→    "worker:frontend": "pnpm --filter @soloenterprise/core worker:frontend",
    25→    "worker:qa": "pnpm --filter @soloenterprise/core worker:qa",
    26→    "worker:orchestrator": "pnpm --filter @soloenterprise/core worker:orchestrator"
    27→  },
    28→  "dependencies": {
    29→    "@neondatabase/serverless": "^0.9.5",
    30→    "@soloenterprise/core": "workspace:^",
    31→    "@soloenterprise/db": "workspace:^",
    32→    "dotenv": "^16.4.0",
    33→    "drizzle-orm": "^0.30.0",
    34→    "lucide-react": "^0.564.0",
    35→    "next": "^15.0.0",
    36→    "react": "^19.0.0",
    37→    "react-dom": "^19.0.0",
    38→    "react-markdown": "^10.1.0",
    39→    "sharp": "^0.34.5"
    40→  },
    41→  "devDependencies": {
    42→    "@tailwindcss/postcss": "^4.0.0",
    43→    "@types/node": "^20.0.0",
    44→    "@types/react": "^19.0.0",
    45→    "@types/react-dom": "^19.0.0",
    46→    "eslint": "^9.0.0",
    47→    "eslint-config-next": "^15.0.0",
    48→    "tailwindcss": "^4.0.0",
    49→    "tsx": "^4.7.0",
    50→    "turbo": "^2.0.0",
    51→    "typescript": "^5.3.0",
    52→    "vitest": "^4.0.18"
    53→  },
    54→  "packageManager": "pnpm@9.0.0",
    55→  "engines": {
    56→    "node": ">=20.0.0"
    57→  }
    58→}
    59→
```

### Tool Call: Read
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/packages/core/package.json`

### Tool Result
```
     1→{
     2→  "name": "@soloenterprise/core",
     3→  "version": "0.1.0",
     4→  "private": true,
     5→  "type": "module",
     6→  "main": "./src/index.ts",
     7→  "types": "./src/index.ts",
     8→  "exports": {
     9→    ".": "./src/index.ts",
    10→    "./queue": "./src/queue/index.ts",
    11→    "./locks": "./src/locks/index.ts",
    12→    "./services": "./src/services/index.ts",
    13→    "./agents": "./src/agents/index.ts"
    14→  },
    15→  "scripts": {
    16→    "build": "tsc",
    17→    "dev": "tsc --watch",
    18→    "test": "vitest",
    19→    "worker": "tsx src/worker.ts",
    20→    "worker:echo": "tsx src/worker.ts echo",
    21→    "worker:backend": "tsx src/worker.ts backend",
    22→    "worker:frontend": "tsx src/worker.ts frontend",
    23→    "worker:qa": "tsx src/worker.ts qa",
    24→    "worker:orchestrator": "tsx src/worker.ts orchestrator",
    25→    "worker:scoper": "tsx src/worker.ts scoper"
    26→  },
    27→  "dependencies": {
    28→    "@anthropic-ai/sdk": "^0.39.0",
    29→    "@soloenterprise/db": "workspace:*",
    30→    "bullmq": "^5.0.0",
    31→    "dotenv": "^16.4.0",
    32→    "drizzle-orm": "^0.30.0",
    33→    "ioredis": "^5.3.0",
    34→    "typescript": "^5.3.0",
    35→    "yaml": "^2.8.2"
    36→  },
    37→  "devDependencies": {
    38→    "@vitest/coverage-v8": "^4.0.18",
    39→    "tsx": "^4.7.0",
    40→    "vitest": "^4.0.18"
    41→  }
    42→}
    43→
```

### Tool Call: Read
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/packages/core/src/services/task-service.ts`

### Tool Result
```
     1→/**
     2→ * Task Service
     3→ *
     4→ * Bridges the database and queue systems.
     5→ * Provides high-level operations for task management.
     6→ */
     7→
     8→import { db } from '@soloenterprise/db';
     9→import { tasks, projects } from '@soloenterprise/db/schema';
    10→import { eq } from 'drizzle-orm';
    11→import { Queue } from 'bullmq';
    12→import { getSharedRedisConnection, closeSharedRedisConnection } from '../utils/index';
    13→import { publishTaskEvent, type TaskEvent } from './task-events';
    14→
    15→// Task creation input
    16→export interface CreateTaskInput {
    17→  name: string;
    18→  description: string;
    19→  agentType: 'orchestrator' | 'backend' | 'frontend' | 'qa' | 'devops' | 'feedback' | 'echo' | 'scoper' | 'client-reporter';
    20→  priority?: 'critical' | 'high' | 'medium' | 'low';
    21→  context?: Record<string, unknown>;
    22→  filesToModify?: string[];
    23→  requiredGates?: string[];
    24→  dependsOn?: string[];
    25→}
    26→
    27→// Task job data for queue
    28→export interface TaskJobData {
    29→  taskId: string;
    30→  projectId: string;
    31→  name: string;
    32→  description: string;
    33→  context: Record<string, unknown>;
    34→  attemptNumber: number;
    35→}
    36→
    37→// Queue cache
    38→const queues = new Map<string, Queue>();
    39→
    40→function getQueue(queueName: string): Queue {
    41→  const existing = queues.get(queueName);
    42→  if (existing) return existing;
    43→
    44→  const queue = new Queue(queueName, {
    45→    connection: getSharedRedisConnection(),
    46→    defaultJobOptions: {
    47→      attempts: 1,
    48→      removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
    49→      removeOnFail: { age: 7 * 24 * 60 * 60 },
    50→    },
    51→  });
    52→  queues.set(queueName, queue);
    53→  return queue;
    54→}
    55→
    56→/**
    57→ * Create a task in the database and enqueue it for processing.
    58→ */
    59→export async function createTask(
    60→  projectId: string,
    61→  input: CreateTaskInput
    62→): Promise<{ taskId: string; jobId: string }> {
    63→  // Verify project exists
    64→  const project = await db.query.projects.findFirst({
    65→    where: eq(projects.id, projectId),
    66→  });
    67→
    68→  if (!project) {
    69→    throw new Error(`Project not found: ${projectId}`);
    70→  }
    71→
    72→  // Insert task into database
    73→  const [task] = await db
    74→    .insert(tasks)
    75→    .values({
    76→      projectId,
    77→      name: input.name,
    78→      description: input.description,
    79→      agentType: input.agentType === 'echo' ? 'backend' : input.agentType, // Map echo to backend for schema
    80→      priority: input.priority ?? 'medium',
    81→      context: input.context ?? {},
    82→      filesToModify: input.filesToModify ?? [],
    83→      requiredGates: input.requiredGates ?? [],
    84→      dependsOn: input.dependsOn ?? [],
    85→      status: 'queued',
    86→    })
    87→    .returning();
    88→
    89→  // Determine queue name
    90→  const queueName = input.agentType === 'echo' ? 'echo-tasks' : `${input.agentType}-tasks`;
    91→  const queue = getQueue(queueName);
    92→
    93→  // Add job to queue
    94→  const job = await queue.add(
    95→    task.name,
    96→    {
    97→      taskId: task.id,
    98→      projectId: task.projectId,
    99→      name: task.name,
   100→      description: task.description,
   101→      context: task.context ?? {},
   102→      attemptNumber: 1,
   103→    } satisfies TaskJobData,
   104→    {
   105→      jobId: `task-${task.id}-attempt-1`,
   106→    }
   107→  );
   108→
   109→  console.log(`[TaskService] Created task ${task.id} and enqueued to ${queueName}`);
   110→
   111→  return { taskId: task.id, jobId: job.id! };
   112→}
   113→
   114→/**
   115→ * Update a task's status and optionally its result/outputs.
   116→ */
   117→export async function updateTaskStatus(
   118→  taskId: string,
   119→  status: 'pending' | 'queued' | 'running' | 'waiting_human' | 'blocked' | 'completed' | 'failed',
   120→  result?: {
   121→    success: boolean;
   122→    summary?: string;
   123→    error?: string;
   124→    outputs?: Record<string, unknown>;
   125→  }
   126→): Promise<void> {
   127→  const updateData: Record<string, unknown> = {
   128→    status,
   129→    updatedAt: new Date(),
   130→  };
   131→
   132→  if (status === 'running') {
   133→    updateData.startedAt = new Date();
   134→  }
   135→
   136→  if (status === 'completed' || status === 'failed') {
   137→    updateData.completedAt = new Date();
   138→    if (result) {
   139→      updateData.result = result;
   140→    }
   141→  }
   142→
   143→  if (status === 'failed') {
   144→    // Increment attempt count
   145→    const task = await db.query.tasks.findFirst({
   146→      where: eq(tasks.id, taskId),
   147→    });
   148→    if (task) {
   14
... (truncated)
```

### Tool Call: Read
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/packages/core/src/queue/task-queue.ts`

### Tool Result
```
     1→/**
     2→ * Task Queue
     3→ * 
     4→ * Uses BullMQ for reliable task queue management.
     5→ * Handles task assignment, retries, and state transitions.
     6→ * 
     7→ * Key behaviors:
     8→ * - Tasks are queued per agent type
     9→ * - 3-strike rule: escalate to human after 3 failures
    10→ * - Priority-based processing
    11→ */
    12→
    13→import { Queue, Worker, Job, QueueEvents, ConnectionOptions } from 'bullmq';
    14→import { Redis } from 'ioredis';
    15→import { db } from '@soloenterprise/db';
    16→import { tasks, questions } from '@soloenterprise/db/schema';
    17→import { eq } from 'drizzle-orm';
    18→
    19→// Queue names per agent type
    20→const QUEUE_NAMES = {
    21→  orchestrator: 'orchestrator-tasks',
    22→  backend: 'backend-tasks',
    23→  frontend: 'frontend-tasks',
    24→  qa: 'qa-tasks',
    25→  devops: 'devops-tasks',       // Phase 7 — NO ACTIVE WORKER (guard in CommandExecutor)
    26→  feedback: 'feedback-tasks',   // NO ACTIVE WORKER (guard in CommandExecutor)
    27→  scoper: 'scoper-tasks',
    28→  'client-reporter': 'client-reporter-tasks',
    29→} as const;
    30→
    31→type AgentType = keyof typeof QUEUE_NAMES;
    32→
    33→// Job data structure
    34→export interface TaskJobData {
    35→  taskId: string;
    36→  projectId: string;
    37→  name: string;
    38→  description: string;
    39→  context: Record<string, unknown>;
    40→  filesToModify: string[];
    41→  requiredGates: string[];
    42→  attemptNumber: number;
    43→}
    44→
    45→// Job result structure
    46→export interface TaskJobResult {
    47→  success: boolean;
    48→  summary?: string;
    49→  artifactIds?: string[];
    50→  prUrl?: string;
    51→  error?: string;
    52→}
    53→
    54→// Redis connection
    55→let redisConnection: Redis | null = null;
    56→
    57→function getRedisConnection(): ConnectionOptions {
    58→  if (!redisConnection) {
    59→    const redisUrl = process.env.REDIS_URL;
    60→    if (!redisUrl) {
    61→      throw new Error('REDIS_URL environment variable is required');
    62→    }
    63→    // Upstash requires TLS - detect by rediss:// or upstash.io in URL
    64→    const useTls = redisUrl.startsWith('rediss://') || redisUrl.includes('upstash.io');
    65→    redisConnection = new Redis(redisUrl, {
    66→      maxRetriesPerRequest: null, // Required by BullMQ
    67→      tls: useTls ? {} : undefined,
    68→    });
    69→  }
    70→  // Cast to ConnectionOptions to handle ioredis version mismatch between project and BullMQ
    71→  return redisConnection as unknown as ConnectionOptions;
    72→}
    73→
    74→// Queue instances cache
    75→const queues = new Map<AgentType, Queue<TaskJobData, TaskJobResult>>();
    76→
    77→/**
    78→ * Get or create a queue for an agent type.
    79→ */
    80→export function getQueue(agentType: AgentType): Queue<TaskJobData, TaskJobResult> {
    81→  const existingQueue = queues.get(agentType);
    82→  if (existingQueue) {
    83→    return existingQueue;
    84→  }
    85→
    86→  const newQueue = new Queue<TaskJobData, TaskJobResult, string>(QUEUE_NAMES[agentType], {
    87→    connection: getRedisConnection(),
    88→    defaultJobOptions: {
    89→      attempts: 1, // We handle retries at the application level (3-strike rule)
    90→      removeOnComplete: {
    91→        age: 24 * 60 * 60, // Keep completed jobs for 24 hours
    92→        count: 1000,
    93→      },
    94→      removeOnFail: {
    95→        age: 7 * 24 * 60 * 60, // Keep failed jobs for 7 days
    96→      },
    97→    },
    98→  });
    99→  queues.set(agentType, newQueue);
   100→
   101→  return newQueue;
   102→}
   103→
   104→/**
   105→ * Add a task to the appropriate agent queue.
   106→ */
   107→export async function enqueueTask(
   108→  taskId: string,
   109→  agentType: AgentType,
   110→  priority: 'critical' | 'high' | 'medium' | 'low' = 'medium'
   111→): Promise<Job<TaskJobData, TaskJobResult>> {
   112→  // Fetch task from database
   113→  const task = await db.query.tasks.findFirst({
   114→    where: eq(tasks.id, taskId),
   115→  });
   116→
   117→  if (!task) {
   118→    throw new Error(`Task not found: ${taskId}`);
   119→  }
   120→
   121→  // Map priority to BullMQ priority (lower number = higher priority)
   122→  const priorityMap = {
   123→    critical: 1,
   124→    high: 2,
   125→    medium: 3,
   126→    low: 4,
   127→  };
   128→
   129→  const queue = getQueue(agentType);
   130→
   131→  // Use timestamp in job ID to ensure uniqueness when re-queuing after human answers
   132→  // Without this, re-queuing the same task (e.g., after answering a question) would
   133→  // silently fail because BullMQ ignores duplicate job IDs
   134→  const jobId = `task-${taskId}-attempt-${task.attemptCount + 1}-${Date.now()}`;
   135→
   136→  console.log(`[TaskQueue] Adding job ${jobId} to ${agentType} queue...`);
   137→
   138→  const job = await queu
... (truncated)
```

### Tool Call: Read
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/packages/core/src/services/index.ts`

### Tool Result
```
     1→/**
     2→ * Services Exports
     3→ */
     4→
     5→export * from './task-service';
     6→export * from './worker-registry';
     7→export * from './task-events';
     8→export * from './dependency-resolver';
     9→
```

### Tool Call: Read
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/app/api/companies/[companyId]/projects/route.ts`

### Tool Result
```
     1→import { NextResponse } from "next/server";
     2→import { db } from "@/lib/db";
     3→import { projectBriefs, projects, clients } from "@soloenterprise/db/schema";
     4→import { eq } from "drizzle-orm";
     5→import { spawn } from "child_process";
     6→
     7→/**
     8→ * POST /api/companies/:companyId/projects — Create project + brief + scoper task
     9→ *
    10→ * Body: { projectName: string, briefQuestions: { fieldKey: string, question: string, answer: string }[] }
    11→ *
    12→ * Adapts the existing POST /api/briefs logic for the company-scoped pipeline.
    13→ */
    14→export async function POST(
    15→  request: Request,
    16→  { params }: { params: Promise<{ companyId: string }> }
    17→) {
    18→  try {
    19→    const { companyId } = await params;
    20→    const body = await request.json();
    21→    const { projectName, briefQuestions } = body;
    22→
    23→    // Validate company exists
    24→    const company = await db.query.clients.findFirst({
    25→      where: eq(clients.id, companyId),
    26→    });
    27→
    28→    if (!company) {
    29→      return NextResponse.json(
    30→        { error: "Company not found" },
    31→        { status: 404 }
    32→      );
    33→    }
    34→
    35→    if (!projectName || typeof projectName !== "string" || !projectName.trim()) {
    36→      return NextResponse.json(
    37→        { error: "projectName is required" },
    38→        { status: 400 }
    39→      );
    40→    }
    41→
    42→    if (!briefQuestions || !Array.isArray(briefQuestions) || briefQuestions.length === 0) {
    43→      return NextResponse.json(
    44→        { error: "briefQuestions is required and must be a non-empty array" },
    45→        { status: 400 }
    46→      );
    47→    }
    48→
    49→    // Concatenate briefQuestions into rawContent for the Scoper agent
    50→    const rawContent = briefQuestions
    51→      .filter((q: { answer?: string }) => q.answer && q.answer.trim())
    52→      .map((q: { question: string; answer: string }) => `**${q.question}**\n${q.answer}`)
    53→      .join("\n\n");
    54→
    55→    if (!rawContent.trim()) {
    56→      return NextResponse.json(
    57→        { error: "At least one question must have an answer" },
    58→        { status: 400 }
    59→      );
    60→    }
    61→
    62→    // 1. Create the brief record
    63→    const [brief] = await db
    64→      .insert(projectBriefs)
    65→      .values({
    66→        title: projectName.trim(),
    67→        rawContent,
    68→        briefQuestions,
    69→        clientId: companyId,
    70→        status: "received",
    71→      })
    72→      .returning();
    73→
    74→    // 2. Create the project linked to the company
    75→    const [project] = await db
    76→      .insert(projects)
    77→      .values({
    78→        name: projectName.trim(),
    79→        description: `Scoping project for brief: ${brief.id}`,
    80→        status: "planning",
    81→        clientId: companyId,
    82→      })
    83→      .returning();
    84→
    85→    // 3. Create a scoper task and queue it
    86→    const { createTask } = await import("@soloenterprise/core/services");
    87→
    88→    const result = await createTask(project.id, {
    89→      name: `Scope brief: ${projectName.trim()}`,
    90→      description: rawContent,
    91→      agentType: "scoper",
    92→      priority: "medium",
    93→      context: {
    94→        briefId: brief.id,
    95→        briefTitle: projectName.trim(),
    96→        clientId: companyId,
    97→      },
    98→    });
    99→
   100→    // 4. Auto-start workers if all are stopped
   101→    let workersStarted = false;
   102→    try {
   103→      const { getAllWorkerStatuses } = await import("@soloenterprise/core/services");
   104→      const statuses = await getAllWorkerStatuses();
   105→      const allStopped = Object.values(statuses).every(
   106→        (s: any) => s.status === "stopped" || s.status === "unknown"
   107→      );
   108→
   109→      if (allStopped) {
   110→        const child = spawn("pnpm", ["worker"], {
   111→          detached: true,
   112→          stdio: "ignore",
   113→          cwd: process.cwd(),
   114→          env: { ...process.env },
   115→        });
   116→        child.unref();
   117→        workersStarted = true;
   118→        console.log(`[CreateProject] Started all workers (PID: ${child.pid})`);
   119→      }
   120→    } catch (err) {
   121→      console.error("[CreateProject] Failed to check/start workers:", err);
   122→    }
   123→
   124→    return NextResponse.json(
   125→      {
   126→        briefId: brief.id,
   127→        projectId: project.id,
   128→        taskId: result.taskId,
   129→        jobId: result.jobId,
   130→        status: "received",
   131→        workersStarted,
   132→      },
   133→      { status: 201 }
   134→    );
   135→  } catch (error) {
   136→    console.error("Failed to cr
... (truncated)
```

### Tool Call: Read
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/app/api/scopes/[id]/approve/route.ts`

### Tool Result
```
     1→import { NextResponse } from "next/server";
     2→import { db } from "@/lib/db";
     3→import { projectScopes, projects } from "@soloenterprise/db/schema";
     4→import { and, eq } from "drizzle-orm";
     5→import { spawn } from "child_process";
     6→
     7→/**
     8→ * POST /api/scopes/:id/approve — Approve or reject a scope
     9→ *
    10→ * Body: { action: 'approve' | 'reject', approvedBy?: string, additionalContext?: string }
    11→ *
    12→ * On approve: links scope to project, starts workers if stopped, creates orchestrator task.
    13→ */
    14→export async function POST(
    15→  request: Request,
    16→  { params }: { params: Promise<{ id: string }> }
    17→) {
    18→  try {
    19→    const { id } = await params;
    20→    const body = await request.json();
    21→    const { action, approvedBy, additionalContext } = body;
    22→
    23→    if (action !== "approve" && action !== "reject") {
    24→      return NextResponse.json(
    25→        { error: "action must be 'approve' or 'reject'" },
    26→        { status: 400 }
    27→      );
    28→    }
    29→
    30→    if (action === "approve" && (!approvedBy || typeof approvedBy !== "string" || !approvedBy.trim())) {
    31→      return NextResponse.json(
    32→        { error: "approvedBy is required for approval" },
    33→        { status: 400 }
    34→      );
    35→    }
    36→
    37→    // Fetch the scope with brief
    38→    const scope = await db.query.projectScopes.findFirst({
    39→      where: eq(projectScopes.id, id),
    40→      with: {
    41→        brief: true,
    42→      },
    43→    });
    44→
    45→    if (!scope) {
    46→      return NextResponse.json(
    47→        { error: "Scope not found" },
    48→        { status: 404 }
    49→      );
    50→    }
    51→
    52→    if (scope.status === "approved" || scope.status === "rejected") {
    53→      return NextResponse.json(
    54→        { error: `Scope is already ${scope.status}` },
    55→        { status: 409 }
    56→      );
    57→    }
    58→
    59→    const newStatus = action === "approve" ? "approved" : "rejected";
    60→
    61→    const [updated] = await db
    62→      .update(projectScopes)
    63→      .set({
    64→        status: newStatus,
    65→        ...(action === "approve"
    66→          ? { approvedBy: approvedBy.trim(), approvedAt: new Date() }
    67→          : {}),
    68→        updatedAt: new Date(),
    69→      })
    70→      .where(eq(projectScopes.id, id))
    71→      .returning();
    72→
    73→    if (action === "reject") {
    74→      // Link scope to project so the UI can resolve "rejected" status (prevents orphan "scoping" state)
    75→      let rejectedProjectId: string | null = null;
    76→      try {
    77→        let project = scope.projectId
    78→          ? await db.query.projects.findFirst({ where: eq(projects.id, scope.projectId) })
    79→          : null;
    80→
    81→        if (!project && scope.brief.clientId) {
    82→          project = await db.query.projects.findFirst({
    83→            where: and(
    84→              eq(projects.clientId, scope.brief.clientId),
    85→              eq(projects.name, scope.brief.title)
    86→            ),
    87→          });
    88→        }
    89→
    90→        if (project) {
    91→          rejectedProjectId = project.id;
    92→          // Bidirectional link so scope is always discoverable
    93→          await db.update(projectScopes).set({ projectId: project.id, updatedAt: new Date() }).where(eq(projectScopes.id, id));
    94→          await db.update(projects).set({ scopeId: scope.id, updatedAt: new Date() }).where(eq(projects.id, project.id));
    95→        }
    96→      } catch (err) {
    97→        console.error("[Reject] Failed to link scope to project:", err);
    98→      }
    99→
   100→      return NextResponse.json({ ...updated, projectId: rejectedProjectId });
   101→    }
   102→
   103→    // ========== PIPELINE WIRING (approve only) ==========
   104→
   105→    // 1. Find the project linked to this scope — prefer direct projectId, fallback to brief matching
   106→    let project = scope.projectId
   107→      ? await db.query.projects.findFirst({
   108→          where: eq(projects.id, scope.projectId),
   109→        })
   110→      : null;
   111→
   112→    if (!project && scope.brief.clientId) {
   113→      project = await db.query.projects.findFirst({
   114→        where: and(
   115→          eq(projects.clientId, scope.brief.clientId),
   116→          eq(projects.name, scope.brief.title)
   117→        ),
   118→      });
   119→    }
   120→
   121→    let orchestratorTaskId: string | null = null;
   122→    let workersStarted = false;
   123→
   124→    if (project) {
   125→      // 2. Bidirectional link: project ↔ scope, set project to active
   126→      await db
   127→        .update(projects)
   128→        .set({
   129→          scopeId: scope.id,
   130→          status: "
... (truncated)
```

### Tool Call: Read
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/components/WorkerLogModal.tsx`

### Tool Result
```
     1→"use client";
     2→
     3→import { useState, useEffect, useRef } from "react";
     4→
     5→interface WorkerLogModalProps {
     6→  workerType: string;
     7→  onClose: () => void;
     8→}
     9→
    10→export function WorkerLogModal({ workerType, onClose }: WorkerLogModalProps) {
    11→  const [logs, setLogs] = useState<string>("");
    12→  const [taskName, setTaskName] = useState<string | null>(null);
    13→  const [taskStatus, setTaskStatus] = useState<string | null>(null);
    14→  const [isRunning, setIsRunning] = useState(false);
    15→  const [loading, setLoading] = useState(false);
    16→  const [error, setError] = useState<string | null>(null);
    17→  const [copied, setCopied] = useState(false);
    18→  const logContainerRef = useRef<HTMLPreElement>(null);
    19→
    20→  const fetchLogs = async () => {
    21→    try {
    22→      setError(null);
    23→      const response = await fetch(`/api/workers/${workerType}/logs`);
    24→      if (!response.ok) {
    25→        const data = await response.json();
    26→        setError(data.error || "Failed to load logs");
    27→        return;
    28→      }
    29→      const data = await response.json();
    30→      setLogs(data.logs || "");
    31→      setTaskName(data.taskName || null);
    32→      setTaskStatus(data.taskStatus || null);
    33→      setIsRunning(data.isRunning ?? false);
    34→    } catch {
    35→      setError("Failed to load logs");
    36→    } finally {
    37→      setLoading(false);
    38→    }
    39→  };
    40→
    41→  // No auto-fetch on mount — user clicks Refresh to load logs (saves API calls)
    42→
    43→  // Auto-scroll to bottom on initial load
    44→  useEffect(() => {
    45→    if (!loading && logContainerRef.current) {
    46→      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    47→    }
    48→  }, [loading, logs]);
    49→
    50→  const handleRefresh = () => {
    51→    setLoading(true);
    52→    fetchLogs();
    53→  };
    54→
    55→  const handleCopy = async () => {
    56→    if (!logs) return;
    57→    await navigator.clipboard.writeText(logs);
    58→    setCopied(true);
    59→    setTimeout(() => setCopied(false), 2000);
    60→  };
    61→
    62→  const renderLogLine = (line: string, index: number) => {
    63→    let className = "text-gray-100";
    64→    if (line.includes("[ERROR]")) {
    65→      className = "text-red-400";
    66→    } else if (line.includes("[WARN]")) {
    67→      className = "text-amber-400";
    68→    }
    69→    return (
    70→      <div key={index} className={className}>
    71→        {line}
    72→      </div>
    73→    );
    74→  };
    75→
    76→  return (
    77→    <div className="fixed inset-0 z-50 overflow-y-auto">
    78→      <div className="flex min-h-full items-center justify-center p-4">
    79→        {/* Backdrop */}
    80→        <div
    81→          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
    82→          onClick={onClose}
    83→        />
    84→
    85→        {/* Modal */}
    86→        <div className="relative bg-gray-900 rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] flex flex-col">
    87→          {/* Header */}
    88→          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 flex-shrink-0">
    89→            <div className="flex items-center gap-3">
    90→              <div>
    91→                <h3 className="text-lg font-medium text-gray-100 capitalize">
    92→                  {workerType === "all" ? "All Workers — Combined Logs" : `${workerType} Worker Logs`}
    93→                </h3>
    94→                {taskName && (
    95→                  <p className="text-sm text-gray-400 mt-0.5">
    96→                    Latest task: {taskName}
    97→                  </p>
    98→                )}
    99→              </div>
   100→              {taskStatus && (
   101→                <span
   102→                  className={`px-2 py-0.5 text-xs font-medium rounded-full ${
   103→                    taskStatus === "completed"
   104→                      ? "bg-green-900 text-green-300"
   105→                      : taskStatus === "running"
   106→                        ? "bg-blue-900 text-blue-300"
   107→                        : taskStatus === "failed"
   108→                          ? "bg-red-900 text-red-300"
   109→                          : "bg-gray-700 text-gray-300"
   110→                  }`}
   111→                >
   112→                  {taskStatus}
   113→                </span>
   114→              )}
   115→              {isRunning && (
   116→                <span className="flex items-center gap-1.5 text-xs text-green-400">
   117→                  <span className="relative flex h-2 w-2">
   118→                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
   119→                    <span cl
... (truncated)
```

### Tool Call: Read
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/components/WorkerDashboardPanel.tsx`

### Tool Result
```
     1→"use client";
     2→
     3→import { useState } from "react";
     4→import { Button } from "./Button";
     5→import { WorkerLogModal } from "./WorkerLogModal";
     6→
     7→async function clearBrowserCache() {
     8→  try {
     9→    localStorage.clear();
    10→    sessionStorage.clear();
    11→    if (window.indexedDB && window.indexedDB.databases) {
    12→      const databases = await window.indexedDB.databases();
    13→      databases.forEach((db) => {
    14→        if (db.name) {
    15→          window.indexedDB.deleteDatabase(db.name);
    16→        }
    17→      });
    18→    }
    19→    if ("caches" in window) {
    20→      const cacheNames = await caches.keys();
    21→      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    22→    }
    23→  } catch (err) {
    24→    console.error("[WorkerDashboardPanel] Failed to clear browser cache:", err);
    25→  }
    26→}
    27→
    28→function formatDuration(seconds: number): string {
    29→  if (seconds < 60) return `${seconds}s`;
    30→  if (seconds < 3600) {
    31→    const minutes = Math.floor(seconds / 60);
    32→    const secs = seconds % 60;
    33→    return `${minutes}m ${secs}s`;
    34→  }
    35→  const hours = Math.floor(seconds / 3600);
    36→  const minutes = Math.floor((seconds % 3600) / 60);
    37→  return `${hours}h ${minutes}m`;
    38→}
    39→
    40→type WorkerType = "orchestrator" | "backend" | "frontend" | "qa" | "scoper";
    41→
    42→interface WorkerStatusData {
    43→  type: string;
    44→  status: "running" | "stopped";
    45→  pid: number | null;
    46→  lastHeartbeat: number | null;
    47→  lastTaskTime: number | null;
    48→  startedAt: number | null;
    49→}
    50→
    51→interface Stats {
    52→  projects: number;
    53→  pendingTasks: number;
    54→  runningTasks: number;
    55→  waitingHuman: number;
    56→  pendingQuestions: number;
    57→  activeLocks: number;
    58→}
    59→
    60→interface WorkerDashboardPanelProps {
    61→  workerStatuses: Record<WorkerType, WorkerStatusData | null>;
    62→  stats: Stats;
    63→}
    64→
    65→const WORKER_TYPES: WorkerType[] = ["orchestrator", "backend", "frontend", "qa", "scoper"];
    66→
    67→const STAT_ROWS: { key: keyof Stats; label: string; color: string }[] = [
    68→  { key: "projects", label: "Projects", color: "bg-blue-500" },
    69→  { key: "pendingTasks", label: "Pending Tasks", color: "bg-yellow-500" },
    70→  { key: "runningTasks", label: "Running Tasks", color: "bg-green-500" },
    71→  { key: "waitingHuman", label: "Waiting Human", color: "bg-orange-500" },
    72→  { key: "pendingQuestions", label: "Pending Questions", color: "bg-red-500" },
    73→  { key: "activeLocks", label: "Active File Locks", color: "bg-purple-500" },
    74→];
    75→
    76→export function WorkerDashboardPanel({ workerStatuses, stats }: WorkerDashboardPanelProps) {
    77→  const [statuses, setStatuses] = useState<Record<WorkerType, WorkerStatusData | null>>(workerStatuses);
    78→  const [actionInProgress, setActionInProgress] = useState<Record<WorkerType, boolean>>({
    79→    orchestrator: false,
    80→    backend: false,
    81→    frontend: false,
    82→    qa: false,
    83→    scoper: false,
    84→  });
    85→  const [bulkActionInProgress, setBulkActionInProgress] = useState(false);
    86→  const [error, setError] = useState<string | null>(null);
    87→  const [logsWorker, setLogsWorker] = useState<WorkerType | "all" | null>(null);
    88→
    89→  const now = Date.now();
    90→
    91→  const handleStart = async (type: WorkerType) => {
    92→    setActionInProgress((prev) => ({ ...prev, [type]: true }));
    93→    setError(null);
    94→    try {
    95→      const response = await fetch("/api/workers", {
    96→        method: "POST",
    97→        headers: { "Content-Type": "application/json" },
    98→        body: JSON.stringify({ type }),
    99→      });
   100→      const data = await response.json();
   101→      if (!response.ok) throw new Error(data.error || "Failed to start worker");
   102→      setStatuses((prev) => ({ ...prev, [type]: data }));
   103→    } catch (err) {
   104→      setError(err instanceof Error ? err.message : "Failed to start worker");
   105→    } finally {
   106→      setActionInProgress((prev) => ({ ...prev, [type]: false }));
   107→    }
   108→  };
   109→
   110→  const handleStop = async (type: WorkerType) => {
   111→    setActionInProgress((prev) => ({ ...prev, [type]: true }));
   112→    setError(null);
   113→    try {
   114→      const response = await fetch(`/api/workers/${type}`, { method: "DELETE" });
   115→      const data = await response.json();
   116→      if (!response.ok) throw new Error(data.error || "Failed to stop worker");
   117→      setStatuses((prev) => ({ ...prev, [type]: data }));
   118→      await clearBrowserCache();
   119→    } catch (err) {
   120→      setError(err instanceof Error ? err.message : "Failed to stop wo
... (truncated)
```

---
### Assistant
Now let me read a few more files I need.

### Tool Call: Read
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/packages/core/src/services/worker-registry.ts`

### Tool Result
```
     1→/**
     2→ * Worker Registry Service
     3→ *
     4→ * Tracks worker status using Redis. Workers register themselves
     5→ * and send periodic heartbeats. The API can query worker status.
     6→ */
     7→
     8→import { createRedisConnection } from '../utils/redis';
     9→
    10→// Worker types supported
    11→export type WorkerType = 'backend' | 'echo' | 'orchestrator' | 'frontend' | 'qa' | 'devops' | 'feedback' | 'scoper' | 'client-reporter';
    12→
    13→// Worker status
    14→export interface WorkerStatus {
    15→  type: WorkerType;
    16→  status: 'running' | 'stopped';
    17→  pid: number | null;
    18→  lastHeartbeat: number | null;
    19→  lastTaskTime: number | null;
    20→  startedAt: number | null;
    21→}
    22→
    23→// Heartbeat TTL in seconds (worker considered dead if no heartbeat within this time)
    24→const HEARTBEAT_TTL_SECONDS = 30;
    25→
    26→// Heartbeat interval in milliseconds
    27→export const HEARTBEAT_INTERVAL_MS = 10000;
    28→
    29→// Default idle timeout in milliseconds (5 minutes)
    30→export const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
    31→
    32→// Redis key prefixes
    33→const KEY_PREFIX = 'worker:';
    34→
    35→function getRedisKey(type: WorkerType, suffix: string): string {
    36→  return `${KEY_PREFIX}${type}:${suffix}`;
    37→}
    38→
    39→// Lazy Redis connection for registry operations
    40→let registryRedis: ReturnType<typeof createRedisConnection> | null = null;
    41→
    42→function getRegistryRedis() {
    43→  if (!registryRedis) {
    44→    const redisUrl = process.env.REDIS_URL;
    45→    if (!redisUrl) {
    46→      throw new Error('REDIS_URL environment variable is required');
    47→    }
    48→    registryRedis = createRedisConnection(redisUrl);
    49→  }
    50→  return registryRedis;
    51→}
    52→
    53→/**
    54→ * Register a worker as running.
    55→ * Sets status to running, stores PID, and sets initial heartbeat.
    56→ */
    57→export async function registerWorker(type: WorkerType, pid: number): Promise<void> {
    58→  const redis = getRegistryRedis();
    59→  const now = Date.now();
    60→
    61→  // Use pipeline for atomic operations
    62→  const pipeline = redis.pipeline();
    63→  pipeline.set(getRedisKey(type, 'status'), 'running');
    64→  pipeline.set(getRedisKey(type, 'pid'), pid.toString());
    65→  pipeline.set(getRedisKey(type, 'startedAt'), now.toString());
    66→  pipeline.set(getRedisKey(type, 'lastTaskTime'), now.toString());
    67→  pipeline.setex(getRedisKey(type, 'heartbeat'), HEARTBEAT_TTL_SECONDS, now.toString());
    68→
    69→  await pipeline.exec();
    70→
    71→  console.log(`[WorkerRegistry] Registered worker ${type} with PID ${pid}`);
    72→}
    73→
    74→/**
    75→ * Deregister a worker (mark as stopped).
    76→ * Clears all worker keys.
    77→ */
    78→export async function deregisterWorker(type: WorkerType): Promise<void> {
    79→  const redis = getRegistryRedis();
    80→
    81→  const pipeline = redis.pipeline();
    82→  pipeline.set(getRedisKey(type, 'status'), 'stopped');
    83→  pipeline.del(getRedisKey(type, 'pid'));
    84→  pipeline.del(getRedisKey(type, 'heartbeat'));
    85→  pipeline.del(getRedisKey(type, 'startedAt'));
    86→  // Keep lastTaskTime for reference
    87→
    88→  await pipeline.exec();
    89→
    90→  console.log(`[WorkerRegistry] Deregistered worker ${type}`);
    91→}
    92→
    93→/**
    94→ * Send a heartbeat to indicate worker is alive.
    95→ */
    96→export async function sendHeartbeat(type: WorkerType): Promise<void> {
    97→  const redis = getRegistryRedis();
    98→  const now = Date.now();
    99→
   100→  await redis.setex(getRedisKey(type, 'heartbeat'), HEARTBEAT_TTL_SECONDS, now.toString());
   101→}
   102→
   103→/**
   104→ * Update the last task time (called when a task completes).
   105→ */
   106→export async function updateLastTaskTime(type: WorkerType): Promise<void> {
   107→  const redis = getRegistryRedis();
   108→  const now = Date.now();
   109→
   110→  await redis.set(getRedisKey(type, 'lastTaskTime'), now.toString());
   111→}
   112→
   113→/**
   114→ * Get the status of a specific worker.
   115→ */
   116→export async function getWorkerStatus(type: WorkerType): Promise<WorkerStatus> {
   117→  const redis = getRegistryRedis();
   118→
   119→  const [status, pid, heartbeat, lastTaskTime, startedAt] = await Promise.all([
   120→    redis.get(getRedisKey(type, 'status')),
   121→    redis.get(getRedisKey(type, 'pid')),
   122→    redis.get(getRedisKey(type, 'heartbeat')),
   123→    redis.get(getRedisKey(type, 'lastTaskTime')),
   124→    redis.get(getRedisKey(type, 'startedAt')),
   125→  ]);
   126→
   127→  // If no heartbeat or heartbeat expired, worker is stopped
   128→  const isRunning = status === 'running' && heartbeat !== null;
   129→
   130→  return {
   131→    type,
   132→    status: isRunning ? 'running' : 'stopped',
   133→    pid: pid ? p
... (truncated)
```

### Tool Call: Read
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/packages/core/src/services/dependency-resolver.ts`

### Tool Result
```
     1→/**
     2→ * Dependency Resolver
     3→ *
     4→ * Automatically queues blocked tasks when their dependencies complete.
     5→ * Called after any task completes successfully.
     6→ */
     7→
     8→import { db } from '@soloenterprise/db';
     9→import { tasks } from '@soloenterprise/db/schema';
    10→import { eq, inArray } from 'drizzle-orm';
    11→import { enqueueTask } from '../queue/task-queue';
    12→import { generateTechSpec } from '../agents/utils/architect-spec-generator';
    13→import { TaskLogger } from '../utils/task-logger';
    14→
    15→/**
    16→ * Check and queue tasks that were waiting on the completed task.
    17→ * Called when any task completes successfully.
    18→ *
    19→ * Flow:
    20→ * 1. Find all pending tasks
    21→ * 2. For each pending task, check if it depends on the completed task
    22→ * 3. If yes, check if ALL of its dependencies are now completed
    23→ * 4. If all deps are met, queue the task
    24→ */
    25→export async function resolveCompletedDependency(completedTaskId: string): Promise<void> {
    26→  const logger = new TaskLogger(completedTaskId);
    27→  logger.log('DependencyResolver',` Checking tasks blocked by ${completedTaskId}`);
    28→
    29→  try {
    30→    // Find all pending tasks that might be waiting on dependencies
    31→    const pendingTasks = await db.query.tasks.findMany({
    32→      where: eq(tasks.status, 'pending'),
    33→    });
    34→
    35→    if (pendingTasks.length === 0) {
    36→      logger.log('DependencyResolver', 'No pending tasks found');
    37→      return;
    38→    }
    39→
    40→    logger.log('DependencyResolver',` Found ${pendingTasks.length} pending task(s) to check`);
    41→
    42→    let queuedCount = 0;
    43→
    44→    for (const task of pendingTasks) {
    45→      const deps = task.dependsOn as string[] | null;
    46→
    47→      // Skip tasks with no dependencies (they should have been queued already)
    48→      if (!deps || deps.length === 0) {
    49→        continue;
    50→      }
    51→
    52→      // Check if this task depends on the completed task
    53→      if (!deps.includes(completedTaskId)) {
    54→        continue;
    55→      }
    56→
    57→      logger.log('DependencyResolver',` Task ${task.id} ("${task.name}") depends on completed task ${completedTaskId}`);
    58→
    59→      // Check if ALL dependencies are now completed
    60→      const depStatuses = await db.query.tasks.findMany({
    61→        where: inArray(tasks.id, deps),
    62→        columns: { id: true, status: true },
    63→      });
    64→
    65→      // Count how many dependencies are completed
    66→      const completedDeps = depStatuses.filter(d => d.status === 'completed');
    67→      const allDepsCompleted = completedDeps.length === deps.length;
    68→
    69→      if (allDepsCompleted) {
    70→        logger.log('DependencyResolver',` All ${deps.length} dependencies met for task ${task.id}, queuing...`);
    71→
    72→        // Generate architect tech spec before queuing (dependencies just resolved)
    73→        try {
    74→          const specResult = await generateTechSpec(task.id);
    75→          if (specResult) {
    76→            logger.log('DependencyResolver',` Tech spec generated for ${task.id}: ~${specResult.tokens} tokens`);
    77→          }
    78→        } catch (err) {
    79→          logger.warn('DependencyResolver',` Tech spec generation failed for ${task.id}: ${err instanceof Error ? err.message : String(err)}`);
    80→        }
    81→
    82→        try {
    83→          await enqueueTask(task.id, task.agentType, task.priority);
    84→          queuedCount++;
    85→          logger.log('DependencyResolver',` Queued task ${task.id} to ${task.agentType}-tasks queue`);
    86→        } catch (err) {
    87→          logger.error('DependencyResolver',` Failed to queue task ${task.id}: ${err instanceof Error ? err.message : String(err)}`);
    88→        }
    89→      } else {
    90→        // Show which dependencies are still pending
    91→        const stillPending = deps.filter(depId => {
    92→          const found = depStatuses.find(d => d.id === depId);
    93→          return !found || found.status !== 'completed';
    94→        });
    95→        logger.log('DependencyResolver',
    96→          `Task ${task.id} still waiting on ${stillPending.length} dep(s): [${stillPending.slice(0, 3).join(', ')}${stillPending.length > 3 ? '...' : ''}]`
    97→        );
    98→      }
    99→    }
   100→
   101→    if (queuedCount > 0) {
   102→      logger.log('DependencyResolver',` Queued ${queuedCount} task(s) that were waiting on ${completedTaskId}`);
   103→    } else {
   104→      logger.log('DependencyResolver',` No tasks became unblocked by ${completedTaskId}`);
   105→    }
   106→  } catch (error) {
   107→    logger.error('DependencyResolver',` Error resolving dependencies: ${error instanceof Error ? error.message : String(er
... (truncated)
```

### Tool Call: Read
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/packages/core/src/worker.ts`

### Tool Result
```
     1→/**
     2→ * Worker Entry Point
     3→ *
     4→ * Starts the agent workers and handles graceful shutdown.
     5→ * Loads environment variables from .env file in repo root.
     6→ * Integrates with worker registry for status tracking and idle timeout.
     7→ *
     8→ * Usage:
     9→ *   pnpm worker        - Start all workers
    10→ *   pnpm worker:echo   - Start echo worker only
    11→ *   pnpm worker:backend - Start backend worker only
    12→ */
    13→
    14→import { config } from 'dotenv';
    15→import { resolve, dirname } from 'path';
    16→import { fileURLToPath } from 'url';
    17→import type { Worker } from 'bullmq';
    18→import type { WorkerType } from './services/worker-registry';
    19→
    20→// Get directory of this file
    21→const __dirname = dirname(fileURLToPath(import.meta.url));
    22→
    23→// Load environment variables from repo root (packages/core/src -> repo root)
    24→config({ path: resolve(__dirname, '../../../.env') });
    25→
    26→// Validate required environment variables
    27→const requiredEnvVars = ['DATABASE_URL', 'REDIS_URL', 'ANTHROPIC_API_KEY'];
    28→for (const envVar of requiredEnvVars) {
    29→  if (!process.env[envVar]) {
    30→    console.error(`Missing required environment variable: ${envVar}`);
    31→    process.exit(1);
    32→  }
    33→}
    34→
    35→// Parse command line arguments
    36→const args = process.argv.slice(2);
    37→const workerType = args[0] || 'all';
    38→
    39→// Idle timeout configuration (default 5 minutes)
    40→const IDLE_TIMEOUT_MS = parseInt(process.env.WORKER_IDLE_TIMEOUT_MS || '300000', 10);
    41→const HEARTBEAT_INTERVAL_MS = 10000; // 10 seconds
    42→const IDLE_CHECK_INTERVAL_MS = 30000; // 30 seconds
    43→
    44→console.log('[Worker] Environment variables loaded');
    45→console.log(`[Worker] Idle timeout: ${IDLE_TIMEOUT_MS / 1000}s`);
    46→
    47→// Store workers and shutdown functions for cleanup
    48→const workers: { worker: Worker; shutdown: (w: Worker) => Promise<void>; type: string }[] = [];
    49→
    50→// Track last task time for idle timeout
    51→let lastTaskTime = Date.now();
    52→
    53→// Track active jobs to prevent shutdown during processing
    54→let activeJobCount = 0;
    55→
    56→// Intervals for cleanup
    57→let heartbeatInterval: NodeJS.Timeout | null = null;
    58→let idleCheckInterval: NodeJS.Timeout | null = null;
    59→
    60→// Flag to prevent multiple shutdowns
    61→let isShuttingDown = false;
    62→
    63→async function start() {
    64→  // Dynamic import after env is loaded
    65→  const {
    66→    createEchoWorker,
    67→    shutdownEchoWorker,
    68→    createBackendWorker,
    69→    shutdownBackendWorker,
    70→    createFrontendWorker,
    71→    shutdownFrontendWorker,
    72→    createQAWorker,
    73→    shutdownQAWorker,
    74→    createOrchestratorWorker,
    75→    shutdownOrchestratorWorker,
    76→    createScoperWorker,
    77→    shutdownScoperWorker,
    78→    createClientReporterWorker,
    79→    shutdownClientReporterWorker,
    80→  } = await import('./agents/index');
    81→
    82→  const {
    83→    registerWorker,
    84→    sendHeartbeat,
    85→    updateLastTaskTime,
    86→    isStopRequested,
    87→    clearStopRequest,
    88→  } = await import('./services/worker-registry');
    89→
    90→  const { publishTaskEvent } = await import('./services/task-events');
    91→  const { resolveCompletedDependency, handleFailedDependency, unblockDependentTasks } = await import('./services/dependency-resolver');
    92→
    93→  // Helper to setup worker event handlers
    94→  function setupWorkerEvents(worker: Worker, type: WorkerType) {
    95→    worker.on('completed', async (job) => {
    96→      activeJobCount = Math.max(0, activeJobCount - 1);
    97→      lastTaskTime = Date.now();
    98→      await updateLastTaskTime(type);
    99→      console.log(`[Worker] Task completed on ${type}, active jobs: ${activeJobCount}`);
   100→
   101→      // Publish task completion event for SSE subscribers
   102→      const taskId = job?.data?.taskId;
   103→      if (taskId) {
   104→        await publishTaskEvent({
   105→          type: 'task-completed',
   106→          taskId,
   107→          status: 'completed',
   108→          timestamp: Date.now(),
   109→        });
   110→        console.log(`[Worker] Published task-completed event for ${taskId}`);
   111→
   112→        // Check if any blocked tasks can now be queued
   113→        await resolveCompletedDependency(taskId);
   114→
   115→        // Also check for previously blocked tasks that can now be unblocked
   116→        await unblockDependentTasks(taskId);
   117→      }
   118→    });
   119→
   120→    worker.on('failed', async (job, error) => {
   121→      activeJobCount = Math.max(0, activeJobCount - 1);
   122→      console.log(`[Worker] Task failed on ${type}: ${error?.message}, active jobs: ${activeJobCount}`);
   123→
   124→      
... (truncated)
```

---
### Assistant
Good, I have all the context I need. Let me also check the existing projects page and schema for the activity API.

### Tool Call: Read
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/app/projects/page.tsx`

### Tool Result
```
     1→import { db } from "@/lib/db";
     2→import { projects, clients, projectScopes, projectBriefs } from "@soloenterprise/db/schema";
     3→import { desc, eq, inArray } from "drizzle-orm";
     4→import { ProjectsHubClient } from "./projects-hub-client";
     5→
     6→export const dynamic = "force-dynamic";
     7→
     8→export default async function ProjectsPage() {
     9→  const allProjects = await db.query.projects.findMany({
    10→    orderBy: [desc(projects.createdAt)],
    11→    with: {
    12→      scope: true,
    13→      client: true,
    14→    },
    15→  });
    16→
    17→  const allClients = await db.query.clients.findMany({
    18→    columns: { id: true, name: true },
    19→    orderBy: [desc(clients.createdAt)],
    20→  });
    21→
    22→  // For projects without a direct scope link (scopeId set on approval),
    23→  // resolve scope via projectScopes.projectId which is set at scope creation time.
    24→  const unscopedProjectIds = allProjects
    25→    .filter((p) => !p.scope)
    26→    .map((p) => p.id);
    27→
    28→  const scopeByProjectId: Record<string, { id: string; status: string }> = {};
    29→  if (unscopedProjectIds.length > 0) {
    30→    // Primary: direct projectId link on scope
    31→    const scopes = await db.query.projectScopes.findMany({
    32→      where: inArray(projectScopes.projectId, unscopedProjectIds),
    33→      columns: { id: true, projectId: true, status: true },
    34→    });
    35→    for (const scope of scopes) {
    36→      if (scope.projectId) {
    37→        scopeByProjectId[scope.projectId] = {
    38→          id: scope.id,
    39→          status: scope.status,
    40→        };
    41→      }
    42→    }
    43→
    44→    // Fallback for legacy scopes without projectId: match via brief title → project name
    45→    const stillUnresolved = unscopedProjectIds.filter((id) => !scopeByProjectId[id]);
    46→    if (stillUnresolved.length > 0) {
    47→      const unresolvedProjects = allProjects.filter((p) => stillUnresolved.includes(p.id));
    48→      const clientIds = [...new Set(unresolvedProjects.map((p) => p.clientId).filter(Boolean))] as string[];
    49→      if (clientIds.length > 0) {
    50→        const briefs = await db.query.projectBriefs.findMany({
    51→          where: inArray(projectBriefs.clientId, clientIds),
    52→          with: { scope: true },
    53→        });
    54→        const scopeByBriefTitle: Record<string, Record<string, { id: string; status: string }>> = {};
    55→        for (const brief of briefs) {
    56→          if (brief.scope && brief.clientId) {
    57→            if (!scopeByBriefTitle[brief.clientId]) scopeByBriefTitle[brief.clientId] = {};
    58→            scopeByBriefTitle[brief.clientId][brief.title] = {
    59→              id: brief.scope.id,
    60→              status: brief.scope.status,
    61→            };
    62→          }
    63→        }
    64→        for (const p of unresolvedProjects) {
    65→          if (p.clientId && scopeByBriefTitle[p.clientId]) {
    66→            const match = scopeByBriefTitle[p.clientId][p.name];
    67→            if (match) scopeByProjectId[p.id] = match;
    68→          }
    69→        }
    70→      }
    71→    }
    72→  }
    73→
    74→  // Enrich projects with scope resolved by direct projectId link
    75→  const enriched = allProjects.map((p) => ({
    76→    ...p,
    77→    briefScope: p.scope
    78→      ? { id: p.scope.id, status: p.scope.status }
    79→      : scopeByProjectId[p.id] || null,
    80→  }));
    81→
    82→  const serialized = JSON.parse(JSON.stringify(enriched));
    83→
    84→  return (
    85→    <ProjectsHubClient
    86→      projects={serialized}
    87→      companies={allClients}
    88→    />
    89→  );
    90→}
    91→
```

### Tool Call: Read
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/app/projects/projects-hub-client.tsx`

### Tool Result
```
     1→"use client";
     2→
     3→import { useRouter } from "next/navigation";
     4→import { ProjectTable } from "@/components/ProjectTable";
     5→
     6→interface ProjectsHubClientProps {
     7→  projects: any[];
     8→  companies: { id: string; name: string }[];
     9→}
    10→
    11→export function ProjectsHubClient({ projects, companies }: ProjectsHubClientProps) {
    12→  const router = useRouter();
    13→
    14→  return (
    15→    <div className="space-y-6">
    16→      <div className="flex items-center justify-between">
    17→        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
    18→      </div>
    19→
    20→      <ProjectTable
    21→        projects={projects}
    22→        showCompanyColumn
    23→        companies={companies}
    24→        onRefresh={() => router.refresh()}
    25→      />
    26→    </div>
    27→  );
    28→}
    29→
```

### Tool Call: Glob
**pattern:** src/app/api/workers/*/logs/route.ts

### Tool Result
```
/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/app/api/workers/[type]/logs/route.ts
/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/app/api/workers/all/logs/route.ts
```

### Tool Call: Read
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/app/api/workers/all/logs/route.ts`

### Tool Result
```
     1→import { NextResponse } from "next/server";
     2→import { db } from "@/lib/db";
     3→import { tasks } from "@soloenterprise/db/schema";
     4→import { eq, desc } from "drizzle-orm";
     5→import { readFileSync, existsSync } from "fs";
     6→import { resolve } from "path";
     7→import { getWorkerStatus, getAllWorkerStatuses } from "@soloenterprise/core/services";
     8→
     9→const AGENT_TYPES = [
    10→  "orchestrator",
    11→  "backend",
    12→  "frontend",
    13→  "qa",
    14→  "scoper",
    15→] as const;
    16→
    17→type AgentType = (typeof AGENT_TYPES)[number];
    18→
    19→/**
    20→ * Send SIGUSR1 to all running worker processes to flush buffered logs.
    21→ */
    22→async function signalAllWorkersFlush(): Promise<void> {
    23→  try {
    24→    const statuses = await getAllWorkerStatuses();
    25→    const pidsSignaled = new Set<number>();
    26→
    27→    for (const status of Object.values(statuses)) {
    28→      if (status.status === "running" && status.pid && !pidsSignaled.has(status.pid)) {
    29→        try {
    30→          process.kill(status.pid, "SIGUSR1");
    31→          pidsSignaled.add(status.pid);
    32→        } catch {
    33→          // Worker may have exited
    34→        }
    35→      }
    36→    }
    37→
    38→    if (pidsSignaled.size > 0) {
    39→      await new Promise((r) => setTimeout(r, 100));
    40→    }
    41→  } catch {
    42→    // Ignore signal errors
    43→  }
    44→}
    45→
    46→function readLogSafe(taskId: string): string {
    47→  const logPath = resolve(
    48→    process.cwd(),
    49→    "packages/core/generated/tasks",
    50→    taskId,
    51→    "task.log"
    52→  );
    53→  if (!existsSync(logPath)) return "";
    54→  try {
    55→    return readFileSync(logPath, "utf-8");
    56→  } catch {
    57→    return "";
    58→  }
    59→}
    60→
    61→/**
    62→ * GET /api/workers/all/logs
    63→ * Returns combined logs from the most recent task of each worker type.
    64→ * Sends SIGUSR1 to all running workers to flush buffered logs before reading.
    65→ */
    66→export async function GET() {
    67→  try {
    68→    // Signal all workers to flush their log buffers
    69→    await signalAllWorkersFlush();
    70→
    71→    const sections: string[] = [];
    72→    let anyRunning = false;
    73→
    74→    for (const type of AGENT_TYPES) {
    75→      const recentTask = await db.query.tasks.findFirst({
    76→        where: eq(tasks.agentType, type as AgentType),
    77→        orderBy: [desc(tasks.updatedAt)],
    78→        columns: { id: true, name: true, status: true, agentType: true },
    79→      });
    80→
    81→      if (!recentTask) continue;
    82→
    83→      const logs = readLogSafe(recentTask.id);
    84→      if (!logs) continue;
    85→
    86→      const isRunning = ["running", "queued"].includes(recentTask.status);
    87→      if (isRunning) anyRunning = true;
    88→
    89→      sections.push(
    90→        `${"=".repeat(80)}\n` +
    91→        `[${type.toUpperCase()}] ${recentTask.name} (${recentTask.status})\n` +
    92→        `Task: ${recentTask.id}\n` +
    93→        `${"=".repeat(80)}\n` +
    94→        logs
    95→      );
    96→    }
    97→
    98→    return NextResponse.json({
    99→      logs: sections.join("\n\n"),
   100→      taskId: null,
   101→      taskName: "All Workers — Combined Logs",
   102→      taskStatus: anyRunning ? "running" : null,
   103→      isRunning: anyRunning,
   104→    });
   105→  } catch (error) {
   106→    console.error("Failed to read combined worker logs:", error);
   107→    return NextResponse.json(
   108→      { error: "Failed to read logs" },
   109→      { status: 500 }
   110→    );
   111→  }
   112→}
   113→
```

### Tool Call: Read
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/app/api/workers/[type]/logs/route.ts`

### Tool Result
```
     1→import { NextResponse } from "next/server";
     2→import { db } from "@/lib/db";
     3→import { tasks } from "@soloenterprise/db/schema";
     4→import { eq, desc } from "drizzle-orm";
     5→import { readFileSync, existsSync } from "fs";
     6→import { resolve } from "path";
     7→import { getWorkerStatus } from "@soloenterprise/core/services";
     8→
     9→const VALID_AGENT_TYPES = [
    10→  "backend",
    11→  "orchestrator",
    12→  "frontend",
    13→  "qa",
    14→  "scoper",
    15→  "devops",
    16→  "feedback",
    17→];
    18→
    19→type AgentType = "orchestrator" | "backend" | "frontend" | "qa" | "devops" | "feedback" | "scoper";
    20→
    21→/**
    22→ * Send SIGUSR1 to the worker process to flush buffered logs to disk.
    23→ * Waits a short moment for the flush to complete before returning.
    24→ */
    25→async function signalWorkerFlush(agentType: string): Promise<void> {
    26→  try {
    27→    const status = await getWorkerStatus(agentType as AgentType);
    28→    if (status.status === "running" && status.pid) {
    29→      process.kill(status.pid, "SIGUSR1");
    30→      // Give the worker a moment to flush its buffers
    31→      await new Promise((r) => setTimeout(r, 100));
    32→    }
    33→  } catch {
    34→    // Worker may have exited — ignore signal errors
    35→  }
    36→}
    37→
    38→function readLogSafe(taskId: string): string {
    39→  const logPath = resolve(
    40→    process.cwd(),
    41→    "packages/core/generated/tasks",
    42→    taskId,
    43→    "task.log"
    44→  );
    45→  if (!existsSync(logPath)) return "";
    46→  try {
    47→    return readFileSync(logPath, "utf-8");
    48→  } catch {
    49→    return "";
    50→  }
    51→}
    52→
    53→/**
    54→ * GET /api/workers/:type/logs
    55→ * Returns logs from the most recent task for this worker/agent type.
    56→ * Sends SIGUSR1 to the worker to flush buffered logs before reading.
    57→ */
    58→export async function GET(
    59→  _request: Request,
    60→  { params }: { params: Promise<{ type: string }> }
    61→) {
    62→  try {
    63→    const { type } = await params;
    64→
    65→    if (!VALID_AGENT_TYPES.includes(type)) {
    66→      return NextResponse.json(
    67→        { error: `Invalid agent type: ${type}` },
    68→        { status: 400 }
    69→      );
    70→    }
    71→
    72→    // Signal the worker to flush its log buffer to disk
    73→    await signalWorkerFlush(type);
    74→
    75→    // Find the most recent running or recently completed task for this agent type
    76→    const recentTask = await db.query.tasks.findFirst({
    77→      where: eq(tasks.agentType, type as AgentType),
    78→      orderBy: [desc(tasks.updatedAt)],
    79→      columns: { id: true, name: true, status: true, agentType: true },
    80→    });
    81→
    82→    if (!recentTask) {
    83→      return NextResponse.json({
    84→        logs: "",
    85→        taskId: null,
    86→        taskName: null,
    87→        isRunning: false,
    88→      });
    89→    }
    90→
    91→    const logs = readLogSafe(recentTask.id);
    92→    const isRunning = ["running", "queued"].includes(recentTask.status);
    93→
    94→    return NextResponse.json({
    95→      logs,
    96→      taskId: recentTask.id,
    97→      taskName: recentTask.name,
    98→      taskStatus: recentTask.status,
    99→      isRunning,
   100→    });
   101→  } catch (error) {
   102→    console.error("Failed to read worker logs:", error);
   103→    return NextResponse.json(
   104→      { error: "Failed to read logs" },
   105→      { status: 500 }
   106→    );
   107→  }
   108→}
   109→
```

---
### Assistant
Now I have everything. Let me implement Track A first. I'll create/edit all the files.

## Track A: On-Demand Worker Startup

Starting with the worker-supervisor, then the hooks, then cleaning up the API routes.

### Tool Call: Write
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/packages/core/src/services/worker-supervisor.ts`
**Content:**
```typescript
/**
 * Worker Supervisor
 *
 * On-demand worker startup. Instead of spawning ALL workers when a task
 * is created, this module ensures only the needed worker type is running.
 *
 * Workers are shared across projects — one backend worker processes
 * backend tasks for ALL projects sequentially.
 */

import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getWorkerStatus } from './worker-registry';
import type { WorkerType } from './worker-registry';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve repo root from packages/core/src/services -> repo root
const REPO_ROOT = resolve(__dirname, '../../../../');

// In-process debounce: skip if same type was spawned in last 15s
const recentSpawns = new Map<string, number>();
const DEBOUNCE_MS = 15_000;

// Map agent types to their worker script names
const AGENT_TO_SCRIPT: Record<string, string> = {
  orchestrator: 'worker:orchestrator',
  backend: 'worker:backend',
  frontend: 'worker:frontend',
  qa: 'worker:qa',
  scoper: 'worker:scoper',
  'client-reporter': 'worker:client-reporter',
  echo: 'worker:echo',
};

/**
 * Ensure the worker for the given agent type is running.
 * If already running or recently spawned, does nothing.
 *
 * This function NEVER throws — supervisor failure must not block task creation.
 */
export async function ensureWorkerRunning(
  agentType: string
): Promise<{ started: boolean; pid?: number }> {
  try {
    const scriptName = AGENT_TO_SCRIPT[agentType];
    if (!scriptName) {
      console.log(`[WorkerSupervisor] No worker script for agent type: ${agentType}`);
      return { started: false };
    }

    // Debounce: skip if recently spawned
    const lastSpawn = recentSpawns.get(agentType);
    if (lastSpawn && Date.now() - lastSpawn < DEBOUNCE_MS) {
      console.log(`[WorkerSupervisor] Debounced spawn for ${agentType} (spawned ${Math.round((Date.now() - lastSpawn) / 1000)}s ago)`);
      return { started: false };
    }

    // Check registry status
    const status = await getWorkerStatus(agentType as WorkerType);
    if (status.status === 'running') {
      return { started: false };
    }

    // Spawn the worker
    console.log(`[WorkerSupervisor] Starting ${agentType} worker...`);
    const child = spawn('pnpm', [scriptName], {
      detached: true,
      stdio: 'ignore',
      cwd: REPO_ROOT,
      env: { ...process.env },
    });
    child.unref();

    recentSpawns.set(agentType, Date.now());

    console.log(`[WorkerSupervisor] Started ${agentType} worker (PID: ${child.pid})`);
    return { started: true, pid: child.pid ?? undefined };
  } catch (err) {
    console.error(`[WorkerSupervisor] Failed to ensure ${agentType} worker:`, err);
    return { started: false };
  }
}

```

### Tool Result
```
File created successfully at: /Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/packages/core/src/services/worker-supervisor.ts
```

### Tool Call: Edit
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/packages/core/src/services/index.ts`
**Old:**
```
export * from './dependency-resolver';
```
**New:**
```
export * from './dependency-resolver';
export * from './worker-supervisor';
```

### Tool Result
```
The file /Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/packages/core/src/services/index.ts has been updated successfully.
```

---
### Assistant
Now add the hooks into `createTask()` and `enqueueTask()`.

### Tool Call: Edit
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/packages/core/src/services/task-service.ts`
**Old:**
```
  console.log(`[TaskService] Created task ${task.id} and enqueued to ${queueName}`);

  return { taskId: task.id, jobId: job.id! };
```
**New:**
```
  console.log(`[TaskService] Created task ${task.id} and enqueued to ${queueName}`);

  // On-demand worker startup — ensure the right worker type is running
  try {
    const { ensureWorkerRunning } = await import('./worker-supervisor');
    await ensureWorkerRunning(input.agentType);
  } catch (err) {
    console.error(`[TaskService] Worker supervisor failed (non-blocking):`, err);
  }

  return { taskId: task.id, jobId: job.id! };
```

### Tool Result
```
The file /Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/packages/core/src/services/task-service.ts has been updated successfully.
```

### Tool Call: Edit
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/packages/core/src/queue/task-queue.ts`
**Old:**
```
  console.log(`[TaskQueue] Enqueued task ${taskId} to ${agentType} queue (job: ${job.id})`);

  return job;
```
**New:**
```
  console.log(`[TaskQueue] Enqueued task ${taskId} to ${agentType} queue (job: ${job.id})`);

  // On-demand worker startup — ensure the right worker type is running
  try {
    const { ensureWorkerRunning } = await import('../services/worker-supervisor');
    await ensureWorkerRunning(agentType);
  } catch (err) {
    console.error(`[TaskQueue] Worker supervisor failed (non-blocking):`, err);
  }

  return job;
```

### Tool Result
```
The file /Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/packages/core/src/queue/task-queue.ts has been updated successfully.
```

---
### Assistant
Now remove the "start ALL workers" blocks from the API routes.

### Tool Call: Edit
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/app/api/companies/[companyId]/projects/route.ts`
**Old:**
```
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projectBriefs, projects, clients } from "@soloenterprise/db/schema";
import { eq } from "drizzle-orm";
import { spawn } from "child_process";
```
**New:**
```
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projectBriefs, projects, clients } from "@soloenterprise/db/schema";
import { eq } from "drizzle-orm";
```

### Tool Result
```
The file /Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/app/api/companies/[companyId]/projects/route.ts has been updated successfully.
```

### Tool Call: Edit
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/app/api/companies/[companyId]/projects/route.ts`
**Old:**
```
    // 4. Auto-start workers if all are stopped
    let workersStarted = false;
    try {
      const { getAllWorkerStatuses } = await import("@soloenterprise/core/services");
      const statuses = await getAllWorkerStatuses();
      const allStopped = Object.values(statuses).every(
        (s: any) => s.status === "stopped" || s.status === "unknown"
      );

      if (allStopped) {
        const child = spawn("pnpm", ["worker"], {
          detached: true,
          stdio: "ignore",
          cwd: process.cwd(),
          env: { ...process.env },
        });
        child.unref();
        workersStarted = true;
        console.log(`[CreateProject] Started all workers (PID: ${child.pid})`);
      }
    } catch (err) {
      console.error("[CreateProject] Failed to check/start workers:", err);
    }

    return NextResponse.json(
      {
        briefId: brief.id,
        projectId: project.id,
        taskId: result.taskId,
        jobId: result.jobId,
        status: "received",
        workersStarted,
      },
      { status: 201 }
    );
```
**New:**
```
    // Worker startup is now handled automatically by the worker supervisor
    // inside createTask() — only the needed worker type starts on demand.

    return NextResponse.json(
      {
        briefId: brief.id,
        projectId: project.id,
        taskId: result.taskId,
        jobId: result.jobId,
        status: "received",
      },
      { status: 201 }
    );
```

### Tool Result
```
The file /Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/app/api/companies/[companyId]/projects/route.ts has been updated successfully.
```

---
### Assistant
Now the scope approval route.

### Tool Call: Edit
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/app/api/scopes/[id]/approve/route.ts`
**Old:**
```
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projectScopes, projects } from "@soloenterprise/db/schema";
import { and, eq } from "drizzle-orm";
import { spawn } from "child_process";
```
**New:**
```
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projectScopes, projects } from "@soloenterprise/db/schema";
import { and, eq } from "drizzle-orm";
```

### Tool Result
```
The file /Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/app/api/scopes/[id]/approve/route.ts has been updated successfully.
```

### Tool Call: Edit
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/app/api/scopes/[id]/approve/route.ts`
**Old:**
```
    let orchestratorTaskId: string | null = null;
    let workersStarted = false;

    if (project) {
      // 2. Bidirectional link: project ↔ scope, set project to active
      await db
        .update(projects)
        .set({
          scopeId: scope.id,
          status: "active",
          updatedAt: new Date(),
        })
        .where(eq(projects.id, project.id));

      await db
        .update(projectScopes)
        .set({ projectId: project.id, updatedAt: new Date() })
        .where(eq(projectScopes.id, scope.id));

      // 3. Check worker statuses and start if needed
      try {
        const { getAllWorkerStatuses } = await import("@soloenterprise/core/services");
        const statuses = await getAllWorkerStatuses();
        const allStopped = Object.values(statuses).every(
          (s: any) => s.status === "stopped" || s.status === "unknown"
        );

        if (allStopped) {
          const child = spawn("pnpm", ["worker"], {
            detached: true,
            stdio: "ignore",
            cwd: process.cwd(),
            env: { ...process.env },
          });
          child.unref();
          workersStarted = true;
          console.log(`[Approve] Started all workers (PID: ${child.pid})`);
        }
      } catch (err) {
        console.error("[Approve] Failed to check/start workers:", err);
      }

      // 4. Create orchestrator task
```
**New:**
```
    let orchestratorTaskId: string | null = null;

    if (project) {
      // 2. Bidirectional link: project ↔ scope, set project to active
      await db
        .update(projects)
        .set({
          scopeId: scope.id,
          status: "active",
          updatedAt: new Date(),
        })
        .where(eq(projects.id, project.id));

      await db
        .update(projectScopes)
        .set({ projectId: project.id, updatedAt: new Date() })
        .where(eq(projectScopes.id, scope.id));

      // Worker startup is now handled automatically by the worker supervisor
      // inside createTask() — only the needed worker type starts on demand.

      // 3. Create orchestrator task
```

### Tool Result
```
The file /Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/app/api/scopes/[id]/approve/route.ts has been updated successfully.
```

### Tool Call: Edit
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/app/api/scopes/[id]/approve/route.ts`
**Old:**
```
    return NextResponse.json({
      ...updated,
      orchestratorTaskId,
      workersStarted,
      projectId: project?.id ?? null,
    });
```
**New:**
```
    return NextResponse.json({
      ...updated,
      orchestratorTaskId,
      projectId: project?.id ?? null,
    });
```

### Tool Result
```
The file /Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/app/api/scopes/[id]/approve/route.ts has been updated successfully.
```

---
### Assistant
Now add the missing worker scripts to package.json files.

### Tool Call: Edit
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/package.json`
**Old:**
```
    "worker:orchestrator": "pnpm --filter @soloenterprise/core worker:orchestrator"
```
**New:**
```
    "worker:orchestrator": "pnpm --filter @soloenterprise/core worker:orchestrator",
    "worker:scoper": "pnpm --filter @soloenterprise/core worker:scoper",
    "worker:client-reporter": "pnpm --filter @soloenterprise/core worker:client-reporter"
```

### Tool Result
```
The file /Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/package.json has been updated successfully.
```

### Tool Call: Edit
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/packages/core/package.json`
**Old:**
```
    "worker:scoper": "tsx src/worker.ts scoper"
```
**New:**
```
    "worker:scoper": "tsx src/worker.ts scoper",
    "worker:client-reporter": "tsx src/worker.ts client-reporter"
```

### Tool Result
```
The file /Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/packages/core/package.json has been updated successfully.
```

---
### Assistant
Track A is done. Now Track B.

### Tool Call: TaskUpdate
**taskId:** 1
**status:** completed

### Tool Result
```
Updated task #1 status
```

### Tool Call: TaskUpdate
**taskId:** 2
**status:** in_progress

### Tool Result
```
Updated task #2 status
```

---
### Assistant
## Track B: Per-Project Activity Dashboard

Let me check what schema fields are available for the tasks table.

### Tool Call: Grep
**pattern:** export const tasks =
**path:** /Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/packages/db/src/schema.ts
**output_mode:** content
**-A:** 30

### Tool Result
```
154:export const tasks = pgTable('tasks', {
155-  id: uuid('id').primaryKey().defaultRandom(),
156-  
157-  // Relationships
158-  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
159-  parentTaskId: uuid('parent_task_id').references((): any => tasks.id, { onDelete: 'set null' }),
160-  
161-  // Basic info
162-  name: text('name').notNull(),
163-  description: text('description').notNull(),
164-  
165-  // Assignment
166-  agentType: agentTypeEnum('agent_type').notNull(),
167-  assignedAgentId: text('assigned_agent_id'), // Runtime agent instance ID
168-  
169-  // Status
170-  status: taskStatusEnum('status').notNull().default('pending'),
171-  priority: taskPriorityEnum('priority').notNull().default('medium'),
172-  
173-  // Dependencies (task IDs that must complete before this task can start)
174-  dependsOn: uuid('depends_on').array(),
175-  
176-  // Files this task will modify (for lock acquisition)
177-  filesToModify: text('files_to_modify').array(),
178-  
179-  // Quality gates that must pass
180-  requiredGates: text('required_gates').array(),
181-  
182-  // Input context for the agent
183-  context: jsonb('context').$type<{
184-    requirements?: string;
```

---
### Assistant
Now let me create the Track B files. Starting with the APIs and then the components.

### Tool Call: Write
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/app/api/projects/[id]/activity/route.ts`
**Content:**
```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks, projects } from "@soloenterprise/db/schema";
import { eq, and, count, sql } from "drizzle-orm";

const AGENT_TYPES = [
  "orchestrator",
  "backend",
  "frontend",
  "qa",
  "scoper",
  "client-reporter",
] as const;

type AgentStatus = "running" | "completed" | "pending" | "idle" | "failed";

interface AgentActivity {
  status: AgentStatus;
  taskCount: number;
  activeTask: { id: string; name: string; status: string } | null;
  recentTask: { id: string; name: string; status: string } | null;
}

/**
 * GET /api/projects/:id/activity
 *
 * Returns per-agent activity for a project: task counts, active/recent tasks,
 * and derived agent statuses.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify project exists
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, id),
      columns: { id: true, name: true, status: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Fetch all tasks for this project
    const projectTasks = await db.query.tasks.findMany({
      where: eq(tasks.projectId, id),
      columns: {
        id: true,
        name: true,
        status: true,
        agentType: true,
        updatedAt: true,
      },
      orderBy: (tasks, { desc }) => [desc(tasks.updatedAt)],
    });

    // Group tasks by agent type
    const agents: Record<string, AgentActivity> = {};

    for (const type of AGENT_TYPES) {
      const typeTasks = projectTasks.filter((t) => t.agentType === type);

      if (typeTasks.length === 0) {
        agents[type] = {
          status: "idle",
          taskCount: 0,
          activeTask: null,
          recentTask: null,
        };
        continue;
      }

      const running = typeTasks.find((t) => t.status === "running");
      const queued = typeTasks.find((t) => t.status === "queued");
      const failed = typeTasks.find((t) => t.status === "failed");
      const allCompleted = typeTasks.every((t) => t.status === "completed");
      const anyPending = typeTasks.some(
        (t) => t.status === "pending" || t.status === "queued" || t.status === "blocked"
      );

      let status: AgentStatus;
      if (running || queued) {
        status = "running";
      } else if (allCompleted) {
        status = "completed";
      } else if (failed && !anyPending) {
        status = "failed";
      } else if (anyPending) {
        status = "pending";
      } else {
        status = "idle";
      }

      const activeTask = running || queued || null;
      const recentTask = typeTasks[0]; // Already sorted by updatedAt desc

      agents[type] = {
        status,
        taskCount: typeTasks.length,
        activeTask: activeTask
          ? { id: activeTask.id, name: activeTask.name, status: activeTask.status }
          : null,
        recentTask: recentTask
          ? { id: recentTask.id, name: recentTask.name, status: recentTask.status }
          : null,
      };
    }

    // Aggregate counts
    const totalTasks = projectTasks.length;
    const completedTasks = projectTasks.filter((t) => t.status === "completed").length;
    const runningTasks = projectTasks.filter(
      (t) => t.status === "running" || t.status === "queued"
    ).length;
    const pendingTasks = projectTasks.filter(
      (t) => t.status === "pending" || t.status === "blocked"
    ).length;
    const failedTasks = projectTasks.filter((t) => t.status === "failed").length;

    return NextResponse.json({
      projectId: id,
      projectName: project.name,
      projectStatus: project.status,
      agents,
      totalTasks,
      completedTasks,
      runningTasks,
      pendingTasks,
      failedTasks,
    });
  } catch (error) {
    console.error("Failed to fetch project activity:", error);
    return NextResponse.json(
      { error: "Failed to fetch project activity" },
      { status: 500 }
    );
  }
}

```

### Tool Result
```
File created successfully at: /Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/app/api/projects/[id]/activity/route.ts
```

### Tool Call: Write
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/app/api/projects/[id]/logs/route.ts`
**Content:**
```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks } from "@soloenterprise/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { getWorkerStatus, getAllWorkerStatuses } from "@soloenterprise/core/services";

function readLogSafe(taskId: string): string {
  const logPath = resolve(
    process.cwd(),
    "packages/core/generated/tasks",
    taskId,
    "task.log"
  );
  if (!existsSync(logPath)) return "";
  try {
    return readFileSync(logPath, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Signal workers to flush buffered logs before reading.
 */
async function signalWorkersFlush(agentType?: string): Promise<void> {
  try {
    const pidsSignaled = new Set<number>();

    if (agentType) {
      const status = await getWorkerStatus(agentType as any);
      if (status.status === "running" && status.pid) {
        try {
          process.kill(status.pid, "SIGUSR1");
          pidsSignaled.add(status.pid);
        } catch {
          // Worker may have exited
        }
      }
    } else {
      const statuses = await getAllWorkerStatuses();
      for (const status of Object.values(statuses)) {
        if (status.status === "running" && status.pid && !pidsSignaled.has(status.pid)) {
          try {
            process.kill(status.pid, "SIGUSR1");
            pidsSignaled.add(status.pid);
          } catch {
            // Worker may have exited
          }
        }
      }
    }

    if (pidsSignaled.size > 0) {
      await new Promise((r) => setTimeout(r, 100));
    }
  } catch {
    // Ignore signal errors
  }
}

/**
 * GET /api/projects/:id/logs?agentType=backend
 *
 * Returns combined logs for all tasks in a project, optionally filtered by agent type.
 * Follows the same pattern as GET /api/workers/all/logs.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const agentType = searchParams.get("agentType");

    // Signal workers to flush log buffers
    await signalWorkersFlush(agentType || undefined);

    // Build query conditions
    const conditions = [eq(tasks.projectId, id)];
    if (agentType) {
      conditions.push(eq(tasks.agentType, agentType as any));
    }

    // Fetch tasks for this project
    const projectTasks = await db.query.tasks.findMany({
      where: and(...conditions),
      orderBy: [desc(tasks.updatedAt)],
      columns: { id: true, name: true, status: true, agentType: true },
    });

    if (projectTasks.length === 0) {
      return NextResponse.json({
        logs: "",
        taskCount: 0,
        isRunning: false,
      });
    }

    const sections: string[] = [];
    let anyRunning = false;

    for (const task of projectTasks) {
      const logs = readLogSafe(task.id);
      if (!logs) continue;

      const isRunning = ["running", "queued"].includes(task.status);
      if (isRunning) anyRunning = true;

      sections.push(
        `${"=".repeat(80)}\n` +
        `[${task.agentType.toUpperCase()}] ${task.name} (${task.status})\n` +
        `Task: ${task.id}\n` +
        `${"=".repeat(80)}\n` +
        logs
      );
    }

    return NextResponse.json({
      logs: sections.join("\n\n"),
      taskCount: projectTasks.length,
      isRunning: anyRunning,
      taskName: agentType
        ? `${agentType} logs for project`
        : "All agent logs for project",
      taskStatus: anyRunning ? "running" : null,
    });
  } catch (error) {
    console.error("Failed to read project logs:", error);
    return NextResponse.json(
      { error: "Failed to read logs" },
      { status: 500 }
    );
  }
}

```

### Tool Result
```
File created successfully at: /Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/app/api/projects/[id]/logs/route.ts
```

---
### Assistant
Now the `WorkerLogModal` — add the `logEndpoint` prop.

### Tool Call: Edit
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/components/WorkerLogModal.tsx`
**Old:**
```
interface WorkerLogModalProps {
  workerType: string;
  onClose: () => void;
}

export function WorkerLogModal({ workerType, onClose }: WorkerLogModalProps) {
```
**New:**
```
interface WorkerLogModalProps {
  workerType: string;
  onClose: () => void;
  /** Custom log endpoint URL. Defaults to /api/workers/{workerType}/logs */
  logEndpoint?: string;
}

export function WorkerLogModal({ workerType, onClose, logEndpoint }: WorkerLogModalProps) {
```

### Tool Result
```
The file /Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/components/WorkerLogModal.tsx has been updated successfully.
```

### Tool Call: Edit
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/components/WorkerLogModal.tsx`
**Old:**
```
      const response = await fetch(`/api/workers/${workerType}/logs`);
```
**New:**
```
      const url = logEndpoint ?? `/api/workers/${workerType}/logs`;
      const response = await fetch(url);
```

### Tool Result
```
The file /Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/components/WorkerLogModal.tsx has been updated successfully.
```

---
### Assistant
Now add `client-reporter` to the global dashboard.

### Tool Call: Edit
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/components/WorkerDashboardPanel.tsx`
**Old:**
```
type WorkerType = "orchestrator" | "backend" | "frontend" | "qa" | "scoper";
```
**New:**
```
type WorkerType = "orchestrator" | "backend" | "frontend" | "qa" | "scoper" | "client-reporter";
```

### Tool Result
```
The file /Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/components/WorkerDashboardPanel.tsx has been updated successfully.
```

### Tool Call: Edit
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/components/WorkerDashboardPanel.tsx`
**Old:**
```
const WORKER_TYPES: WorkerType[] = ["orchestrator", "backend", "frontend", "qa", "scoper"];
```
**New:**
```
const WORKER_TYPES: WorkerType[] = ["orchestrator", "backend", "frontend", "qa", "scoper", "client-reporter"];
```

### Tool Result
```
The file /Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/components/WorkerDashboardPanel.tsx has been updated successfully.
```

---
### Assistant
Now update the `actionInProgress` initial state to include client-reporter.

### Tool Call: Edit
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/components/WorkerDashboardPanel.tsx`
**Old:**
```
  const [actionInProgress, setActionInProgress] = useState<Record<WorkerType, boolean>>({
    orchestrator: false,
    backend: false,
    frontend: false,
    qa: false,
    scoper: false,
  });
```
**New:**
```
  const [actionInProgress, setActionInProgress] = useState<Record<WorkerType, boolean>>({
    orchestrator: false,
    backend: false,
    frontend: false,
    qa: false,
    scoper: false,
    "client-reporter": false,
  });
```

### Tool Result
```
The file /Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/components/WorkerDashboardPanel.tsx has been updated successfully.
```

---
### Assistant
Now I need to update the dashboard page that renders the `WorkerDashboardPanel` to also fetch the `client-reporter` status. Let me find it.

### Tool Call: Grep
**pattern:** WorkerDashboardPanel
**output_mode:** files_with_matches
**glob:** src/app/**/*.tsx

### Tool Result
```
Found 1 file
src/app/page.tsx
```

### Tool Call: Read
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/app/page.tsx`

### Tool Result
```
     1→import { db } from "@/lib/db";
     2→import { projects, tasks, questions, fileLocks } from "@soloenterprise/db/schema";
     3→import { eq, count, desc, or, isNull } from "drizzle-orm";
     4→import Link from "next/link";
     5→import { RecentTasks } from "@/components";
     6→import { WorkerDashboardPanel } from "@/components/WorkerDashboardPanel";
     7→import { DashboardHeader } from "@/components/DashboardHeader";
     8→import { getWorkerStatus } from "@soloenterprise/core";
     9→
    10→export const dynamic = "force-dynamic";
    11→
    12→async function getStats() {
    13→  const [projectCount] = await db
    14→    .select({ count: count() })
    15→    .from(projects);
    16→
    17→  const [pendingTasks] = await db
    18→    .select({ count: count() })
    19→    .from(tasks)
    20→    .where(eq(tasks.status, "pending"));
    21→
    22→  const [runningTasks] = await db
    23→    .select({ count: count() })
    24→    .from(tasks)
    25→    .where(eq(tasks.status, "running"));
    26→
    27→  const [waitingHumanTasks] = await db
    28→    .select({ count: count() })
    29→    .from(tasks)
    30→    .where(eq(tasks.status, "waiting_human"));
    31→
    32→  const [pendingQuestions] = await db
    33→    .select({ count: count() })
    34→    .from(questions)
    35→    .where(eq(questions.status, "pending"));
    36→
    37→  const [activeLocksCount] = await db
    38→    .select({ count: count() })
    39→    .from(fileLocks);
    40→
    41→  return {
    42→    projects: projectCount.count,
    43→    pendingTasks: pendingTasks.count,
    44→    runningTasks: runningTasks.count,
    45→    waitingHuman: waitingHumanTasks.count,
    46→    pendingQuestions: pendingQuestions.count,
    47→    activeLocks: activeLocksCount.count,
    48→  };
    49→}
    50→
    51→async function getPendingQuestions() {
    52→  return db.query.questions.findMany({
    53→    where: eq(questions.status, "pending"),
    54→    limit: 5,
    55→    orderBy: (questions, { asc }) => [asc(questions.createdAt)],
    56→  });
    57→}
    58→
    59→async function getRecentTasks() {
    60→  const dbTasks = await db.query.tasks.findMany({
    61→    where: or(eq(tasks.archived, false), isNull(tasks.archived)), // Filter out archived tasks (include null as not archived)
    62→    limit: 50,
    63→    orderBy: [desc(tasks.createdAt)],
    64→    with: {
    65→      project: true,
    66→    },
    67→  });
    68→
    69→  // Serialize for client component (Date -> string)
    70→  return dbTasks.map((task) => ({
    71→    id: task.id,
    72→    name: task.name,
    73→    description: task.description,
    74→    status: task.status,
    75→    agentType: task.agentType,
    76→    attemptCount: task.attemptCount,
    77→    maxAttempts: task.maxAttempts,
    78→    createdAt: task.createdAt.toISOString(),
    79→    processingStartedAt: task.processingStartedAt?.toISOString() ?? null,
    80→    project: task.project ? { id: task.project.id, name: task.project.name } : null,
    81→    warnings: task.warnings ?? null,
    82→    dependsOn: task.dependsOn ?? [],
    83→    context: task.context ?? null,
    84→    imageAttachments: task.imageAttachments ?? null,
    85→    imageRequirements: task.imageRequirements ?? null,
    86→    imageRequirementsTokens: task.imageRequirementsTokens ?? null,
    87→  }));
    88→}
    89→
    90→interface StaleTaskWarnings {
    91→  stalePendingCount: number;
    92→  stuckRunningCount: number;
    93→}
    94→
    95→function calculateStaleTaskWarnings(recentTasks: Awaited<ReturnType<typeof getRecentTasks>>): StaleTaskWarnings {
    96→  const now = Date.now();
    97→  const ONE_HOUR = 60 * 60 * 1000;
    98→  const SIX_HOURS = 6 * 60 * 60 * 1000;
    99→
   100→  let stalePendingCount = 0;
   101→  let stuckRunningCount = 0;
   102→
   103→  for (const task of recentTasks) {
   104→    // Pending tasks with no dependencies, older than 1 hour
   105→    if (task.status === "pending") {
   106→      const age = now - new Date(task.createdAt).getTime();
   107→      const hasDependencies = task.dependsOn && task.dependsOn.length > 0;
   108→      if (age > ONE_HOUR && !hasDependencies) {
   109→        stalePendingCount++;
   110→      }
   111→    }
   112→
   113→    // Running tasks older than 6 hours
   114→    if (task.status === "running" && task.processingStartedAt) {
   115→      const runningTime = now - new Date(task.processingStartedAt).getTime();
   116→      if (runningTime > SIX_HOURS) {
   117→        stuckRunningCount++;
   118→      }
   119→    }
   120→  }
   121→
   122→  return { stalePendingCount, stuckRunningCount };
   123→}
   124→
   125→async function getWorkerStatuses() {
   126→  const [orchestratorStatus, backendStatus, frontendStatus, qaStatus, scoperStatus] = await Promise.all([
   127→    getWorkerStatus("orchestrator"),
   128→    getWorkerStatus("backend"),
   129→    getWorkerStatus("frontend"),
   130→    getWorkerSta
... (truncated)
```

---
### Assistant
I need to add `client-reporter` to the `getWorkerStatuses()` function.

### Tool Call: Edit
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/app/page.tsx`
**Old:**
```
async function getWorkerStatuses() {
  const [orchestratorStatus, backendStatus, frontendStatus, qaStatus, scoperStatus] = await Promise.all([
    getWorkerStatus("orchestrator"),
    getWorkerStatus("backend"),
    getWorkerStatus("frontend"),
    getWorkerStatus("qa"),
    getWorkerStatus("scoper"),
  ]);
  return { orchestrator: orchestratorStatus, backend: backendStatus, frontend: frontendStatus, qa: qaStatus, scoper: scoperStatus };
}
```
**New:**
```
async function getWorkerStatuses() {
  const [orchestratorStatus, backendStatus, frontendStatus, qaStatus, scoperStatus, clientReporterStatus] = await Promise.all([
    getWorkerStatus("orchestrator"),
    getWorkerStatus("backend"),
    getWorkerStatus("frontend"),
    getWorkerStatus("qa"),
    getWorkerStatus("scoper"),
    getWorkerStatus("client-reporter"),
  ]);
  return { orchestrator: orchestratorStatus, backend: backendStatus, frontend: frontendStatus, qa: qaStatus, scoper: scoperStatus, "client-reporter": clientReporterStatus };
}
```

### Tool Result
```
The file /Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/app/page.tsx has been updated successfully.
```

---
### Assistant
Now also add `client-reporter` to the `AGENT_TYPES` array in the all-logs route.

### Tool Call: Edit
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/app/api/workers/all/logs/route.ts`
**Old:**
```
const AGENT_TYPES = [
  "orchestrator",
  "backend",
  "frontend",
  "qa",
  "scoper",
] as const;
```
**New:**
```
const AGENT_TYPES = [
  "orchestrator",
  "backend",
  "frontend",
  "qa",
  "scoper",
  "client-reporter",
] as const;
```

### Tool Result
```
The file /Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/app/api/workers/all/logs/route.ts has been updated successfully.
```

---
### Assistant
Also add `client-reporter` to the valid types in the per-worker logs route.

### Tool Call: Edit
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/app/api/workers/[type]/logs/route.ts`
**Old:**
```
const VALID_AGENT_TYPES = [
  "backend",
  "orchestrator",
  "frontend",
  "qa",
  "scoper",
  "devops",
  "feedback",
];
```
**New:**
```
const VALID_AGENT_TYPES = [
  "backend",
  "orchestrator",
  "frontend",
  "qa",
  "scoper",
  "client-reporter",
  "devops",
  "feedback",
];
```

### Tool Result
```
The file /Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/app/api/workers/[type]/logs/route.ts has been updated successfully.
```

---
### Assistant
Now create the `ProjectActivityPanel` component.

### Tool Call: Write
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/components/ProjectActivityPanel.tsx`
**Content:**
```tsx
"use client";

import { useState } from "react";
import { WorkerLogModal } from "./WorkerLogModal";

type AgentStatus = "running" | "completed" | "pending" | "idle" | "failed";

interface AgentActivity {
  status: AgentStatus;
  taskCount: number;
  activeTask: { id: string; name: string; status: string } | null;
  recentTask: { id: string; name: string; status: string } | null;
}

interface ProjectActivityData {
  projectId: string;
  projectName: string;
  projectStatus: string;
  agents: Record<string, AgentActivity>;
  totalTasks: number;
  completedTasks: number;
  runningTasks: number;
  pendingTasks: number;
  failedTasks: number;
}

interface ProjectActivityPanelProps {
  activity: ProjectActivityData;
}

// Pipeline stages in execution order
const PIPELINE_STAGES = [
  { key: "scoper", label: "Scoper" },
  { key: "orchestrator", label: "Orchestrator" },
  { key: "backend", label: "Backend" },
  { key: "frontend", label: "Frontend" },
  { key: "qa", label: "QA" },
  { key: "client-reporter", label: "Reporter" },
] as const;

const STATUS_COLORS: Record<AgentStatus, { dot: string; bg: string; text: string }> = {
  running: { dot: "bg-blue-500 animate-pulse", bg: "bg-blue-50", text: "text-blue-700" },
  completed: { dot: "bg-green-500", bg: "bg-green-50", text: "text-green-700" },
  pending: { dot: "bg-yellow-500", bg: "bg-yellow-50", text: "text-yellow-700" },
  failed: { dot: "bg-red-500", bg: "bg-red-50", text: "text-red-700" },
  idle: { dot: "bg-gray-300", bg: "bg-gray-50", text: "text-gray-500" },
};

export function ProjectActivityPanel({ activity }: ProjectActivityPanelProps) {
  const [logAgent, setLogAgent] = useState<string | null>(null);

  // Collect all tasks from all agents that have active or recent tasks
  const activeTasks = PIPELINE_STAGES
    .map((stage) => {
      const agent = activity.agents[stage.key];
      if (!agent) return null;
      const task = agent.activeTask || agent.recentTask;
      if (!task) return null;
      return { ...task, agentType: stage.key, agentLabel: stage.label };
    })
    .filter(Boolean) as Array<{
      id: string;
      name: string;
      status: string;
      agentType: string;
      agentLabel: string;
    }>;

  return (
    <div className="space-y-4">
      {/* Agent Pipeline */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Agent Pipeline</h3>
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {PIPELINE_STAGES.map((stage, i) => {
            const agent = activity.agents[stage.key];
            const status: AgentStatus = agent?.status ?? "idle";
            const colors = STATUS_COLORS[status];

            return (
              <div key={stage.key} className="flex items-center">
                {i > 0 && (
                  <svg className="w-4 h-4 text-gray-300 flex-shrink-0 mx-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                )}
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md ${colors.bg} min-w-0`}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colors.dot}`} />
                  <span className={`text-xs font-medium whitespace-nowrap ${colors.text}`}>
                    {stage.label}
                  </span>
                  {agent && agent.taskCount > 0 && (
                    <span className={`text-xs ${colors.text} opacity-60`}>
                      ({agent.taskCount})
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Task Summary + Active Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Active Tasks Table */}
        <div className="lg:col-span-3 bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">Tasks by Agent</h3>
          </div>
          {activeTasks.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-500">
              No tasks yet for this project.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Task</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Logs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {activeTasks.map((task) => {
                    const taskStatusColor =
                      task.status === "completed" ? "bg-green-100 text-green-800" :
                      task.status === "running" ? "bg-blue-100 text-blue-800" :
                      task.status === "queued" ? "bg-blue-50 text-blue-700" :
                      task.status === "failed" ? "bg-red-100 text-red-800" :
                      task.status === "waiting_human" ? "bg-orange-100 text-orange-800" :
                      "bg-gray-100 text-gray-600";

                    return (
                      <tr key={task.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm font-medium text-gray-900">
                          {task.agentLabel}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-600 max-w-xs truncate" title={task.name}>
                          {task.name}
                        </td>
                        <td className="px-4 py-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${taskStatusColor}`}>
                            {task.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <button
                            onClick={() => setLogAgent(task.agentType)}
                            className="p-1.5 text-purple-500 hover:text-purple-700 hover:bg-purple-50 rounded transition-colors inline-flex items-center"
                            title={`View ${task.agentLabel} logs for this project`}
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Summary Stats */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">Summary</h3>
          </div>
          <table className="min-w-full divide-y divide-gray-200">
            <tbody className="divide-y divide-gray-200">
              <tr className="hover:bg-gray-50">
                <td className="pl-4 py-2 w-6">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500" />
                </td>
                <td className="px-2 py-2 text-sm text-gray-700">Total Tasks</td>
                <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">{activity.totalTasks}</td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="pl-4 py-2 w-6">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" />
                </td>
                <td className="px-2 py-2 text-sm text-gray-700">Completed</td>
                <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">{activity.completedTasks}</td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="pl-4 py-2 w-6">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse" />
                </td>
                <td className="px-2 py-2 text-sm text-gray-700">Running</td>
                <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">{activity.runningTasks}</td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="pl-4 py-2 w-6">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-500" />
                </td>
                <td className="px-2 py-2 text-sm text-gray-700">Pending</td>
                <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">{activity.pendingTasks}</td>
              </tr>
              {activity.failedTasks > 0 && (
                <tr className="hover:bg-gray-50">
                  <td className="pl-4 py-2 w-6">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />
                  </td>
                  <td className="px-2 py-2 text-sm text-gray-700">Failed</td>
                  <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">{activity.failedTasks}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Log Modal */}
      {logAgent && (
        <WorkerLogModal
          workerType={logAgent}
          logEndpoint={`/api/projects/${activity.projectId}/logs?agentType=${logAgent}`}
          onClose={() => setLogAgent(null)}
        />
      )}
    </div>
  );
}

```

### Tool Result
```
File created successfully at: /Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/components/ProjectActivityPanel.tsx
```

---
### Assistant
Now create the project detail page.

### Tool Call: Bash
**Description:** Check existing project route structure
```bash
ls /Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/app/projects/
```

### Tool Result
```
page.tsx
projects-hub-client.tsx
```

### Tool Call: Bash
**Description:** Create project detail route directory
```bash
mkdir -p /Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/app/projects/\[id\]
```

### Tool Result
```

```

### Tool Call: Write
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/app/projects/[id]/page.tsx`
**Content:**
```tsx
import { db } from "@/lib/db";
import { projects, tasks, projectScopes } from "@soloenterprise/db/schema";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ProjectActivityPanel } from "@/components/ProjectActivityPanel";

export const dynamic = "force-dynamic";

const AGENT_TYPES = [
  "orchestrator",
  "backend",
  "frontend",
  "qa",
  "scoper",
  "client-reporter",
] as const;

type AgentStatus = "running" | "completed" | "pending" | "idle" | "failed";

async function getProjectActivity(projectId: string) {
  const projectTasks = await db.query.tasks.findMany({
    where: eq(tasks.projectId, projectId),
    columns: {
      id: true,
      name: true,
      status: true,
      agentType: true,
      updatedAt: true,
    },
    orderBy: [desc(tasks.updatedAt)],
  });

  const agents: Record<string, {
    status: AgentStatus;
    taskCount: number;
    activeTask: { id: string; name: string; status: string } | null;
    recentTask: { id: string; name: string; status: string } | null;
  }> = {};

  for (const type of AGENT_TYPES) {
    const typeTasks = projectTasks.filter((t) => t.agentType === type);

    if (typeTasks.length === 0) {
      agents[type] = { status: "idle", taskCount: 0, activeTask: null, recentTask: null };
      continue;
    }

    const running = typeTasks.find((t) => t.status === "running");
    const queued = typeTasks.find((t) => t.status === "queued");
    const failed = typeTasks.find((t) => t.status === "failed");
    const allCompleted = typeTasks.every((t) => t.status === "completed");
    const anyPending = typeTasks.some(
      (t) => t.status === "pending" || t.status === "queued" || t.status === "blocked"
    );

    let status: AgentStatus;
    if (running || queued) status = "running";
    else if (allCompleted) status = "completed";
    else if (failed && !anyPending) status = "failed";
    else if (anyPending) status = "pending";
    else status = "idle";

    const activeTask = running || queued || null;
    const recentTask = typeTasks[0];

    agents[type] = {
      status,
      taskCount: typeTasks.length,
      activeTask: activeTask ? { id: activeTask.id, name: activeTask.name, status: activeTask.status } : null,
      recentTask: recentTask ? { id: recentTask.id, name: recentTask.name, status: recentTask.status } : null,
    };
  }

  const totalTasks = projectTasks.length;
  const completedTasks = projectTasks.filter((t) => t.status === "completed").length;
  const runningTasks = projectTasks.filter((t) => t.status === "running" || t.status === "queued").length;
  const pendingTasks = projectTasks.filter((t) => t.status === "pending" || t.status === "blocked").length;
  const failedTasks = projectTasks.filter((t) => t.status === "failed").length;

  return { agents, totalTasks, completedTasks, runningTasks, pendingTasks, failedTasks };
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, id),
    with: {
      client: true,
      scope: true,
    },
  });

  if (!project) {
    notFound();
  }

  const activity = await getProjectActivity(id);

  const statusColor =
    project.status === "active" ? "bg-green-100 text-green-800" :
    project.status === "planning" ? "bg-blue-100 text-blue-800" :
    project.status === "completed" ? "bg-gray-100 text-gray-800" :
    "bg-yellow-100 text-yellow-800";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/projects" className="hover:text-gray-700">
              Projects
            </Link>
            <span>/</span>
            <span className="text-gray-900">{project.name}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          {project.client && (
            <p className="text-sm text-gray-500 mt-0.5">
              Client: {project.client.name}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${statusColor}`}>
            {project.status}
          </span>
          {project.scope && (
            <Link
              href={`/briefs/${project.scope.briefId}/scope`}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              View Scope
            </Link>
          )}
        </div>
      </div>

      {/* Activity Panel */}
      <ProjectActivityPanel
        activity={{
          projectId: id,
          projectName: project.name,
          projectStatus: project.status,
          ...activity,
        }}
      />
    </div>
  );
}

```

### Tool Result
```
File created successfully at: /Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/app/projects/[id]/page.tsx
```

---
### Assistant
Now let me make the project rows in the `/projects` table link to the detail page. Let me check the ProjectTable component.

### Tool Call: Read
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/components/ProjectTable.tsx`

### Tool Result
```
     1→"use client";
     2→
     3→import { useState, useEffect } from "react";
     4→import { useRouter } from "next/navigation";
     5→import { Trash2, Eye } from "lucide-react";
     6→
     7→interface Project {
     8→  id: string;
     9→  name: string;
    10→  description: string | null;
    11→  aiDescription: string | null;
    12→  status: string;
    13→  clientId: string | null;
    14→  scopeId: string | null;
    15→  createdAt: string;
    16→  scope?: { id: string; status: string } | null;
    17→  briefScope?: { id: string; status: string } | null;
    18→  client?: { id: string; name: string } | null;
    19→}
    20→
    21→interface CompanyOption {
    22→  id: string;
    23→  name: string;
    24→}
    25→
    26→interface ProjectTableProps {
    27→  projects: Project[];
    28→  showCompanyColumn?: boolean;
    29→  companies?: CompanyOption[];
    30→  companyId?: string;
    31→  onRefresh?: () => void;
    32→}
    33→
    34→const STATUS_COLORS: Record<string, string> = {
    35→  planning: "bg-gray-100 text-gray-800",
    36→  active: "bg-emerald-100 text-emerald-800",
    37→  paused: "bg-yellow-100 text-yellow-800",
    38→  completed: "bg-blue-100 text-blue-800",
    39→  cancelled: "bg-red-100 text-red-800",
    40→};
    41→
    42→function getBriefStatus(project: Project): string {
    43→  // Use briefScope (resolved via brief chain) which is always populated by server
    44→  const scope = project.briefScope || project.scope;
    45→  if (scope?.status === "approved") return "approved";
    46→  if (scope?.status === "rejected") return "rejected";
    47→  if (scope?.status === "draft" || scope?.status === "ready") return "scoped";
    48→  // Only show "scoping" if the project is part of the pipeline (has a clientId)
    49→  if (project.status === "planning" && !scope && project.clientId) return "scoping";
    50→  // Projects without a client are old orphans — show their actual project status
    51→  if (!project.clientId) return project.status;
    52→  return "received";
    53→}
    54→
    55→const BRIEF_STATUS_COLORS: Record<string, string> = {
    56→  received: "bg-gray-100 text-gray-800",
    57→  scoping: "bg-blue-100 text-blue-800 animate-pulse",
    58→  scoped: "bg-green-100 text-green-800",
    59→  approved: "bg-emerald-100 text-emerald-800",
    60→  rejected: "bg-red-100 text-red-800",
    61→};
    62→
    63→export function ProjectTable({
    64→  projects: initialProjects,
    65→  showCompanyColumn = false,
    66→  companies = [],
    67→  companyId,
    68→  onRefresh,
    69→}: ProjectTableProps) {
    70→  const router = useRouter();
    71→  const [projects, setProjects] = useState(initialProjects);
    72→  const [companyFilter, setCompanyFilter] = useState("");
    73→  const [statusFilter, setStatusFilter] = useState("");
    74→  const [searchQuery, setSearchQuery] = useState("");
    75→  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
    76→  const [deleting, setDeleting] = useState(false);
    77→
    78→  // Update projects when props change
    79→  useEffect(() => {
    80→    setProjects(initialProjects);
    81→  }, [initialProjects]);
    82→
    83→  // No auto-polling — user clicks Refresh to check scoping status (guardrail #6)
    84→
    85→  // Client-side filtering
    86→  const filtered = projects.filter((p) => {
    87→    if (companyFilter && p.clientId !== companyFilter) return false;
    88→    if (statusFilter && getBriefStatus(p) !== statusFilter) return false;
    89→    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    90→    return true;
    91→  });
    92→
    93→  async function handleDelete() {
    94→    if (!deleteTarget) return;
    95→    setDeleting(true);
    96→    try {
    97→      const cId = companyId || deleteTarget.clientId;
    98→      const url = cId
    99→        ? `/api/companies/${cId}/projects/${deleteTarget.id}`
   100→        : `/api/projects/${deleteTarget.id}`;
   101→      const res = await fetch(url, { method: "DELETE" });
   102→      if (!res.ok) throw new Error("Failed to delete");
   103→      setDeleteTarget(null);
   104→      router.refresh();
   105→    } catch {
   106→      // silently fail for now
   107→    } finally {
   108→      setDeleting(false);
   109→    }
   110→  }
   111→
   112→  function handleRowClick(project: Project) {
   113→    const status = getBriefStatus(project);
   114→    if (status === "scoped") {
   115→      const cId = companyId || project.clientId;
   116→      if (cId) {
   117→        router.push(`/companies/${cId}/projects/${project.id}/scope`);
   118→      }
   119→    }
   120→  }
   121→
   122→  return (
   123→    <div className="bg-white shadow rounded-lg overflow-hidden">
   124→      {/* Filter bar */}
   125→      {showCompanyColumn && (
   126→        <div className="border-b border-gray-200 px-4 py-3 flex flex-wrap gap-3">
   127→          <select
   12
... (truncated)
```

---
### Assistant
I need to add an "Activity" link to each project row in the actions column, linking to the new `/projects/[id]` page.

### Tool Call: Edit
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/components/ProjectTable.tsx`
**Old:**
```
import { Trash2, Eye } from "lucide-react";
```
**New:**
```
import { Trash2, Eye, Activity } from "lucide-react";
```

### Tool Result
```
The file /Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/components/ProjectTable.tsx has been updated successfully.
```

### Tool Call: Edit
**File:** `/Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/components/ProjectTable.tsx`
**Old:**
```
                      <div className="flex items-center gap-2">
                        {(briefStatus === "scoped" || briefStatus === "approved" || briefStatus === "rejected") && (
```
**New:**
```
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/projects/${project.id}`);
                          }}
                          className="text-indigo-500 hover:text-indigo-700 p-1"
                          title="View activity"
                        >
                          <Activity className="h-4 w-4" />
                        </button>
                        {(briefStatus === "scoped" || briefStatus === "approved" || briefStatus === "rejected") && (
```

### Tool Result
```
The file /Users/matteobaratella/Projects/PERSONAL_PROJECTS/SoloEnterprise/soloenterprise/src/components/ProjectTable.tsx has been updated successfully.
```

---
### Assistant
Now let me verify everything builds.

### Tool Call: Bash
**Description:** TypeScript check core package
```bash
npx tsc --noEmit --project packages/core/tsconfig.json 2>&1 | head -30
```

### Tool Result
```

```

### Tool Call: Bash
**Description:** TypeScript check main app
```bash
npx tsc --noEmit 2>&1 | head -40
```

### Tool Result
```

```

---
### Assistant
Zero TypeScript errors. Let me also verify the existing tests still pass.

### Tool Call: Bash
**Description:** Run all tests
```bash
pnpm test:all 2>&1 | tail -20
```

### Tool Result
```
@soloenterprise/core:test:  [32m✓[39m src/agents/utils/__tests__/orchestrator-command-executor.test.ts [2m([22m[2m9 tests[22m[2m)[22m[32m 12[2mms[22m[39m
@soloenterprise/core:test:  [32m✓[39m src/agents/utils/__tests__/context-profiles-extended.test.ts [2m([22m[2m20 tests[22m[2m)[22m[32m 6[2mms[22m[39m
@soloenterprise/core:test:  [32m✓[39m src/agents/utils/__tests__/project-context-loader.test.ts [2m([22m[2m7 tests[22m[2m)[22m[32m 9[2mms[22m[39m
@soloenterprise/core:test:  [32m✓[39m src/services/__tests__/cost-tracking-service.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 6[2mms[22m[39m
@soloenterprise/core:test:  [32m✓[39m src/agents/utils/__tests__/artifact-summarizer.test.ts [2m([22m[2m27 tests[22m[2m)[22m[32m 6[2mms[22m[39m
@soloenterprise/core:test:  [32m✓[39m src/agents/utils/__tests__/report-parser.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 3[2mms[22m[39m
@soloenterprise/core:test:  [32m✓[39m src/services/__tests__/worker-registry.test.ts [2m([22m[2m6 tests[22m[2m)[22m[32m 2[2mms[22m[39m
@soloenterprise/core:test:  [32m✓[39m src/agents/utils/__tests__/file-validator.test.ts [2m([22m[2m59 tests[22m[2m)[22m[32m 14[2mms[22m[39m
@soloenterprise/core:test:  [32m✓[39m src/agents/utils/__tests__/typescript-validator.test.ts [2m([22m[2m22 tests[22m[2m)[22m[32m 19[2mms[22m[39m
@soloenterprise/core:test: 
@soloenterprise/core:test: [2m Test Files [22m [1m[32m18 passed[39m[22m[90m (18)[39m
@soloenterprise/core:test: [2m      Tests [22m [1m[32m401 passed[39m[22m[90m (401)[39m
@soloenterprise/core:test: [2m   Start at [22m 19:58:45
@soloenterprise/core:test: [2m   Duration [22m 764ms[2m (transform 1.69s, setup 0ms, import 2.90s, tests 148ms, environment 3ms)[22m
@soloenterprise/core:test: 

 Tasks:    3 successful, 3 total
Cached:    0 cached, 3 total
  Time:    3.758s
```

---
### Assistant
All 401 tests pass. Let me mark the task as complete.

### Tool Call: TaskUpdate
**taskId:** 2
**status:** completed

### Tool Result
```
Updated task #2 status
```

---
### Assistant
Both tracks implemented. Here's the summary:

## Track A: On-Demand Worker Startup

| File | Change |
|------|--------|
| `packages/core/src/services/worker-supervisor.ts` | **Created** — `ensureWorkerRunning()` with 15s debounce, registry check, and spawn |
| `packages/core/src/services/index.ts` | Added export for worker-supervisor |
| `packages/core/src/services/task-service.ts` | Hooked `ensureWorkerRunning()` after line 109 in `createTask()` |
| `packages/core/src/queue/task-queue.ts` | Hooked `ensureWorkerRunning()` after line 165 in `enqueueTask()` |
| `src/app/api/companies/[companyId]/projects/route.ts` | Removed `spawn("pnpm", ["worker"])` block + `child_process` import |
| `src/app/api/scopes/[id]/approve/route.ts` | Removed `spawn("pnpm", ["worker"])` block + `child_process` import |
| `package.json` | Added `worker:scoper` and `worker:client-reporter` scripts |
| `packages/core/package.json` | Added `worker:client-reporter` script |

## Track B: Per-Project Activity Dashboard

| File | Change |
|------|--------|
| `src/app/api/projects/[id]/activity/route.ts` | **Created** — per-project activity endpoint |
| `src/app/api/projects/[id]/logs/route.ts` | **Created** — per-project logs with optional `?agentType=` filter |
| `src/components/ProjectActivityPanel.tsx` | **Created** — pipeline visualization + tasks table + per-agent log buttons |
| `src/app/projects/[id]/page.tsx` | **Created** — server component project detail page |
| `src/components/WorkerLogModal.tsx` | Added `logEndpoint` prop for custom log URLs |
| `src/components/WorkerDashboardPanel.tsx` | Added `client-reporter` to worker types |
| `src/components/ProjectTable.tsx` | Added Activity icon link to `/projects/[id]` |
| `src/app/page.tsx` | Added `client-reporter` to `getWorkerStatuses()` |
| `src/app/api/workers/all/logs/route.ts` | Added `client-reporter` to AGENT_TYPES |
| `src/app/api/workers/[type]/logs/route.ts` | Added `client-reporter` to VALID_AGENT_TYPES |

**Verification:** 0 TypeScript errors, 401/401 tests pass.
