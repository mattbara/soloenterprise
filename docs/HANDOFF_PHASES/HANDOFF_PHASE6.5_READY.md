# SoloEnterprise — Phase 6.5 Handoff: Client Reporter Agent

## Current State (2026-02-14)

Phase 6 (Project Scoper) is complete. The scoper takes client briefs and produces structured YAML scopes + client-facing documents. The next business agent is the Client Reporter — it sits at the END of the pipeline, producing progress reports from task execution data.

## What's Complete

### Phase 6: Project Scoper Agent (COMPLETE)
- 12/12 tests passed (5 baseline + 5 stress + 2 adversarial)
- 10 fixes applied during testing
- SKILL files: core, patterns, examples
- Pipeline: `POST /api/briefs → BullMQ → Opus → YAML scope + client document`
- Key behaviors: refuses to scope vague briefs, catches hallucinations, pushes back on timelines, provisional scopes for non-English

## Pipeline Flow (Current)

```
Client brief (unstructured text)
  → Project Scoper Agent (Opus) → structured project spec + scope document
  → [Human reviews scope]
  → Orchestrator (Opus 4.6) decomposes into tasks
  → Architect Layer (Opus 4.6) generates tech spec per complex task
  → BullMQ queues tasks with dependencies
  → Agents (Sonnet 4.5) execute against spec + SKILL files
  → Output to generated/tasks/{task-id}/
  → Human reviews via dashboard
  → ??? CLIENT REPORTER GOES HERE ???
```

## Working Agents

| Agent | Model | Status |
|-------|-------|--------|
| Project Scoper | Opus | Working — briefs → structured scopes |
| Orchestrator | Opus 4.6 | Working — decomposes, assigns, manages dependencies |
| Backend | Sonnet 4.5 | Working — API routes, DB queries, services |
| Frontend | Sonnet 4.5 | Working — React components, pages, hooks |
| QA | Sonnet 4.5 | Working — Vitest tests, coverage |
| Architect | Opus 4.6 | Working — tech specs (runs in orchestrator pipeline) |

## Phase 6.5: Client Reporter Agent — What to Build

### Purpose

The Client Reporter is the second business-facing agent. It sits AFTER task execution, aggregating results into client-readable progress reports. Where the Scoper answers "what will we build?", the Reporter answers "what did we build and where are we?"

### What the Reporter Produces

1. **Progress reports** — aggregate task statuses into project-level progress
2. **Milestone summaries** — what was delivered in each milestone
3. **Blocker reports** — what's stuck and what decisions are needed from the client
4. **Cost tracking** — token usage mapped to estimated hours/cost
5. **Client-facing updates** — readable by non-technical stakeholders (same tone as scoper's client document)

### Key Architecture Decisions to Make

1. **Model:** Sonnet 4.5 (structured output generation — less reasoning needed than scoping)
2. **Trigger:** Manual (API call) or automatic (on milestone completion)?
3. **Output format:** Markdown? Markdown + PDF generation? Both?
4. **Output location:** `generated/reports/{project-id}/` (alongside scoper output?)
5. **Data sources:** tasks table, questions table, token metrics, artifacts, scopes
6. **Report types:** Weekly update, milestone report, project summary — all three or start with one?

### Files to Create

| File | Purpose |
|------|---------|
| `skills/client-reporter/SKILL-client-reporter-core.md` | Core rules: tone, structure, what to include/exclude |
| `skills/client-reporter/SKILL-client-reporter-patterns.md` | Report templates, data aggregation patterns |
| `packages/core/src/agents/client-reporter-agent.ts` | Agent implementation |
| `src/app/api/reports/route.ts` | API endpoint to trigger report generation |

### Checklist (from phases doc)

- [ ] SKILL files created (core, patterns)
- [ ] Create `client-reporter-agent.ts`
- [ ] Progress report generation from task data
- [ ] Milestone tracking
- [ ] Cost tracking (token usage → estimated hours)
- [ ] Report templates (weekly update, milestone report, project summary)

### Data Available for Reports

The reporter can query these tables:
- `tasks` — status, agent type, token metrics, created/completed timestamps
- `questions` — blocking items, human responses
- `projects` — project-level status
- `project_briefs` — original brief content
- `project_scopes` — structured scope (estimates, requirements, milestones)
- `artifacts` — generated files per task

## Key Files Reference

### Existing (use as patterns)
- Scoper agent (closest pattern): `packages/core/src/agents/project-scoper-agent.ts`
- Scoper SKILL files: `skills/project-scoper/SKILL-project-scoper-core.md`
- Schema: `packages/db/src/schema.ts`
- Skill Loader: `packages/core/src/agents/utils/skill-loader.ts`

### Documentation
- Phases roadmap: `docs/SOLOENTERPRISE_PHASES_CURRENT.md`
- Phase 6 handover: `docs/HANDOFF_PHASES/HANDOFF_PHASE6_COMPLETE.md`
- Architecture: `docs/MASTER_ARCHITECTURE.md`

## Repo

github.com/mattbara/soloenterprise, `development` branch

---

*Phase 6.5 completes the business agent pair: Scoper (before engineering) + Reporter (after engineering). Together they form the client-facing bookends of the consulting pipeline.*
