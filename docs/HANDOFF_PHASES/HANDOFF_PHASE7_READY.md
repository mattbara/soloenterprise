# SoloEnterprise — Phase 7 Handoff: DevOps Agent + Principal Reviewer

## Current State (2026-02-24)

Phases 6.6–6.8 are complete. The full dashboard UI is in place: sidebar navigation, Company → Projects hierarchy, structured brief intake, scope review with approve/reject, project activity monitoring, metrics, error tracking. The LIFE_SAVE recovery waves (PRs #16–#27) fixed BullMQ stall protection, task deduplication, atomic dependency resolution, agent claim guards, orchestrator safety (circuit breaker, no-output guard), rate limit guard, cost optimization wiring, and 0-file resilience.

## What's Complete

### Phases 0–6.8: Full Platform
- 7 working agents: Orchestrator, Backend, Frontend, QA, Architect, Project Scoper, Client Reporter
- Full consulting pipeline: Brief → Scope → Tasks → Execution → Reports
- Dashboard with sidebar, company/project CRUD, scope review, metrics, error tracking
- BullMQ task queue with stall protection, dedup, atomic resolution, claim guards
- Rate limit guard (pause queues on 429, preserve retries)
- Cost tracking wired into all agents with model-aware pricing
- Context snapshots, model selector, complexity assessment

### LIFE_SAVE Recovery (6 waves, all merged)
All critical bugs and resilience improvements from the lost-work recovery are merged and stable.

## Pipeline Flow (Current)

```
Client brief (structured form in dashboard)
  → Project Scoper Agent (Opus) → structured project spec + scope document
  → [Human reviews scope in dashboard → Approve/Reject]
  → Orchestrator (Opus 4.6) decomposes into tasks
  → Architect Layer (Opus 4.6) generates tech spec per complex task
  → BullMQ queues tasks with dependencies
  → Agents (Sonnet 4.5) execute against spec + SKILL files
  → Output to tmpdir/soloenterprise/generated/tasks/{task-id}/
  → Human reviews via dashboard
  → Client Reporter Agent (Sonnet 4.5) → progress/milestone/blocker reports
  → Output to tmpdir/soloenterprise/generated/reports/{project-id}/
  → [MISSING: DevOps deploys generated code → Phase 7]
```

## Working Agents (7 total)

| Agent | Model | Status |
|-------|-------|--------|
| Project Scoper | Opus | Working — briefs → structured scopes |
| Orchestrator | Opus 4.6 | Working — decomposes, assigns, manages dependencies |
| Backend | Sonnet 4.5 | Working — API routes, DB queries, services |
| Frontend | Sonnet 4.5 | Working — React components, pages, hooks |
| QA | Sonnet 4.5 | Working — Vitest tests, coverage |
| Architect | Opus 4.6 | Working — tech specs (runs in orchestrator pipeline) |
| Client Reporter | Sonnet 4.5 | Working — progress reports, cost tracking |

## Phase 7: DevOps Agent + Principal Reviewer — What to Build

### Purpose

Create a DevOps agent that takes generated code from the agent pipeline and deploys it as a complete, self-contained, handover-ready greenfield project. Client receives a working application with live URLs, CI/CD pipeline, and everything needed to continue independently.

A Principal Reviewer agent provides security review before any agent output is marked complete.

### Provider Abstraction (MANDATORY)

Do NOT hardcode provider SDK calls. Use an interface so providers can be swapped later:

```typescript
interface InfraProvider {
  createProject(config: ProjectConfig): Promise<ProjectResult>;
  setupAuth(config: AuthConfig): Promise<AuthResult>;
  provisionDatabase(config: DbConfig): Promise<DbResult>;
  deploy(artifact: BuildArtifact, env: Environment): Promise<DeployResult>;
  setupCI(config: CIConfig): Promise<CIResult>;
}

// Phase 7 ships with ONE implementation:
class FirebaseRailwayProvider implements InfraProvider { ... }
```

### Initial Provider Stack (behind interface)
- **Hosting + Auth:** Firebase (Hosting + Authentication)
- **Database:** Dockerized PostgreSQL + Drizzle ORM (local dev), Railway (production)
- **CI/CD:** GitHub Actions
- **Environments:** dev / staging / prod
- **Repo:** GitHub (per client project)
- **E2E:** Playwright (pre-installed, runs in CI)
- **Security:** pnpm audit + dependency scanning in CI

### Pre-work Required

Split `skills/SKILL-devops-engineer.md` (757 lines) into layered structure:
- `skills/devops/SKILL-devops-core.md` (~1,000-1,200 tokens)
- `skills/devops/SKILL-devops-patterns.md` (~800-1,000 tokens)
- `skills/devops/SKILL-devops-examples.md` (~1,500-2,000 tokens)

### DevOps Agent Checklist

- [ ] Split monolithic SKILL file into layered structure
- [ ] Define `InfraProvider` interface in `packages/core/src/agents/types/`
- [ ] Implement `FirebaseRailwayProvider`
- [ ] Create `devops-agent.ts` (calls through interface, not direct SDK)
- [ ] GitHub repo creation (per client project)
- [ ] Firebase project setup (hosting + auth)
- [ ] Railway PostgreSQL provisioning
- [ ] GitHub Actions CI/CD pipeline (lint, type-check, test, build, deploy)
- [ ] **Preview deployments on PR** (required for Phase 7.5 Lighthouse testing)
- [ ] Environment configuration (dev/staging/prod)
- [ ] Playwright integration in CI
- [ ] pnpm audit in CI pipeline
- [ ] Monorepo scaffold (Next.js + packages)
- [ ] Docker Compose for local Postgres

### Principal Reviewer (Sub-task)

**Model:** Claude Opus (critical review)

**Scope:** Security anti-patterns (hardcoded secrets, SQL injection, XSS, auth bypass), performance issues, logic errors, error handling gaps.

- [ ] Create `SKILL-reviewer-*.md` files (core, patterns, examples)
- [ ] Create `reviewer-agent.ts`
- [ ] Define review checklist
- [ ] Integrate into merge flow
- [ ] Test against known-bad code

### Security Review Gate

Mandatory security review step (Sonnet) before any agent output is marked complete:
1. Repository context understanding (existing patterns, frameworks)
2. Differential analysis (only new code, not entire codebase)
3. Vulnerability assessment (trace data flow from inputs to sensitive operations)

Only flag issues with >80% confidence of actual exploitability. No theoretical issues, no style concerns.

### Test Plan

1. Scaffold new project → valid monorepo with Next.js, Docker Compose, GitHub Actions
2. Firebase setup → hosting config, auth config, environment files
3. Railway Postgres → connection string, Drizzle config, migration setup
4. CI pipeline → runs lint, type-check, test, build on push
5. **Preview deployment → PR creates preview URL** (blocks Phase 7.5)
6. Full greenfield → end-to-end from scaffold to deployed preview URL
7. InfraProvider interface → mock provider passes same test suite
8. Project with 10+ env vars → all properly configured across environments
9. CI failure recovery → failed deploy doesn't break staging/prod
10. Principal Reviewer catches intentionally bad code

## Key Files Reference

### Existing (to integrate with)
- Agent registration: `packages/core/src/worker.ts`
- Task queue: `packages/core/src/queue/task-queue.ts`
- Task service: `packages/core/src/services/task-service.ts`
- Agent patterns: `packages/core/src/agents/backend-agent.ts` (reference for structure)
- SKILL layered pattern: `skills/backend/SKILL-backend-core.md`
- Monolithic SKILL to split: `skills/SKILL-devops-engineer.md`

### To Create
- `packages/core/src/agents/devops-agent.ts`
- `packages/core/src/agents/reviewer-agent.ts`
- `packages/core/src/agents/types/infra-provider.ts`
- `packages/core/src/agents/providers/firebase-railway-provider.ts`
- `skills/devops/SKILL-devops-{core,patterns,examples}.md`
- `skills/reviewer/SKILL-reviewer-{core,patterns,examples}.md`

### Documentation
- Phases roadmap: `docs/SOLOENTERPRISE_PHASES_CURRENT.md`
- Architecture: `docs/MASTER_ARCHITECTURE.md`
- LIFE_SAVE recovery context: `docs/LIFE_SAVE.md`

## Repo

github.com/mattbara/soloenterprise, `development` branch

---

*Phase 7 closes the gap between "agents generate code" and "client receives a deployed application". It's the last major infrastructure piece before multi-agent integration (Phase 8).*
