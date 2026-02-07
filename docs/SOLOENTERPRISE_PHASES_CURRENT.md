# SoloEnterprise: Project Phases

**Last Updated:** 2026-02-07
**Current Phase:** Phase 5 (Orchestrator Agent + Project Management) — Testing
**Branch:** `development` (orchestrator merged)

---

## Timeline Overview

| Phase | Status | Duration |
|-------|--------|----------|
| 0. Foundation | ✅ COMPLETE | 4 weeks |
| 1. Token Optimization | ✅ COMPLETE | 1 week |
| 2. Decision Cache | ⏭️ SKIPPED (for now) | — |
| 3. Frontend Agent | ✅ COMPLETE | 2-3 weeks |
| 4. QA Agent | ✅ COMPLETE | 1 week |
| 5. Orchestrator Agent + Project Management | 🔵 NEXT | 2-3 weeks |
| 5.5 Real Project Validation | ⬜ NOT STARTED | 1-2 weeks |
| 6. Project Scoper Agent | ⬜ NOT STARTED | 1-2 weeks |
| 6.5 Client Reporter Agent | ⬜ NOT STARTED | 1 week |
| 7. DevOps Agent + Principal Reviewer | ⬜ NOT STARTED | 2-3 weeks |
| 8. Multi-Agent Integration | ⬜ NOT STARTED | 2-3 weeks |
| 9. Documentation | ⬜ NOT STARTED | 1 week |
| 10. Product Manager | 🔮 FUTURE | TBD |
| 11. Design | 🔮 FUTURE | TBD |
| 12. Go-to-Market | 🔮 FUTURE | TBD |
| 13. Operations | 🔮 FUTURE | TBD |

**Total Estimate:** 18-24 weeks remaining (Phases 5-9 only)

---

## Phase 0: Foundation ✅ COMPLETE

**Duration:** 4 weeks (DONE)

### What Was Built

| Component | Location |
|-----------|----------|
| Database Schema (8 tables) | `packages/db/src/schema.ts` |
| Task Queue (BullMQ + Redis) | `packages/core/src/queue/task-queue.ts` |
| File Lock Manager | `packages/core/src/locks/file-lock-manager.ts` |
| Worker Registry | `packages/core/src/services/worker-registry.ts` |
| Backend Agent | `packages/core/src/agents/backend-agent.ts` |
| Dashboard UI | `src/app/page.tsx` |
| Questions UI | `src/app/questions/page.tsx` |
| API Routes | `src/app/api/` |

### Agents Status

| Agent | SKILL Files | Implementation | Status |
|-------|-------------|----------------|--------|
| Backend | ✅ Layered | ✅ `backend-agent.ts` | **WORKING** |
| Frontend | ✅ Layered | ✅ `frontend-agent.ts` | **WORKING** |
| QA | ✅ Layered | ✅ `qa-agent.ts` | **WORKING** |
| DevOps | ⚠️ Needs splitting | ❌ Not created | Phase 7 |
| Orchestrator | ✅ Layered | ❌ Not created | Phase 5 |
| Project Scoper | ❌ Not created | ❌ Not created | Phase 6 |
| Client Reporter | ❌ Not created | ❌ Not created | Phase 6.5 |
| Reviewer | ❌ Not created | ❌ Not created | Phase 7 |

---

## Phase 1: Token Optimization ✅ COMPLETE

**Duration:** 1 week  
**Status:** COMPLETE  
**Result:** 40-80% token reduction achieved

### Checklist

- [x] Token metrics logging (`TokenMetrics` interface in backend-agent.ts)
- [x] SKILL file splitting (ALL 5 agent types)
- [x] Skill loader with complexity-based selection (`skill-loader.ts`, 278 lines)
- [x] Create `context-profiles.ts`
- [x] Update context loader to use profiles
- [x] Fix profile selection bug (`complete` → `full-feature` false positive)
- [x] Verify with test tasks

### Measured Results

| Task Type | Profile | Input Tokens | Reduction |
|-----------|---------|--------------|-----------|
| Simple endpoint | simple-endpoint | 1,532 | ~80% |
| Database query (filtered) | database-task | 4,288 | ~45% |
| Database query (full schema) | database-task | 7,762 | Baseline |

### SKILL File Structure (IMPLEMENTED)

