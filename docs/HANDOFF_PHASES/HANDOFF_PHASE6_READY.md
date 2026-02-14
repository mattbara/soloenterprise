# SoloEnterprise — Phase 6 Handoff: Project Scoper Agent

## Current State (2026-02-14)

All engineering agent infrastructure is complete. The pipeline is validated end-to-end. Phase 6 is the first business agent — the Project Scoper.

## What's Complete

### Phase 5.5: Real Project Validation (COMPLETE)
- Booking Management System: 5/5 tasks, 19 files, 0 syntax errors, 0 human interventions
- Identified 4 issues, all addressed in subsequent phases

### Phase 5.6: Architect Layer (COMPLETE)
- `generateTechSpec()` generates per-task technical specifications (Opus 4.6)
- Complexity gating: only runs for `database-task`, `full-feature`, or tasks with dependencies
- Integrated into all 3 agents (backend, frontend, QA) + command executor + dependency resolver
- Notifications System E2E: 5/5 tasks, 32 files, 0 retries, ~34k tokens, 100% cache hit
- 2 bugs found and fixed (status overwrite, context profile misassignment)

### Phase 5.7: Image Requirement Extractor (IMPLEMENTED, NOT MERGED)
- **Branch:** `phase-5/image-reading-new-requirements` (uncommitted changes)
- Upload API with Sharp resize + magic byte validation
- Claude Vision extracts structured visual requirements from attached images
- Orchestrator injects visual context into decomposition prompt
- UI: RequirementsModal upload + RecentTasks thumbnail display
- **Status:** Functionally complete but uncommitted. No tests. Not merged.
- **Decision needed:** Commit + PR + merge before starting Phase 6, or defer?

### Context Profile 3-Pass System (IMPLEMENTED, on 5.7 branch)
- Pass 1: Override keywords (short-circuit)
- Pass 2: Positive signal collection (with frontend-aware filtering)
- Pass 3: Negative signals (demotion to cancel false positives)
- 132 + 48 tests
- **Same branch as 5.7 — same merge decision applies**

## Pipeline Flow (Current)

```
User submits requirement (+ optional images)
  → Image Requirement Extractor (Sonnet Vision, if images attached)
  → Orchestrator (Opus 4.6) decomposes into tasks
  → Architect Layer (Opus 4.6) generates tech spec per complex task
  → BullMQ queues tasks with dependencies
  → Agents (Sonnet 4.5) execute against spec + SKILL files
  → Output to generated/tasks/{task-id}/
  → Human reviews via dashboard
```

## Working Agents

| Agent | Model | Status |
|-------|-------|--------|
| Orchestrator | Opus 4.6 | Working — decomposes, assigns, manages dependencies |
| Backend | Sonnet 4.5 | Working — API routes, DB queries, services |
| Frontend | Sonnet 4.5 | Working — React components, pages, hooks |
| QA | Sonnet 4.5 | Working — Vitest tests, coverage |
| Architect | Opus 4.6 | Working — tech specs (not a separate agent, runs in orchestrator pipeline) |
| Image Extractor | Sonnet 4.5 | Working — visual requirements (not merged yet) |

## Phase 6: Project Scoper Agent — What to Build

### Purpose

The Project Scoper is the first business-facing agent. It sits BEFORE the orchestrator in the pipeline. It takes an unstructured client brief and produces a structured project specification that the orchestrator can decompose.

### New Pipeline Position

```
Client brief (unstructured text)
  → Project Scoper Agent (Opus) → structured project spec + scope document
  → [Human reviews scope]
  → Orchestrator → decompose → tasks → agents → code
```

### What the Scoper Produces

1. **Structured project spec** — features, requirements, constraints parsed from brief
2. **Complexity estimates** — per component (simple/standard/complex)
3. **Agent capability mapping** — which agents handle which parts
4. **Task breakdown** — rough effort estimates before orchestrator decomposition
5. **Gap analysis** — what's missing from the brief, what requires human decision
6. **Client-facing scope document** — readable by non-technical stakeholders

### Key Architecture Decisions to Make

1. **New agent vs. pipeline step?** — Scoper needs its own queue and SKILL files (unlike architect which runs inline). It's a separate agent.
2. **Model:** Opus 4.6 (strategic reasoning, business judgment needed)
3. **Output location:** `generated/reports/{project-id}/` (business output, not code)
4. **Scope document format:** Markdown? Structured YAML/JSON? Both?
5. **Integration point:** New API route for brief submission → scoper agent → human review → orchestrator

### Files to Create

| File | Purpose |
|------|---------|
| `skills/scoper/SKILL-scoper-core.md` | Core rules: parsing, estimation, gap detection |
| `skills/scoper/SKILL-scoper-patterns.md` | Standard patterns: brief types, complexity heuristics |
| `skills/scoper/SKILL-scoper-examples.md` | Example briefs → example specs |
| `packages/core/src/agents/project-scoper-agent.ts` | Agent implementation |
| `packages/core/src/agents/utils/scoper-context-loader.ts` | Context loading (if needed) |

### Test Plan (from phases doc)

**Baseline (1-5):**
1. Simple landing page brief
2. CRUD app with auth brief
3. Multi-service API brief
4. Existing codebase modification brief
5. Brief with contradictory requirements

**Stress (6-10):**
6. Extremely vague brief ("build me an app")
7. Tech outside agent capabilities
8. Unrealistic timeline expectations
9. Non-English brief
10. Proprietary/unknown systems

### Prerequisite Decision

Before starting Phase 6, decide on Phase 5.7:
- **Option A:** Commit + PR + merge Phase 5.7, then start Phase 6 from clean `development`
- **Option B:** Start Phase 6 on a separate branch from `development`, merge 5.7 independently
- **Option C:** Defer Phase 5.7 entirely — image support is nice-to-have, not blocking

## Key Files Reference

### Existing (Phase 5 infrastructure)
- Schema: `packages/db/src/schema.ts`
- Orchestrator: `packages/core/src/agents/orchestrator-agent.ts`
- Command Executor: `packages/core/src/agents/utils/orchestrator-command-executor.ts`
- Skill Loader: `packages/core/src/agents/utils/skill-loader.ts`
- Context Profiles: `packages/core/src/agents/utils/context-profiles.ts`
- Architect Spec Generator: `packages/core/src/agents/utils/architect-spec-generator.ts`

### Patterns to Follow
- Agent pattern: `backend-agent.ts` (simplest reference)
- SKILL file layering: `skills/backend/SKILL-backend-core.md` + patterns + examples
- Context loading: `packages/core/src/agents/utils/context-loader.ts`
- Token metrics: `TokenMetrics` interface in any agent

### Documentation
- Phases roadmap: `docs/SOLOENTERPRISE_PHASES_CURRENT.md`
- Architecture: `docs/MASTER_ARCHITECTURE.md`
- Consulting pipeline: `docs/CONSULTING_PIPELINE.md`
- Schema additions: `docs/SCHEMA_ADDITIONS.md`

## Repo

github.com/mattbara/soloenterprise, `development` branch

---

*Phase 6 is the pivot point from engineering infrastructure to business value. The Scoper agent is the client-facing entry point — it turns messy briefs into structured specs that the engineering pipeline can execute.*
