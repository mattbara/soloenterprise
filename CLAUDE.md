# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SoloEnterprise is an AI agent orchestration system with human-in-the-loop feedback. It coordinates multiple specialized AI agents (orchestrator, backend, frontend, QA, devops, feedback) to build products autonomously while escalating to humans when needed.

## Communication Style

Be harsh, objective, and opinionated. Provide direct feedback without hedging. If an idea is bad, say so. Give pros/cons only when there's genuine tradeoff to discuss, not as padding.

## Commands

```bash
# Development
pnpm dev              # Next.js dev server with Turbopack
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

See `docs/DOCUMENTATION_STRUCTURE.md` for detailed project structure.

### Monorepo Structure (pnpm workspaces + Turbo)

```
packages/
├── core/           # @soloenterprise/core - Agent orchestration
└── db/             # @soloenterprise/db - Database layer

skills/             # Agent skill files (modular prompts)
src/                # Next.js 15 application
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

### Claude Model Configuration (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_MODEL` | `claude-3-5-haiku-latest` | Model for backend agent |
| `CLAUDE_MAX_TOKENS` | `16384` | Max response tokens |

**Available Models:**
| Model | Speed | Quality | Cost | Max Tokens |
|-------|-------|---------|------|------------|
| `claude-3-5-haiku-latest` | Fast (~30s) | Good | Cheapest | 16384 |
| `claude-sonnet-4-5-20250929` | Slow (~2min) | Best | Higher | 16384 |

---

## GUARDRAILS (MUST FOLLOW)

**IMPORTANT: Read this file BEFORE starting any task.**

### 1. Server-Side API Calls
- API calls and data fetching MUST be done server-side (Server Components, Server Actions, API routes)
- Client-side fetch is only allowed when absolutely necessary (real-time updates, user interactions that can't be server-rendered)
- Use `"use server"` for Server Actions, keep data fetching in Server Components

### 2. No Sensitive Data in Code
- NEVER commit secrets, API keys, tokens, or credentials to the codebase
- All sensitive values MUST use environment variables
- Double-check before committing: no hardcoded passwords, no API keys, no connection strings

### 3. TypeScript Only - No File Extensions in Imports
- Use `.ts` and `.tsx` extensions exclusively for all code
- **NEVER** use `.js`, `.jsx`, or any file extensions in import/export statements
- Imports should be extensionless: `import { foo } from './bar'` NOT `import { foo } from './bar.js'`
- This project uses `"moduleResolution": "Bundler"` in TypeScript config, which allows extensionless imports
- Do NOT create `.js` files - all source code must be TypeScript

### 4. No Deletions Without Permission
- **NEVER delete files, functions, or significant code without explicit permission**
- Always ASK before removing anything, even if edits are pre-approved
- Explain what you want to delete and why before proceeding
- This applies to: files, database migrations, environment variables, dependencies

### 5. Always Read CLAUDE.md First
- Before starting ANY task, read this file to understand project context and constraints
- Check for updates to guardrails and patterns
- Follow established conventions in this document

### 6. Cost Optimization (CRITICAL)
This project runs on paid services (Neon PostgreSQL, Upstash Redis, Anthropic API, GCP). **Every API call, database query, and AI request costs money.**

**MUST FOLLOW:**
- **NO client-side polling** - Never use `setInterval` or `setTimeout` to poll APIs
- **NO auto-refresh** - Use `router.refresh()` (free, server-side) instead of API calls
- **Return data in mutations** - POST/PUT/DELETE should return updated state, no second fetch
- **Server-first data fetching** - Fetch ALL data in Server Components, pass as props to client
- **No unused endpoints** - Delete API routes and SSE connections that aren't actively used
- **Pass props, don't fetch** - Pass data from parent components instead of fetching in children
- **Optimize AI prompts** - Minimize token usage, use shorter prompts where possible

**Patterns to avoid (they cost money):**
```typescript
// BAD - Client fetch on mount
useEffect(() => { fetch('/api/data'); }, []);

// BAD - Polling
setInterval(() => fetch('/api/status'), 5000);

// BAD - Double fetch after mutation
await fetch('/api/create', { method: 'POST' });
await fetch('/api/list'); // Second fetch

// BAD - Fetching in modal on open
useEffect(() => { if (isOpen) fetchProjects(); }, [isOpen]);
```

**Correct patterns (free or minimal cost):**
```typescript
// GOOD - Server Component fetches, passes as props
export default async function Page() {
  const data = await db.query.table.findMany();
  return <ClientComponent data={data} />;
}

// GOOD - router.refresh() for updates (RSC, no API cost)
const router = useRouter();
router.refresh();

// GOOD - Mutation returns updated data
const result = await fetch('/api/create', { method: 'POST' });
const newState = await result.json(); // Use this, don't re-fetch
```

### 7. File Safety (CRITICAL SECURITY)

**All agent file writes are SANDBOXED to `packages/core/generated/tasks/{task-id}/`.**

Agents CANNOT write to the actual codebase. The file-writer enforces this regardless of what paths Claude outputs:
- Absolute paths like `/etc/passwd` → sandboxed to `generated/tasks/{id}/etc/passwd`
- Traversal attempts like `../../../etc/passwd` → stripped and sandboxed
- Production paths like `packages/db/src/schema.ts` → sandboxed, NOT written to actual codebase

**If you see files appearing outside `packages/core/generated/`, this is a security bug. Stop and fix immediately.**

To review generated code before applying to codebase:
```bash
# View what was generated for a task
ls packages/core/generated/tasks/{task-id}/

# Copy to actual codebase (manual review required)
cp packages/core/generated/tasks/{task-id}/src/file.ts src/file.ts
```

### 8. Git Workflow — Principal Software Engineer Approval (MANDATORY)

**NOTHING gets merged without the Principal Software Engineer's explicit approval.**

- All changes MUST go through a Pull Request — no direct pushes to `development` or `main`
- Every PR MUST be assigned to the Principal Software Engineer as reviewer
- Only the Principal Software Engineer can merge PRs. No exceptions.
- No agent, no automation, no CI pipeline merges code. Only the Principal.
- If the Principal requests changes, address them and re-request review. Do NOT merge around them.

**Workflow:**
1. Create a feature branch from `development`
2. Commit changes to the feature branch
3. Open a PR targeting `development`
4. Assign the Principal Software Engineer as reviewer
5. Wait for approval — do NOT merge yourself
6. Principal merges or requests changes

**This applies to everyone and everything: agents, developers, CI/CD, Claude Code. No shortcuts.**

### 9. Architect Layer Required for ALL Tasks

**Every task gets an architect tech spec. No exceptions.** Foundational tasks (wave 1, 0 dependencies) are the MOST important to spec — they define contracts that everything downstream consumes. Skipping specs on root tasks causes API divergence and import mismatches.

Cost is managed through model tiering (Sonnet for simple profiles, Opus for complex), NOT by skipping specs. The architect step adapts its prompt: dependency artifact context for tasks with deps, and "define your public API contract" guidance for root tasks.