```
skills/
├── common/
│   └── SKILL-common.md
├── backend/
│   ├── SKILL-backend-core.md
│   ├── SKILL-backend-patterns.md
│   └── SKILL-backend-examples.md
├── frontend/
│   ├── SKILL-frontend-core.md
│   ├── SKILL-frontend-patterns.md
│   └── SKILL-frontend-examples.md
├── qa/
│   ├── SKILL-qa-core.md
│   ├── SKILL-qa-patterns.md
│   └── SKILL-qa-examples.md
├── devops/
│   ├── SKILL-devops-core.md
│   ├── SKILL-devops-patterns.md
│   └── SKILL-devops-examples.md
└── orchestrator/
    ├── SKILL-orchestrator-core.md
    ├── SKILL-orchestrator-assignment.md
    ├── SKILL-orchestrator-quality.md
    └── SKILL-orchestrator-examples.md
```

**22 layered files** + 6 legacy monolithic files (can be deleted)

### Context Profiles (IMPLEMENTED)

```typescript
// packages/core/src/agents/utils/context-profiles.ts
export const CONTEXT_PROFILES = {
  'simple-endpoint': {
    includeSchema: false,
    includeRouteExamples: true,
    maxExamples: 1,
  },
  'database-task': {
    includeSchema: true,
    schemaTablesFilter: ['relevant', 'tables', 'only'],
    includeRouteExamples: false,
  },
  'full-feature': {
    includeSchema: true,
    includeRouteExamples: true,
    maxExamples: 2,
  },
  'bug-fix': {
    includeSchema: false,
    includeRouteExamples: false,
    maxExamples: 0,
  },
};
```

### Key Files Created/Updated

| File | Purpose |
|------|---------|
| `packages/core/src/agents/utils/context-profiles.ts` | Profile definitions + selection logic |
| `packages/core/src/agents/utils/context-loader.ts` | Profile-aware context building |
| `packages/core/src/agents/utils/skill-loader.ts` | Complexity-based SKILL layer loading |
| `packages/core/src/agents/backend-agent.ts` | Token metrics logging |

---

## Phase 2: Decision Cache ⏭️ SKIPPED

**Status:** Deferred until needed  
**Reason:** Decision cache is useful for multi-task projects with repeated architecture decisions. Not needed until Orchestrator is decomposing large features into multiple tasks.

**Will revisit after:** Phase 5 (Orchestrator Agent)

### Schema (Ready When Needed)

```typescript
export const decisions = pgTable('decisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id),
  key: text('key').notNull(),           // e.g., "auth-strategy"
  decision: text('decision').notNull(), // e.g., "nextauth"
  decidedBy: text('decided_by').notNull(), // 'agent' | 'human'
  decidedAt: timestamp('decided_at').defaultNow(),
  locked: boolean('locked').default(true),
});
```

---

## Phase 3: Frontend Agent ✅ COMPLETE

**Duration:** 2-3 weeks
**Status:** COMPLETE
**Branch:** `phase-3/frontend-agent` (merged)
**Prerequisite:** Phase 1 ✅

### Checklist

- [x] SKILL files (EXISTS: core, patterns, examples)
- [x] Create `frontend-agent.ts` (copy pattern from backend-agent.ts)
- [x] Add `frontend-tasks` queue to BullMQ
- [x] Add to worker registry
- [x] Update dashboard to show frontend tasks
- [x] Run tests 1-5 (baseline)
- [x] Run tests 6-10 (stress)
- [x] Fix issues found
- [x] Document learnings

### Test Plan

**Baseline Tests (1-5):**
1. Simple React component
2. Component with props/state
3. API integration component
4. Form with validation
5. Complex multi-component feature

**Stress Tests (6-10):**
6. Vague requirements
7. Styling edge cases (Tailwind specifics)
8. State management patterns
9. Conflicting UI requirements
10. Missing design context

---

## Phase 4: QA Agent ✅ COMPLETE

**Duration:** 1 week
**Status:** COMPLETE
**Branch:** `phase-4/qa-agent`

### What Was Built

| Component | Location |
|-----------|----------|
| QA Agent | `packages/core/src/agents/qa-agent.ts` |
| QA Context Loader | `packages/core/src/agents/utils/qa-context-loader.ts` |
| SKILL Files (Layered) | `skills/qa/SKILL-qa-core.md`, `SKILL-qa-patterns.md`, `SKILL-qa-examples.md` |

### Test Results

