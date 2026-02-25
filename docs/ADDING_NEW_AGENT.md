# Adding a New Agent to SoloEnterprise

**Last Updated:** 2026-01-28  
**Purpose:** Definitive checklist for adding any new agent type. Follow every step.

---

## Pre-Flight: Before Writing Code

- [ ] Define agent scope in `SOLOENTERPRISE_PHASES_CURRENT.md`
- [ ] Determine agent category: `engineering` (writes code) or `business` (writes documents/reports)
- [ ] Determine what context the agent needs (different from other agents?)
- [ ] Decide on test plan (baseline tests 1-5, stress tests 6-10)

---

## Phase A: SKILL Files

Location: `skills/{agent-type}/`

### Required Files (Layered Structure)

| File | Purpose | Load When |
|------|---------|-----------|
| `SKILL-{type}-core.md` | Identity, constraints, output format, human escalation | Always |
| `SKILL-{type}-patterns.md` | Standard patterns, conventions, quality principles | Standard tasks |
| `SKILL-{type}-examples.md` | Complete worked examples | Complex/new pattern tasks |

### SKILL File Checklist

- [ ] `SKILL-{type}-core.md` created (~800-1200 tokens)
  - [ ] Agent identity and role
  - [ ] Tech stack constraints
  - [ ] Import rules (CRITICAL: only import what's visible in context)
  - [ ] Missing context rules (when to ASK vs proceed)
  - [ ] Output format with XML file tags
  - [ ] MUST/MUST NOT constraints
  - [ ] Human escalation triggers
  - [ ] Model specification

- [ ] `SKILL-{type}-patterns.md` created (~700-1000 tokens)
  - [ ] Quality principles
  - [ ] Standard patterns for this agent type
  - [ ] File organization conventions
  - [ ] Common scenarios

- [ ] `SKILL-{type}-examples.md` created (~1000-1500 tokens)
  - [ ] 2-3 complete worked examples
  - [ ] Shows full input → output flow
  - [ ] Covers different complexity levels

---

## Special Case: Orchestrator Agent

The Orchestrator is different from implementation agents (backend, frontend, qa, devops):

### SKILL Files (4 files, not 3)

| File | Purpose | Load When |
|------|---------|-----------|
| `SKILL-orchestrator-core.md` | Identity, agent registry, task structure | Always |
| `SKILL-orchestrator-assignment.md` | File locks, decomposition, task assignment | Task creation |
| `SKILL-orchestrator-quality.md` | 3-strike rule, gates, environment promotion | Task completion |
| `SKILL-orchestrator-examples.md` | Decomposition patterns, state machine | First-time patterns |

### Skill Loader

Use `loadSkillsForOrchestrator()` not `loadSkillsForTask()`:
```typescript
// Implementation agents
const skills = await loadSkillsForTask(description, 'backend');

// Orchestrator
const skills = await loadSkillsForOrchestrator(operation);
// operation: 'assignment' | 'quality' | 'full'
```

### Context Needs

Orchestrator needs project-level context, not code-level:
- All existing tasks and their statuses
- Current file locks
- Pending questions
- Available agents (and which are unavailable)

### Model

Orchestrator uses Claude Opus (`claude-opus-4-5-20251101`) for strategic reasoning.
Other agents use Sonnet.

---

## Special Case: Business Operations Agents

Business agents (Project Scoper, Client Reporter) differ from engineering agents:

### Differences from Engineering Agents

| Aspect | Engineering Agent | Business Agent |
|--------|------------------|----------------|
| Output | Code files in sandbox | Documents (markdown, YAML) |
| Sandbox | `generated/tasks/{id}/` | `generated/reports/{project-id}/` |
| Context needed | Code, schema, routes | Project scope, task statuses, client info |
| Quality gates | Lint, type check, tests | Human review (always) |
| Model | Sonnet (code generation) | Opus (scoper) or Sonnet (reporter) |

### Context Loader

Business agents need different context than engineering agents:

```typescript
// Engineering agents
const context = await buildBackendContext(task, profile);

// Business agents
const context = await buildProjectContext(projectId);
// Includes: scope, task statuses, milestones, client info, cost data
```

### Output Handling

Business agent outputs go to `generated/reports/{project-id}/`:
- `scope-{date}.md` — project scope documents
- `weekly-{date}.md` — weekly client reports
- `milestone-{name}.md` — milestone completion reports
- `internal-{date}.yaml` — internal metrics (not client-facing)

---

## Phase B: Core Implementation

### B1: Agent File

Location: `packages/core/src/agents/{type}-agent.ts`

Copy structure from `backend-agent.ts`:

```typescript
// Required exports
export function create{Type}Worker(): Worker
export function shutdown{Type}Worker(): Promise<void>

// Required internals
- Load skills via loadSkillsForTask(description, '{type}')
- Build system prompt with cache_control: { type: 'ephemeral' }
- Call Claude API (model: claude-sonnet-4-5-20250929)
- Parse response via parseAgentOutput()
- Write files via writeGeneratedFiles()
- Log token metrics including cache stats
```

Checklist:
- [ ] `{type}-agent.ts` created
- [ ] Follows backend-agent.ts structure exactly
- [ ] Uses correct agent type string in loadSkillsForTask
- [ ] Token metrics logged with cache stats
- [ ] Exports createXxxWorker and shutdownXxxWorker
- [ ] Uses two-stage pipeline (scaffold → Claude → validate) if engineering agent

### B1.5: Scaffolder Integration (if applicable)

If the new agent generates code (engineering agents only — not business agents):

Location: `packages/core/src/scaffolder/`

Check if existing scaffolders cover the agent's output patterns. If not, create a new scaffolder:
```typescript
// packages/core/src/scaffolder/{type}-scaffold.ts
export async function scaffold{Type}Task(
  task: Task,
  importMap: ImportMap,
  schema?: ZodSchemaOutput[]
): Promise<string>;
```

Checklist:
- [ ] Check if existing scaffolders (backend-route, frontend-page, test-shell) cover this agent's needs
- [ ] If not, create new scaffolder following existing patterns
- [ ] Register scaffolder in `packages/core/src/scaffolder/index.ts`
- [ ] Update agent worker to use two-stage pipeline (scaffold → Claude → validate)
- [ ] Add SKILL file "Scaffold Mode" section for the new agent

### B2: Context Loader (If Different from Backend)

If agent needs different context than backend (like QA needs source files, not route examples):

Location: `packages/core/src/agents/utils/{type}-context-loader.ts`

- [ ] Context loader created (or reuse existing if appropriate)
- [ ] Exports build{Type}Context()
- [ ] Documents what context this agent needs vs others

### B3: Agent Index Export

Location: `packages/core/src/agents/index.ts`

- [ ] Added exports for new agent

### B4: Queue Registration

Location: `packages/core/src/queue/task-queue.ts`

Check if queue already exists in `QUEUE_NAMES`:
```typescript
export const QUEUE_NAMES = {
  backend: 'backend-tasks',
  frontend: 'frontend-tasks',
  qa: 'qa-tasks',        // Add if missing
  // ... etc
};
```

- [ ] Queue name added to QUEUE_NAMES (if not already present)

### B5: Worker Type Registration

Location: `packages/core/src/services/worker-registry.ts`

Check if type exists in `WorkerType`:
```typescript
export type WorkerType = 'backend' | 'frontend' | 'qa' | 'devops' | 'orchestrator';
```

- [ ] Worker type added to WorkerType union (if not already present)

### B6: Worker Startup

Location: `packages/core/src/worker.ts`

Add startup section:
```typescript
// QA Agent Worker
if (workerType === 'all' || workerType === 'qa') {
  console.log('[Worker] Starting QA agent worker...');
  createQAWorker();
  console.log('[Worker] QA agent worker started');
}
```

- [ ] Worker startup code added to worker.ts

### B7: Package.json Script

Location: `packages/core/package.json`

Add script:
```json
"worker:qa": "tsx src/worker.ts qa"
```

- [ ] Worker script added to package.json

### B8: Scaffolder Integration (Two-Stage Pipeline)

If this is an engineering agent (writes code), integrate with the scaffolder pipeline:

Location: `packages/core/src/scaffolder/`

The two-stage pipeline: scaffold locally (free) → Claude fills business logic (paid) → validate locally (free).

```typescript
// In your agent's processTask function:
// 1. Generate scaffold from spec + import map
const scaffold = await generateScaffold(task, importMap);

// 2. Pass scaffold to Claude as part of system prompt
const systemPrompt = buildPromptWithScaffold(skills, spec, scaffold);

// 3. After Claude response, validate locally
const validation = await localValidator.validate(generatedFiles, taskDir);
if (!validation.passed) {
  // Retry with validation errors as context
}
```

- [ ] Agent calls scaffolder before Claude API call (if engineering agent)
- [ ] Agent passes scaffold output in system prompt
- [ ] Agent runs local validator on Claude output before writing files
- [ ] SKILL core file includes "Scaffold Mode" section

**Skip if:** This is a business agent (scoper, reporter) — they produce documents, not code.

### B9: TypeScript Verification

- [ ] Run `pnpm tsc --noEmit` - all types pass

---

## Phase C: Dashboard UI Updates

### C1: Agent Type Dropdown

Location: `src/app/page.tsx` (or wherever NewTaskModal is)

Find the agent type options array and add the new type:

```typescript
const AGENT_TYPES = [
  { value: 'backend', label: 'Backend' },
  { value: 'frontend', label: 'Frontend' },
  { value: 'qa', label: 'QA' },           // Add new agent
  // ... future agents
] as const;
```

- [ ] Agent type added to dropdown options

### C2: Worker Control Panel

Location: `src/components/worker-panel.tsx` (or wherever workers are listed)

Add the new worker to the list:

```typescript
const WORKERS = [
  { type: 'backend', label: 'Backend Worker' },
  { type: 'frontend', label: 'Frontend Worker' },
  { type: 'qa', label: 'QA Worker' },     // Add new worker
  // ... future workers
];
```

- [ ] Worker added to control panel

### C3: Verify Dashboard

- [ ] Dashboard loads without errors
- [ ] New agent type appears in dropdown
- [ ] New worker appears in worker panel
- [ ] Can start/stop new worker from UI

---

## Phase D: Testing

### D1: Baseline Tests (1-5)

Run 5 standard tasks for this agent type:

| Test | Description | Expected |
|------|-------------|----------|
| 1 | Simple task | Completes, valid output |
| 2 | Task with props/params | Handles inputs correctly |
| 3 | Task requiring context | Uses provided context |
| 4 | Task with validation | Validates inputs |
| 5 | Complex multi-part task | Handles complexity |

- [ ] Test 1: PASS / FAIL
- [ ] Test 2: PASS / FAIL
- [ ] Test 3: PASS / FAIL
- [ ] Test 4: PASS / FAIL
- [ ] Test 5: PASS / FAIL

### D2: Stress Tests (6-10)

Probe for weaknesses:

| Test | Description | Expected |
|------|-------------|----------|
| 6 | Vague requirements | Asks questions OR makes sensible defaults |
| 7 | Missing dependencies/context | Asks for clarification |
| 8 | Conflicting requirements | Asks for clarification |
| 9 | Edge cases | Handles gracefully |
| 10 | Security boundary test | Never escapes sandbox |

- [ ] Test 6: PASS / FAIL
- [ ] Test 7: PASS / FAIL
- [ ] Test 8: PASS / FAIL
- [ ] Test 9: PASS / FAIL
- [ ] Test 10: PASS / FAIL

### D3: Fix Issues

- [ ] All issues from testing documented
- [ ] Fixes applied
- [ ] Re-run failed tests

---

## Phase E: Documentation

- [ ] Update `SOLOENTERPRISE_PHASES_CURRENT.md` with completion status
- [ ] Document any agent-specific learnings
- [ ] Update this runbook if process changed

---

## Quick Reference: File Locations

| Component | Location |
|-----------|----------|
| SKILL files | `skills/{type}/SKILL-{type}-*.md` |
| Agent implementation | `packages/core/src/agents/{type}-agent.ts` |
| Context loader | `packages/core/src/agents/utils/{type}-context-loader.ts` |
| Agent exports | `packages/core/src/agents/index.ts` |
| Queue names | `packages/core/src/queue/task-queue.ts` |
| Worker types | `packages/core/src/services/worker-registry.ts` |
| Worker startup | `packages/core/src/worker.ts` |
| Worker script | `packages/core/package.json` |
| Dashboard dropdown | `src/app/page.tsx` (NewTaskModal) |
| Worker panel | `src/components/worker-panel.tsx` |
| Business SKILL files | `skills/{agent-type}/SKILL-{type}-*.md` |
| Report outputs | `generated/reports/{project-id}/` |
| Project context loader | `packages/core/src/agents/utils/project-context-loader.ts` |
| Scaffolder modules | `packages/core/src/scaffolder/` |
| Test runner sandbox | `packages/core/src/test-runner/` |

---

## Common Mistakes

1. **Forgetting dashboard UI** — Agent works but can't be triggered from UI
2. **Wrong agent type string** — `loadSkillsForTask(desc, 'qa')` must match folder name `skills/qa/`
3. **Missing worker startup** — Worker registered but never started in worker.ts
4. **Empty SKILL files** — Migration not completed from monolithic to layered
5. **Different context needs** — Copying backend context loader when agent needs different context

---

*Version 3.0 — Added scaffolder integration step (B8) for two-stage pipeline. Added scaffolder/test-runner to file locations. — 2026-02-24*
