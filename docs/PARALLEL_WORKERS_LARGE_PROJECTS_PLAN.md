# Parallel Workers for Large Projects Plan

> **Status:** Future reference — not needed until multiple projects run simultaneously.
> **Created:** 2026-02-17
> **Trigger:** When 2+ projects need to run concurrently without blocking each other.

---

## Current Architecture (Global Workers)

- **One worker process per agent type** (orchestrator, backend, frontend, qa, scoper, client-reporter)
- **One BullMQ queue per agent type** (`backend-tasks`, `frontend-tasks`, etc.)
- **Concurrency: 1** — each worker processes one task at a time, sequentially
- **All projects share the same queues** — tasks are FIFO with priority ordering
- Workers are spawned via `child_process.spawn`, tracked in Redis by PID + heartbeat

### Problem at Scale

With 20 concurrent projects, each with 5 frontend tasks (100 total):
- Sequential processing: ~100 minutes total
- Project 1 finishes in ~5min, Project 20 finishes in ~100min
- **Stopping a worker kills it for ALL projects** — no per-project control

---

## Proposed Solution: Per-Project Queues

### Design

Replace global queues with per-project dynamic queues:

```
Current:  backend-tasks        (all projects)
Proposed: backend-tasks-{projectId}  (per project)
```

Each project gets its own set of queues. Workers spawn on-demand when tasks are enqueued and auto-shutdown after idle timeout.

### What Changes

| Component | Current | Proposed |
|-----------|---------|----------|
| Queue names | `backend-tasks` | `backend-tasks-{projectId}` |
| Worker spawning | One per agent type | One per agent type per project |
| Worker registry | Keyed by agent type | Keyed by agent type + projectId |
| Worker supervisor | Checks 6 queues | Checks N×6 queues (dynamic) |
| Stop/Start | Global per agent | Per project per agent |
| Redis keys | `worker:backend:status` | `worker:backend:{projectId}:status` |

### Files to Modify

- `packages/core/src/queue/task-queue.ts` — dynamic queue name generation
- `packages/core/src/worker.ts` — accept projectId parameter
- `packages/core/src/services/worker-registry.ts` — project-scoped keys
- `packages/core/src/services/worker-supervisor.ts` — project-aware spawning
- `packages/core/src/services/task-service.ts` — enqueue to project-specific queue
- `src/app/api/workers/route.ts` — start/stop per project
- `src/app/api/workers/[type]/route.ts` — project-scoped stop
- UI components — per-project worker controls

### Resource Impact

| Projects | Worker Processes | RAM (est.) | Redis Connections |
|----------|-----------------|------------|-------------------|
| 1 | 6 | ~600MB | 6 |
| 5 | 30 | ~3GB | 30 |
| 10 | 60 | ~6GB | 60 |
| 20 | 120 | ~12GB | 120 |

- **Token/API cost: IDENTICAL** — same number of Claude API calls regardless of parallel vs sequential
- **Redis:** Upstash free tier = 100 connections. Paid tier needed at 10+ projects.
- **RAM:** Local machine can handle 20 projects. Server deployment would need sizing.

### Auto-shutdown

Workers auto-shutdown after 5 minutes idle (existing `IDLE_TIMEOUT`). With per-project queues, a project's workers shut down when that project has no more tasks — they don't linger.

---

## Intermediate Option: Increase Global Concurrency

Before implementing per-project queues, a simpler step:

```typescript
// In worker.ts — change concurrency from 1 to N
const worker = new Worker(queueName, processor, {
  connection: redis,
  concurrency: 3,  // Process 3 tasks in parallel (was 1)
});
```

- **Handles ~3-5 concurrent projects** without architectural change
- Tasks from different projects process in parallel within one process
- **Limitation:** Stop still kills the worker for ALL projects
- **Good enough until:** You consistently have 5+ projects running simultaneously

---

## Decision Timeline

1. **Now (0-2 concurrent projects):** Keep global workers, concurrency 1. No changes needed.
2. **Soon (2-5 concurrent projects):** Increase concurrency to 3. One-line config change.
3. **Scale (5+ concurrent projects):** Implement per-project queues. Medium refactor (~2-3 days).
4. **Large scale (20+ projects):** Per-project queues + Redis connection pooling + server sizing.