**Baseline Tests (1-5):** ✅ All passed
- Utility functions, React components, async services, API routes, custom hooks
- Generated 18-32 test cases per task
- Proper Vitest + React Testing Library usage

**Stress Tests (6-10):** ✅ All passed
- Vague requirements → Asked clarifying questions
- Missing context → Requested source files
- Conflicting requirements → Detected contradiction, asked for clarification
- Edge cases → Now tests undefined behavior with BUG comments
- Security boundary → Mocked fs, documented path traversal vulnerabilities

### Issues Fixed During Phase 4

1. **Question-answer workflow broken** - BullMQ job ID collision when re-queuing after human answers; fixed by adding timestamp to job ID
2. **SDK mocking pattern wrong** - Agent generated `await` in non-async `beforeEach`; fixed via SKILL file update
3. **Edge cases skipped** - Agent left TODO comments instead of testing; added SKILL rule to test undefined behavior

### SKILL File Updates

- Added External SDK Mocking pattern (4-step vi.mock pattern)
- Added "NEVER Do This" anti-patterns section
- Added Undefined Behavior Testing section
- Added MUST rule for testing edge cases even when broken

---

## Phase 5: Orchestrator Agent + Project Management 🔵 NEXT

**Duration:** 2-3 weeks
**Status:** Ready to start
**Branch:** `phase-5/orchestrator-agent`
**Prerequisite:** Phase 4 ✅
**Model:** Claude Opus (strategic reasoning)

### Scope

- Task decomposition from requirements
- Agent assignment based on task type
- Dependency management
- Completion review
- Human escalation
- DevOps tasks → escalate to human (agent not yet built)
- Project-level task management (not just individual tasks)
- Multi-project awareness (which project is this task for?)
- Project status aggregation (roll up task statuses to project level)

### Checklist

- [x] SKILL files (EXISTS: core, assignment, quality, examples)
- [ ] Create `orchestrator-agent.ts`
- [ ] Implement task decomposition
- [ ] Implement agent assignment
- [ ] Implement completion review
- [ ] Test multi-agent workflows
- [ ] Human escalation flow
- [ ] Test: DevOps tasks correctly escalate to human
- [ ] Project context passed to all agent invocations
- [ ] Project-level status API endpoint

### Test Plan

**Baseline Tests (1-5):**
1. Simple single-agent task decomposition
2. Multi-agent feature decomposition (backend + frontend)
3. Task with dependencies (frontend waits for backend)
4. Multi-project task decomposition (2 projects simultaneously)
5. Full feature with project context flowing to agents

**Stress Tests (6-10):**
6. Vague requirements → asks clarifying questions
7. Conflicting requirements → escalates to human
8. DevOps task requested → escalates (agent unavailable)
9. Two projects with shared agent pool (resource contention)
10. File lock conflict → resolves or escalates

---

## Phase 5.5: Real Project Validation

**Duration:** 1-2 weeks
**Status:** NOT STARTED
**Prerequisite:** Phase 5 complete

### Description

Use SoloEnterprise end-to-end on ONE real project. This is not optional. Every failure, human intervention, and workaround gets documented. This data shapes all subsequent phases.

### Checklist

- [ ] Select real project (internal tool or test client)
- [ ] Define project brief as a client would write it
- [ ] Run through full pipeline: brief → scope → decompose → execute → deliver
- [ ] Track: tasks completed vs failed, human interventions, time per task
- [ ] Track: agent acceptance rate (first attempt vs revisions needed)
- [ ] Track: total token cost → map to theoretical billable hours
- [ ] Document ALL pain points
- [ ] Document what manual work was still needed
- [ ] Write post-mortem with specific improvements needed

### Output

Validation report that determines if Phase 6+ priorities need changing.

---

## Phase 6: Project Scoper Agent

**Duration:** 1-2 weeks
**Status:** NOT STARTED
**Branch:** `phase-6/project-scoper`
**Prerequisite:** Phase 5.5 complete
**Model:** Claude Opus (strategic reasoning — scoping requires business judgment)

### Scope

- Parse client briefs (unstructured text) into structured project specs
- Estimate complexity per component (simple/standard/complex)
- Map requirements to agent capabilities
- Generate task breakdown with rough effort estimates
- Identify gaps/risks requiring human decision
- Produce client-facing scope document

### Checklist

