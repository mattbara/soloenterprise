# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SoloEnterprise is an AI agent orchestration system with human-in-the-loop feedback. It coordinates multiple specialized AI agents (orchestrator, backend, frontend, QA, devops, feedback) to build products autonomously while escalating to humans when needed.

## Commands

```bash
# Development
pnpm dev              # Next.js dev server with turbopack
pnpm dev:all          # Turbo: dev all packages in parallel

# Build
pnpm build            # Next.js production build
pnpm build:all        # Turbo: build all packages

# Test & Lint
pnpm lint             # Next.js lint
pnpm lint:all         # Turbo: lint all packages
pnpm test:all         # Turbo: test all packages

# Database (Drizzle ORM with Neon PostgreSQL)
pnpm db:generate      # Generate migrations from schema changes
pnpm db:migrate       # Run pending migrations
pnpm db:push          # Push schema directly (dev only)
pnpm db:studio        # Open Drizzle Studio GUI
```

## Architecture

### Monorepo Structure (pnpm workspaces + Turbo)

```
packages/
├── core/           # @soloenterprise/core - Agent orchestration
│   └── src/
│       ├── queue/  # BullMQ task queue (per-agent-type queues)
│       └── locks/  # File lock management (prevents concurrent edits)
└── db/             # @soloenterprise/db - Database layer
    └── src/
        ├── schema.ts  # Drizzle schema definitions
        └── index.ts   # Neon HTTP client

src/                # Next.js 15 application
├── app/            # App Router
│   ├── api/        # API routes (projects, questions)
│   ├── projects/   # Project management UI
│   ├── questions/  # Human input queue UI
│   └── tasks/      # Task monitoring UI
└── lib/            # Utilities
```

### Key Patterns

**Task Queue System**: BullMQ with Redis. Six agent-type queues (`orchestrator-tasks`, `backend-tasks`, etc.). Priority-based job processing with 3-strike failure escalation to human review.

**File Lock Protocol**: 2-hour TTL locks prevent concurrent file modifications. Tasks declare required files; conflicts block execution until resolved. Human escalation for non-dependent task conflicts.

**Human-in-the-Loop**: Questions table tracks items requiring human input. Tasks in `waiting_human` status block until resolved. Blocking questions can halt entire workflows.

**Task State Machine**: `pending` → `queued` → `running` → `completed`/`failed`/`waiting_human`/`blocked`. Retry tracking with `maxAttempts` (default 3).

### Database Schema (packages/db/src/schema.ts)

Core tables: `projects`, `tasks`, `questions`, `file_locks`, `artifacts`, `deployments`, `agent_sessions`

Key relationships:
- Projects contain Tasks
- Tasks can have Questions (human input requests)
- Tasks produce Artifacts
- Tasks acquire File Locks
- Deployments track releases per environment

### Package Imports

```typescript
import { db } from "@soloenterprise/db";
import { projects, tasks, questions } from "@soloenterprise/db/schema";
import { TaskQueue } from "@soloenterprise/core/queue";
import { FileLockManager } from "@soloenterprise/core/locks";
```

## Environment Variables

Required variables (see `.env.example`):
- `DATABASE_URL` - Neon PostgreSQL connection string
- `REDIS_URL` - Upstash Redis URL for BullMQ
- `ANTHROPIC_API_KEY` - Claude API key for agents
- `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_BRANCH` - GitHub integration
