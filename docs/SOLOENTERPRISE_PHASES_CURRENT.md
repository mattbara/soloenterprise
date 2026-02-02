# SoloEnterprise: Project Phases

**Last Updated:** 2026-02-02
**Current Phase:** Phase 5 (Orchestrator Agent) — Ready to Start
**Branch:** `phase-5/orchestrator-agent`

---

## Timeline Overview

| Phase | Status | Duration |
|-------|--------|----------|
| 0. Foundation | ✅ COMPLETE | 4 weeks |
| 1. Token Optimization | ✅ COMPLETE | 1 week |
| 2. Decision Cache | ⏭️ SKIPPED (for now) | — |
| 3. Frontend Agent | ✅ COMPLETE | 2-3 weeks |
| 4. QA Agent | ✅ COMPLETE | 1 week |
| 5. Orchestrator Agent | 🔵 NEXT | 2-3 weeks |
| 6. DevOps Agent | ⬜ NOT STARTED | 1-2 weeks |
| 7. Principal Reviewer | ⬜ NOT STARTED | 1 week |
| 8. Multi-Agent Integration | ⬜ NOT STARTED | 2-3 weeks |
| 9. Documentation | ⬜ NOT STARTED | 1 week |
| 10. Product Manager | 🔮 FUTURE | TBD |
| 11. Design | 🔮 FUTURE | TBD |
| 12. Go-to-Market | 🔮 FUTURE | TBD |
| 13. Operations | 🔮 FUTURE | TBD |

**Total Estimate:** 15-19 weeks remaining (Phases 4-9 only)

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
| DevOps | ⚠️ Needs splitting | ❌ Not created | Phase 6 |
| Orchestrator | ✅ Layered | ❌ Not created | Phase 5 |
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

## Phase 5: Orchestrator Agent 🔵 NEXT

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

### Checklist

- [x] SKILL files (EXISTS: core, assignment, quality, examples)
- [ ] Create `orchestrator-agent.ts`
- [ ] Implement task decomposition
- [ ] Implement agent assignment
- [ ] Implement completion review
- [ ] Test multi-agent workflows
- [ ] Human escalation flow
- [ ] Test: DevOps tasks correctly escalate to human

### Test Plan

**Baseline Tests (1-5):**
1. Simple single-agent task decomposition
2. Multi-agent feature decomposition (backend + frontend)
3. Task with dependencies (frontend waits for backend)
4. Bug fix decomposition (QA first, then fix)
5. Full feature with all 3 agents

**Stress Tests (6-10):**
6. Vague requirements → asks clarifying questions
7. Conflicting requirements → escalates to human
8. DevOps task requested → escalates (agent unavailable)
9. Circular dependencies → detects and reports
10. File lock conflict → resolves or escalates

---

## Phase 6: DevOps Agent

**Duration:** 1-2 weeks
**Status:** BLOCKED (SKILL files need splitting)
**Branch:** `phase-6/devops-agent`
**Prerequisite:** Phase 5 complete

### Pre-work Required

Before implementation, split `skills/SKILL-devops-engineer.md` (757 lines) into:
- `skills/devops/SKILL-devops-core.md` (~1,000-1,200 tokens)
- `skills/devops/SKILL-devops-patterns.md` (~800-1,000 tokens)
- `skills/devops/SKILL-devops-examples.md` (~1,500-2,000 tokens)

### Checklist

- [ ] Split monolithic SKILL file into layered structure
- [ ] Narrow scope (decide: GitHub Actions + Docker only? Or full Terraform?)
- [ ] Create `devops-agent.ts`
- [ ] Run tests 1-5
- [ ] Run tests 6-10

---

## Phase 7: Principal Reviewer Agent

**Duration:** 1 week  
**Status:** NOT STARTED  
**Prerequisite:** Phase 6 complete  
**Model:** Claude Opus (critical review)

### Scope

- Security anti-patterns
- Performance issues
- Logic errors
- Error handling gaps

### Checklist

- [ ] Create `SKILL-reviewer-*.md` files
- [ ] Create `reviewer-agent.ts`
- [ ] Define review checklist
- [ ] Integrate into merge flow
- [ ] Test against known-bad code

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

### Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Token costs exceed budget | HIGH | ✅ Phase 1 complete (40-80% reduction) |
| Multi-agent conflicts | MEDIUM | File lock manager exists |
| Agent output quality varies | MEDIUM | 3-strike rule + human escalation |
| Scope creep | HIGH | Follow phase checklist strictly |

---

*Version 6.0 — Reordered phases: Orchestrator before DevOps — 2026-02-02*
