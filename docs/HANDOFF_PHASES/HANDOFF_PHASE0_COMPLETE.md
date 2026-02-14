# SoloEnterprise — Phase 0 Complete: Foundation

## Current State

Phase 0 (Foundation) is complete. The entire infrastructure backbone of SoloEnterprise was built from scratch: database schema, task queue, file lock manager, worker registry, the first working agent (Backend), and the dashboard UI. This phase took 4 weeks and established every pattern subsequent phases built on.

## Architecture

- **Monorepo:** pnpm workspaces + Turbo
- **App:** Next.js 15 App Router
- **DB:** Neon PostgreSQL + Drizzle ORM (`packages/db/src/schema.ts`)
- **Queue:** BullMQ + Upstash Redis
- **Agent Runtime:** Anthropic Claude API (Sonnet for code generation)
- **Agent Sandbox:** `generated/tasks/{task-id}/` (agents write here, never to actual codebase)
- **UI:** shadcn/ui + Tailwind CSS

## What Was Built

| Component | Location | Purpose |
|-----------|----------|---------|
| Database Schema (8 tables) | `packages/db/src/schema.ts` | projects, tasks, questions, file_locks, artifacts, deployments, agent_sessions |
| Task Queue | `packages/core/src/queue/task-queue.ts` | BullMQ with Redis, priority-based, per-agent-type queues |
| File Lock Manager | `packages/core/src/locks/file-lock-manager.ts` | 2-hour TTL locks, conflict detection, human escalation |
| Worker Registry | `packages/core/src/services/worker-registry.ts` | Agent registration and routing |
| Backend Agent | `packages/core/src/agents/backend-agent.ts` | First working agent — TypeScript code generation |
| Dashboard UI | `src/app/page.tsx` | Task status, project overview |
| Questions UI | `src/app/questions/page.tsx` | Human-in-the-loop question queue |
| API Routes | `src/app/api/` | REST endpoints for task/project management |

## What's Proven Working

- Task creation → queue insertion → agent pickup → code output → artifact storage
- File lock acquisition and release with TTL expiry
- Human-in-the-loop question flow (task blocks → human answers → task resumes)
- Task state machine: `pending` → `queued` → `running` → `completed`/`failed`/`waiting_human`/`blocked`
- 3-strike failure escalation to human review
- Backend agent generating TypeScript code with Drizzle ORM patterns
- Dashboard showing real-time task status
- Server-side data fetching (no client-side polling — cost optimization from day one)

## Key Decisions Made

- **BullMQ + Redis over custom queue** — battle-tested, good visibility, per-agent-type queues
- **Neon PostgreSQL over self-hosted** — serverless, branching, zero maintenance
- **Drizzle ORM over Prisma** — type-safe, SQL-like, lighter footprint
- **Sandboxed agent output** — agents write to `generated/tasks/{id}/`, never touch real codebase
- **Server-first architecture** — all data fetching in Server Components, no client-side fetch on mount
- **SKILL files as agent prompts** — external markdown files loaded into agent context (not hardcoded)
- **Next.js 15 App Router** — RSC for server-first rendering, Server Actions for mutations
- **shadcn/ui** — customizable, accessible, no vendor lock-in

## What Phase 1 Must Address

- Monolithic SKILL files are too large — agents receive full prompt every time regardless of task complexity
- No token metrics — can't measure or optimize API costs
- Context loader sends everything — no filtering by task type

## Known Issues at Handoff

- SKILL files are monolithic (one giant file per agent type)
- No token tracking or cost visibility
- No complexity-based context filtering
- Dashboard is basic — shows status but no analytics

## Database Tables

| Table | Purpose |
|-------|---------|
| `projects` | Project records |
| `tasks` | Individual agent tasks with state machine |
| `questions` | Human-in-the-loop items |
| `file_locks` | Concurrent modification prevention |
| `artifacts` | Agent-produced output files |
| `deployments` | Release tracking per environment |
| `agent_sessions` | Agent execution tracking |

## Repo

github.com/mattbara/soloenterprise, `development` branch

## Key Config Files

- `CLAUDE.md` — guardrails and project conventions
- `docs/MASTER_ARCHITECTURE.md` — system architecture (v2.0 at this point)
- `.env.example` — required environment variables

## Key Code Files

- `packages/db/src/schema.ts` — all database tables
- `packages/core/src/queue/task-queue.ts` — BullMQ queue management
- `packages/core/src/locks/file-lock-manager.ts` — file lock system
- `packages/core/src/services/worker-registry.ts` — agent registration
- `packages/core/src/agents/backend-agent.ts` — backend agent implementation
- `src/app/page.tsx` — dashboard
- `src/app/questions/page.tsx` — questions UI
- `src/app/api/` — REST API routes

---

*Phase 0 established the entire infrastructure. Every subsequent phase builds on these foundations without replacing them.*