- [ ] SKILL files created (core, patterns, examples)
- [ ] Create `project-scoper-agent.ts`
- [ ] Brief → structured spec parsing
- [ ] Complexity estimation heuristics
- [ ] Agent capability mapping
- [ ] Client-facing scope document generation
- [ ] Test with 5 different project briefs (varying complexity)
- [ ] Test with intentionally vague brief → should ask questions

### Test Plan

**Baseline Tests (1-5):**
1. Simple landing page project brief
2. CRUD app with auth project brief
3. Multi-service API project brief
4. Existing codebase modification brief
5. Brief with contradictory requirements

**Stress Tests (6-10):**
6. Extremely vague brief ("build me an app")
7. Brief requiring tech outside agent capabilities
8. Brief with unrealistic timeline expectations
9. Brief in non-English (should flag, not guess)
10. Brief referencing proprietary/unknown systems

---

## Phase 6.5: Client Reporter Agent

**Duration:** 1 week
**Status:** NOT STARTED
**Prerequisite:** Phase 6 complete
**Model:** Claude Sonnet (structured output generation)

### Scope

- Aggregate task statuses into project-level progress
- Generate client-facing progress reports (markdown → PDF)
- Highlight blockers and decisions needed
- Produce milestone completion summaries
- Track time/cost per project

### Checklist

- [ ] SKILL files created (core, patterns)
- [ ] Create `client-reporter-agent.ts`
- [ ] Progress report generation from task data
- [ ] Milestone tracking
- [ ] Cost tracking (token usage → estimated hours)
- [ ] Report templates (weekly update, milestone report, project summary)

---

## Phase 7: DevOps Agent + Principal Reviewer

**Duration:** 2-3 weeks
**Status:** NOT STARTED
**Branch:** `phase-7/devops-agent`
**Prerequisite:** Phase 6.5 complete

### DevOps Agent

#### Pre-work Required

Before implementation, split `skills/SKILL-devops-engineer.md` (757 lines) into:
- `skills/devops/SKILL-devops-core.md` (~1,000-1,200 tokens)
- `skills/devops/SKILL-devops-patterns.md` (~800-1,000 tokens)
- `skills/devops/SKILL-devops-examples.md` (~1,500-2,000 tokens)

#### Checklist

- [ ] Split monolithic SKILL file into layered structure
- [ ] Narrow scope (decide: GitHub Actions + Docker only? Or full Terraform?)
- [ ] Create `devops-agent.ts`
- [ ] Run tests 1-5
- [ ] Run tests 6-10

### PR Workflow & Code Review Pipeline (Sub-task)

The mechanism by which agent-generated code reaches the real codebase.

#### How It Works

1. **Agents write code** to `packages/core/generated/tasks/{task-id}/` (sandboxed, no git awareness)
2. **Orchestrator detects milestone completion** — all tasks for a milestone are `completed` or explicitly descoped by human
3. **Orchestrator emits `create_pull_request` action** with file mappings (sandbox path → real codebase path)
4. **Command executor handles git operations:**
   - Creates feature branch from `development`
   - Assembles files from sandbox to real paths **in dependency order** (task A's files first, then task B's — NOT merged arbitrarily)
   - Detects file path conflicts between non-dependent tasks → **fail fast, escalate to human** (should not happen if file locks worked, but defensive check)
   - Commits with structured message (task IDs, agent types, milestone)
   - Pushes branch and creates PR via GitHub API
   - Assigns PR to Principal Software Engineer
5. **`pull_requests` table tracks state** (see SCHEMA_ADDITIONS.md)
6. **Dashboard shows pending PR notifications** for human
7. **GitHub webhook receives PR events** (approved, changes_requested, merged)
8. **Changes requested → new orchestrator task created** with the full review comments pasted in; orchestrator re-decomposes into agent tasks (v1: no clever per-comment routing)

#### Edge Cases

**Partial milestone failure:** A milestone PR is only created when ALL tasks are either `completed` or explicitly descoped by the human. No partial PRs. The existing 3-strike rule escalates failed tasks to human review. The human decides: fix it manually, remove it from scope, or move it to the next milestone. This keeps the PR flow simple and the milestone deliverable clean.

**File path conflicts during assembly:** Agents write to separate sandboxes. If two tasks in the same milestone both wrote to `src/routes/index.ts`, the assembly step has two versions. If the tasks are in a dependency chain, apply in dependency order (later task wins). If the tasks are NOT dependent, this is a file lock failure — fail fast and escalate to human. Do not attempt automatic merging.

#### HARD RULE

