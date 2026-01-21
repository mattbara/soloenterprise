# SoloEnterprise: Project Phases

**Last Updated:** 2026-01-21  
**Current Phase:** Phase 3 (Frontend Agent) — Ready to Start  
**Branch:** `phase-3/frontend-agent`

---

## Timeline Overview

| Phase | Status | Duration |
|-------|--------|----------|
| 0. Foundation | ✅ COMPLETE | 4 weeks |
| 1. Token Optimization | ✅ COMPLETE | 1 week |
| 2. Decision Cache | ⏭️ SKIPPED (for now) | — |
| 3. Frontend Agent | 🔵 NEXT | 2-3 weeks |
| 4. QA Agent | ⬜ NOT STARTED | 1-2 weeks |
| 5. DevOps Agent | ⬜ NOT STARTED | 1-2 weeks |
| 6. Orchestrator Agent | ⬜ NOT STARTED | 2-3 weeks |
| 7. Principal Reviewer | ⬜ NOT STARTED | 1 week |
| 8. Multi-Agent Integration | ⬜ NOT STARTED | 2-3 weeks |
| 9. Documentation | ⬜ NOT STARTED | 1 week |

**Total Estimate:** 18-22 weeks remaining

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
| Frontend | ✅ Layered | ❌ Not created | Phase 3 |
| QA | ✅ Layered | ❌ Not created | Phase 4 |
| DevOps | ✅ Layered | ❌ Not created | Phase 5 |
| Orchestrator | ✅ Layered | ❌ Not created | Phase 6 |
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

**Will revisit after:** Phase 6 (Orchestrator Agent)

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

## Phase 3: Frontend Agent 🔵 NEXT

**Duration:** 2-3 weeks  
**Status:** Ready to start  
**Branch:** `phase-3/frontend-agent`  
**Prerequisite:** Phase 1 ✅

### Checklist

- [x] SKILL files (EXISTS: core, patterns, examples)
- [ ] Create `frontend-agent.ts` (copy pattern from backend-agent.ts)
- [ ] Add `frontend-tasks` queue to BullMQ
- [ ] Add to worker registry
- [ ] Update dashboard to show frontend tasks
- [ ] Run tests 1-5 (baseline)
- [ ] Run tests 6-10 (stress)
- [ ] Fix issues found
- [ ] Document learnings

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

## Phase 4: QA Agent

**Duration:** 1-2 weeks  
**Status:** NOT STARTED  
**Prerequisite:** Phase 3 complete  
**Scope:** Generate tests, not run them manually.

### Checklist

- [x] SKILL files (EXISTS: core, patterns, examples)
- [ ] Create `qa-agent.ts`
- [ ] Define test generation triggers
- [ ] Run tests 1-5
- [ ] Run tests 6-10
- [ ] Integrate with CI pipeline

---

## Phase 5: DevOps Agent

**Duration:** 1-2 weeks  
**Status:** NOT STARTED  
**Prerequisite:** Phase 4 complete  
**Scope:** Infrastructure as code.

### Checklist

- [x] SKILL files (EXISTS: core, patterns, examples)
- [ ] Create `devops-agent.ts`
- [ ] Define infrastructure triggers
- [ ] Test against real GCP/Terraform
- [ ] Run tests 1-5
- [ ] Run tests 6-10

---

## Phase 6: Orchestrator Agent

**Duration:** 2-3 weeks  
**Status:** NOT STARTED  
**Prerequisite:** Phases 3-5 complete  
**Model:** Claude Opus (strategic reasoning)

### Scope

- Task decomposition from requirements
- Agent assignment based on task type
- Dependency management
- Completion review
- Human escalation

### Checklist

- [x] SKILL files (EXISTS: core, assignment, quality, examples)
- [ ] Create `orchestrator-agent.ts`
- [ ] Implement task decomposition
- [ ] Implement agent assignment
- [ ] Implement completion review
- [ ] Test multi-agent workflows
- [ ] Human escalation flow
- [ ] **Consider:** Implement Decision Cache (Phase 2) at this point

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
| decisions | ⏭️ Deferred to Phase 6 |

### Branch Naming Convention

```
phase-{number}/{feature-name}

Examples:
- phase-1/context-profiles (done)
- phase-3/frontend-agent (next)
- phase-4/qa-agent
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

### Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Token costs exceed budget | HIGH | ✅ Phase 1 complete (40-80% reduction) |
| Multi-agent conflicts | MEDIUM | File lock manager exists |
| Agent output quality varies | MEDIUM | 3-strike rule + human escalation |
| Scope creep | HIGH | Follow phase checklist strictly |

---

*Version 3.0 — Phase 1 complete, ready for Phase 3 — 2026-01-21*
