# SoloEnterprise — Phase 5 Complete, Starting Phase 5.5

## Current State

Phase 5 (Orchestrator Agent) is complete and merged to `development` branch. All 10 tests pass (5 baseline + 5 stress). The system has 4 functional agents: Backend (Sonnet 4.5), Frontend (Sonnet 4.5), QA (Sonnet 4.5), Orchestrator (Opus 4.6).

## Architecture

- **Monorepo:** pnpm workspaces, Next.js 15 App Router
- **DB:** Neon PostgreSQL + Drizzle ORM (`packages/db/src/schema.ts`)
- **Queue:** BullMQ + Upstash Redis
- **Agents:** Anthropic Claude API with prompt caching
- **Agent sandbox:** `project-files/tasks/{task-id}/` (external to repo, agents have no git awareness)
- **SKILL files:** Layered (core/patterns/examples) loaded dynamically via `skill-loader.ts`
- **Context profiles:** simple-endpoint, database-task, full-feature, bug-fix

## What's Proven Working

- Orchestrator task decomposition (1-25 tasks)
- 4-layer dependency chains with UUID resolution
- Cross-session dependency resolution (references existing tasks by full UUID or prefix)
- Contradiction detection (refuses to decompose, asks questions)
- Failure recovery with 3-strike escalation
- Question/answer workflow (flat + nested formats)
- File lock awareness
- Multi-project isolation
- Prompt caching (90% cost savings on SKILL content)

## What Phase 5.5 Must Validate

Pick a real project (small scope — maybe a personal tool or internal utility) and run the FULL pipeline:

1. Submit a project requirement to the orchestrator
2. Orchestrator decomposes into tasks with dependencies
3. BullMQ workers pick up and route to Backend/Frontend/QA agents
4. Agents write actual code to `project-files/tasks/{id}/`
5. QA agent validates the code output
6. Human reviews output, creates branch, opens PR manually
7. Iterate on feedback

## Key Decisions Already Made

- PR creation is Phase 7 (manual for now)
- Business agents (Project Scoper, Client Reporter) are Phase 6/6.5
- DevOps agent deferred — SKILL files need splitting first
- "Never skip steps" rule — no workarounds, fix root causes
- PR-Only Merge Policy (CLAUDE.md Guardrail #8) — only the Principal Software Engineer can merge

## Known Deferred Items

- Custom orchestrator action names (LOW — parser is lenient, accepts with warning)
- Batch API evaluation (future, when running 5+ concurrent projects)
- API timeout at scale (10min band-aid, consider staged decomposition later)

## Repo

github.com/mattbara/soloenterprise, `development` branch

## Key Config Files

- `CLAUDE.md` — guardrails (8 rules, cost optimization, file safety)
- `docs/SOLOENTERPRISE_PHASES_CURRENT.md` — phase roadmap
- `docs/MASTER_ARCHITECTURE.md` — system architecture
- `docs/CONSULTING_PIPELINE.md` — business pipeline
- `packages/db/src/schema.ts` — database schema (single source of truth)

## Key Code Files

- `packages/core/src/agents/orchestrator-agent.ts` — orchestrator implementation
- `packages/core/src/agents/utils/orchestrator-output-parser.ts` — YAML parser (with tests)
- `packages/core/src/agents/utils/orchestrator-command-executor.ts` — task creation + deps (with tests)
- `packages/core/src/agents/utils/orchestrator-context-loader.ts` — context assembly
- `packages/core/src/agents/utils/skill-loader.ts` — SKILL file loading + action detection
- `packages/core/src/services/dependency-resolver.ts` — dependency chain resolution
- `packages/core/src/queue/task-queue.ts` — BullMQ queue management
- `packages/core/src/locks/file-lock-manager.ts` — file lock system
- `skills/` — SKILL files for each agent type
- `scripts/test-orchestrator-agent.ts` — orchestrator test runner

---

*Created 2026-02-07 after Phase 5 completion.*