**Only the Principal Software Engineer can merge PRs.** No exceptions — not agents, not CI, not the founder unless acting as Principal. This is enforced via GitHub branch protection rules.

#### Checklist

- [ ] Add `create_pull_request` action to orchestrator output parser
- [ ] Implement PR creation in command executor (branch, commit, push, gh API)
- [ ] Add `pull_requests` table to database schema
- [ ] GitHub webhook endpoint for PR events
- [ ] Dashboard: pending PR list with approve/request-changes actions
- [ ] Orchestrator: handle `changes_requested` → re-open tasks with feedback
- [ ] Branch protection rules on `development` branch
- [ ] Test: milestone completion → PR created → Principal merges

### Principal Reviewer Agent (Sub-task)

**Model:** Claude Opus (critical review)

#### Scope

- Security anti-patterns
- Performance issues
- Logic errors
- Error handling gaps
- PR-level code review (automated first pass before human Principal)

#### Checklist

- [ ] Create `SKILL-reviewer-*.md` files
- [ ] Create `reviewer-agent.ts`
- [ ] Define review checklist
- [ ] Integrate into PR review flow (agent reviews first, then human Principal approves/merges)
- [ ] Test against known-bad code

#### Future: Anthropic Message Batches API

The Batches API allows submitting up to 10,000 async requests with 50% discount on input/output tokens (stacks with prompt caching for up to 95% savings). Results delivered within 24 hours. NOT suitable for the real-time agent pipeline (orchestrator → agent → response), but worth evaluating for bulk non-time-sensitive workloads once we're running multiple concurrent projects:

- **Bulk QA runs:** Independent test validations across a milestone's task outputs
- **Client Reporter:** Generating multiple milestone/sprint reports simultaneously
- **Project Scoper:** Parallel scope analysis across multiple modules
- **Pre-PR code review:** Batch review of all completed task outputs before PR assembly

**When to revisit:** When running 5+ concurrent projects with predictable overnight/batch workloads. Not before Phase 7.

---

## Phase 8: Multi-Agent Integration

**Duration:** 2-3 weeks  
**Status:** INFRASTRUCTURE READY  
**Prerequisite:** All agents complete

### Already Done

- [x] File lock manager
- [x] Database schema supports multi-agent
- [x] Task queue supports all agent types

### Checklist

- [ ] Test file lock conflicts between agents
- [ ] Test dependency resolution
- [ ] Implement environment promotion (DEV → TEST → STAGING → PROD)
- [ ] Implement human approval gates
- [ ] End-to-end workflow test
- [ ] Parallel agent test
- [ ] Conflict resolution test
- [ ] Rollback test

---

## Phase 9: Documentation & Cleanup

**Duration:** 1 week  
**Status:** NOT STARTED  
**Prerequisite:** System stable for 1 week

### Checklist

- [ ] Rewrite `MASTER_ARCHITECTURE.md`
- [ ] Update `BOOTSTRAP.md`
- [ ] Delete outdated docs (legacy monolithic SKILL files)
- [ ] Create agent development guide
- [ ] Create SKILL file authoring guide
- [ ] Create troubleshooting runbook
- [ ] Write ADRs (BullMQ, Neon, layered SKILLs, Opus for orchestrator)

---

## Future Phases: Business Automation

> **Note:** These phases are vision, not committed. Engineering foundation (Phases 3-9) must be complete and stable first.

### Phase 10: Product Manager Agent 🔮 FUTURE

**Prerequisite:** Engineering agents stable (Phases 3-9 complete)
**Model:** Claude Opus (strategic reasoning)

**Why First After Engineering:**
- Feeds directly into engineering pipeline
- PRDs are structured documents (easier to validate than marketing copy)
- Completes "idea → shipped product" loop

**Scope:**
- Input: Market research, user feedback, business goals
- Output: PRDs (Markdown + YAML frontmatter), user stories, acceptance criteria
- Validation: Engineering agents can execute the specs

**Checklist:**
- [ ] Create `SKILL-product-manager-*.md` files
- [ ] Create `product-agent.ts`
- [ ] Define PRD template format
- [ ] Integration with orchestrator
- [ ] Test: Can engineering agents execute generated PRDs?

---

### Phase 11: Design Agent 🔮 FUTURE

**Prerequisite:** Phase 10 complete
**Model:** Claude Sonnet

**Scope:**
- Input: PRD, brand guidelines
- Output: Component specs, Tailwind configs, React component skeletons
- NOT: Figma files, images

**Checklist:**
- [ ] Create `SKILL-design-*.md` files
- [ ] Create `design-agent.ts`
- [ ] Define component spec format
- [ ] Integration with frontend agent

---

### Phase 12: Go-to-Market Agents 🔮 FUTURE

**Prerequisite:** Product to market exists
**Agents:** Content, Marketing

**Content Agent:**
- Input: Product features, target audience
- Output: Blog posts, documentation, social posts
- Validation: Human review (brand voice)

**Marketing Agent:**
- Input: Product positioning, channels, budget
- Output: Campaign plans, ad copy, email sequences
- Validation: Human approval before spend

**Checklist:**
- [ ] Create `SKILL-content-*.md` files
- [ ] Create `SKILL-marketing-*.md` files
- [ ] Create `content-agent.ts`
- [ ] Create `marketing-agent.ts`
- [ ] Define output formats (Markdown for content, JSON for campaigns)
- [ ] Human approval workflows

---

### Phase 13: Operations Agents 🔮 FUTURE

**Risk Level:** HIGH (financial, legal liability)
**Agents:** Finance, Legal

**Finance Agent:**
- Input: Bank transactions, invoices
- Output: Reports, forecasts, categorization
- Requires: Plaid, Stripe, QuickBooks integrations
- Gate: Human review ALWAYS

**Legal Agent:**
- Input: Contract templates, business context
- Output: Draft contracts, compliance checklists
- Gate: Human review MANDATORY (never auto-execute)

**Checklist:**
- [ ] Create `SKILL-finance-*.md` files
- [ ] Create `SKILL-legal-*.md` files
- [ ] Create `finance-agent.ts`
- [ ] Create `legal-agent.ts`
- [ ] Financial service integrations (Plaid, Stripe, etc.)
- [ ] Mandatory human approval gates
- [ ] Audit logging for all outputs

---

## Appendix

### Codebase Statistics

| Component | Lines | Files |
|-----------|-------|-------|
| Database Schema | 456 | 1 |
| Task Queue | 391 | 1 |
| Backend Agent | 300+ | 1 |
| File Lock Manager | 200+ | 1 |
| Agent Utilities | 500+ | 6 |
| API Routes | 300+ | 8 |
| UI Components | 500+ | 15+ |
| SKILL Files (Layered) | ~3,000+ | 22 |

### Database Tables

| Table | Status |
|-------|--------|
| projects | ✅ |
| tasks | ✅ |
| questions | ✅ |
| file_locks | ✅ |
| artifacts | ✅ |
| deployments | ✅ |
| agent_sessions | ✅ |
| decisions | ⏭️ Deferred to Phase 5 |

### Branch Naming Convention

```
phase-{number}/{feature-name}

Examples:
- phase-1/context-profiles (done)
- phase-3/frontend-agent (done)
- phase-4/qa-agent (done)
- phase-5/orchestrator-agent (next)
```

### What Changed From Original Plan

| Original | Reality |
|----------|---------|
| Auto-Claude integration | Custom BullMQ + worker system |
| Git worktrees | `generated/tasks/{id}/` folders |
| GCP-native | Neon + Upstash (serverless) |
| n8n notifications | Not implemented |
| 12-week timeline | 20-24 weeks |
| Phase 2 before Phase 3 | Skipped Phase 2, go straight to agents |
| Phase 5 = DevOps, Phase 6 = Orchestrator | Swapped: Orchestrator first (SKILL files ready) |
| Engineering-only phases | Business ops phases inserted (Scoper, Reporter) after Orchestrator |
| No validation gate | Phase 5.5 real project validation required before proceeding |
| DevOps Agent = Phase 6 | DevOps Agent pushed to Phase 7 (can be done manually initially) |

### Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Token costs exceed budget | HIGH | ✅ Phase 1 complete (40-80% reduction) |
| Multi-agent conflicts | MEDIUM | File lock manager exists |
| Agent output quality varies | MEDIUM | 3-strike rule + human escalation |
| Scope creep | HIGH | Follow phase checklist strictly |
| No real-world validation | HIGH | Phase 5.5 mandatory gate |
| No client-facing pipeline | HIGH | Phase 6/6.5 business agents |

---

*Version 7.0 — Business ops transformation: inserted Phases 5.5, 6, 6.5; DevOps pushed to Phase 7 — 2026-02-07*
