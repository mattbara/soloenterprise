# SoloEnterprise: Project Phases

**Last Updated:** 2026-02-16
**Current Phase:** Phase 6.5 (Client Reporter Agent) — Ready to Start
**Branch:** `phase-6.5/client-reporter`

---

## Timeline Overview

| Phase | Status | Effort | Impact | Duration |
|-------|--------|--------|--------|----------|
| 0–4. Foundation + Agents | ✅ COMPLETE | — | — | — |
| 5–5.7 Orchestrator + Validation + Architect + Image Extractor | ✅ COMPLETE | — | — | — |
| 6. Project Scoper Agent | ✅ COMPLETE | — | — | — |
| **6.5 Client Reporter Agent** | **🔵 NEXT** | **M** | **High** | **3-5 days** |
| 6.6 Dashboard Navigation Overhaul | ⬜ NOT STARTED | S | Medium | 2-3 days |
| 6.7 Projects Management UI | ⬜ NOT STARTED | M | High | 3-5 days |
| 6.8 Scope Review UI | ⬜ NOT STARTED | S | Medium | 2-3 days |
| 7. DevOps Agent + Principal Reviewer | ⬜ NOT STARTED | L | Critical | 1-2 weeks |
| 7.5 QA Production Readiness | ⬜ NOT STARTED | L | High | 1 week |
| 7.7 Tool/Service Separation Refactor | ⬜ NOT STARTED | M | High | 3-5 days |
| 8. Multi-Agent Integration | ⬜ NOT STARTED | XL | Critical | 2-3 weeks |
| 8.5 Model Routing & Cost Optimization | ⬜ NOT STARTED | M | High | 3-5 days |
| 9. Documentation | ⬜ NOT STARTED | S | Medium | 3 days |
| 9.5 Institutional Memory & Knowledge Persistence | ⬜ NOT STARTED | L | High | 1-2 weeks |
| 10+ Business Automation (PM, Design, GTM, Ops) | 🔮 FUTURE | — | — | TBD |

**Remaining Estimate:** 10-15 weeks (Phases 6.5–9.5)

---

## Agents Status

| Agent | SKILL Files | Implementation | Status |
|-------|-------------|----------------|--------|
| Backend | ✅ Layered | ✅ `backend-agent.ts` | **WORKING** |
| Frontend | ✅ Layered | ✅ `frontend-agent.ts` | **WORKING** |
| QA | ✅ Layered | ✅ `qa-agent.ts` | **WORKING** |
| Orchestrator | ✅ Layered | ✅ `orchestrator-agent.ts` | **WORKING** |
| Project Scoper | ✅ Layered | ✅ `project-scoper-agent.ts` | **COMPLETE** |
| Client Reporter | ✅ Layered | ❌ Not created | Phase 6.5 |
| DevOps | ⚠️ Needs splitting | ❌ Not created | Phase 7 |
| Reviewer | ❌ Not created | ❌ Not created | Phase 7 |

---

## Phase 6: Project Scoper Agent ✅ COMPLETE

**Effort:** L | **Impact:** Critical
**Status:** COMPLETE — merged via PR #13
**Branch:** `phase-6/project-scoper`
**Model:** Claude Opus (strategic reasoning — scoping requires business judgment)

### Delivered

- ✅ Brief → structured spec parsing (YAML)
- ✅ Complexity estimation per component (simple/standard/complex)
- ✅ Agent capability mapping (backend, frontend, QA, devops)
- ✅ Task breakdown with effort estimates
- ✅ Gap/risk identification requiring human decision
- ✅ Client-facing scope document (markdown)
- ✅ Security assessment (LOW/MEDIUM/HIGH classification)
- ✅ SKILL files (core, patterns, examples)

### Remaining Items (Deferred)

- [ ] PII sanitization layer — strip emails, phone numbers, addresses before API call, restore in output
- [ ] Adversarial brief testing (fictional companies, contradictions)

### PII Sanitization (Production Requirement)

Before the scoper processes a brief, sanitize PII to avoid sending personal data to the API:
```typescript
function sanitizeBrief(brief: string): { sanitized: string; piiMap: Map<string, string> }
```
PII stripped before API call, restored in output. The piiMap stays in the database, never sent to Anthropic. GDPR compliance for production.

### 3-Amigo Layered Output

Scoper produces three document layers:
1. **PRD** — what needs to be built, user stories, acceptance criteria
2. **Technical Architecture** — system design, API specs, data models, integration points
3. **Agent Execution Package** — task breakdown mapped to agent capabilities, dependency graph, estimated token budget per task

Each layer builds on the previous. Orchestrator receives layer 3 as input. Layers 1 and 2 become reference context for agents via targeted retrieval.

---

## Phase 6.5: Client Reporter Agent 🔵 NEXT

**Effort:** M | **Impact:** High
**Duration:** 3-5 days
**Status:** SKILL files exist, no agent implementation
**Branch:** `phase-6.5/client-reporter`
**Prerequisite:** Phase 6 complete ✅
**Model:** Claude Sonnet (structured output generation)

### Scope

- Aggregate task statuses into project-level progress
- Generate client-facing progress reports (markdown)
- Highlight blockers and decisions needed
- Produce milestone completion summaries
- Track time/cost per project using existing `cost_tracking` table

### Cost Tracking Integration

**Existing infrastructure:**
- `cost_tracking` table: `projectId`, `taskId`, `agentType`, `tokensInput`, `tokensOutput`, `cachedTokens`, `apiCostUsd`, `estimatedBillableHours`
- `tasks.tokenMetrics` (jsonb): per-task token breakdown populated by all agents

**What this phase adds:**
- Wire agent runs to INSERT into `cost_tracking` after each task completion
- Token-to-USD pricing function (per model, input vs output vs cache)
- Aggregate queries for reports (cost per project, cost per agent type, cost per milestone)

**NO new tables.** The schema already supports this — it just needs the insertion logic.

### Report Types

| Report | Trigger | Content |
|--------|---------|---------|
| Weekly Update | Manual (API call) | Tasks completed, in progress, blocked. Decisions needed. |
| Milestone Report | On milestone completion | What was delivered, what's next, scope changes. |
| Project Summary | Project end | Full summary, metrics, lessons learned. |

### Checklist

- [ ] Create `client-reporter-agent.ts`
- [ ] Wire cost tracking insertion into agent execution pipeline
- [ ] Token-to-USD pricing function (model-aware)
- [ ] Weekly update report template
- [ ] Milestone report template
- [ ] Project summary report template
- [ ] API endpoint: `POST /api/reports` (trigger report generation)
- [ ] API endpoint: `GET /api/reports/{projectId}` (list reports)
- [ ] Test with real project data from Phase 5.5 validation

### What's NOT in This Phase

- ~~Batch API~~ — Requires async job infrastructure that doesn't exist. Defer to Phase 8+ if report volume justifies it.
- ~~PDF generation~~ — Markdown is sufficient for MVP. PDF can be added later with a library like `puppeteer` or `react-pdf`.
- ~~Automated scheduling~~ — Reports are manually triggered via API. Cron-based automation is Phase 8+ territory.

### Test Plan

1. Generate weekly update for Phase 5.5 project → verify task counts, blockers, cost summary
2. Generate milestone report → verify deliverables listed, next milestone identified
3. Generate project summary → verify full metrics, lessons learned section
4. Cost tracking: verify `cost_tracking` rows created after agent runs
5. Cost aggregation: verify per-project and per-agent-type totals match

---

## Phase 6.6: Dashboard Navigation Overhaul

**Effort:** S | **Impact:** Medium
**Duration:** 2-3 days
**Status:** NOT STARTED
**Branch:** `phase-6.6/navigation-overhaul`
**Prerequisite:** None (independent of Phase 6.5)

### Scope

Replace top header navigation with sidebar layout. Cosmetic restructure — no new features.

### Changes

**Current:** Top header navigation with links to Dashboard, Questions, etc.

**New: Sidebar Navigation**
- **Left sidebar** (persistent, collapsible) replaces top header
- Sidebar sections:
  - **Projects** — main project management view (default landing page)
  - **Tasks** — cross-project task view (existing, moved to sidebar)
  - **Questions** — human question queue (existing, moved to sidebar)
  - **Workers** — worker status panel (existing, moved to sidebar)
  - **Reports** — client reports list (new, from Phase 6.5)
  - **Settings** — future: API keys, provider config, user preferences
- Active section highlighted
- Sidebar collapses to icon-only on small screens
- Top header becomes minimal: SoloEnterprise logo + user avatar

### Tech

- shadcn/ui sidebar component + lucide-react icons
- Update `layout.tsx` to sidebar layout
- Responsive: sidebar collapses on mobile

### Checklist

- [ ] Create sidebar component with navigation items
- [ ] Move existing nav items to sidebar
- [ ] Implement sidebar collapse for mobile
- [ ] Update `layout.tsx`
- [ ] Set Projects as default landing page

### Test Plan

1. All existing pages accessible via sidebar
2. Sidebar collapse/expand works on mobile breakpoint
3. Active section highlighted correctly
4. No broken links or missing routes

---

## Phase 6.7: Projects Management UI

**Effort:** M | **Impact:** High
**Duration:** 3-5 days
**Status:** NOT STARTED
**Branch:** `phase-6.7/projects-ui`
**Prerequisite:** Phase 6.6 (sidebar must exist for navigation context)

### Scope

Projects table with full CRUD + New Project overlay that triggers the scoper.

### Projects Table

| Column | Description |
|--------|-------------|
| **Name** | Project name (clickable, future: opens detail view) |
| **Client** | Client name |
| **Brief** | Status badge: `received` / `in progress` / `complete` |
| **Date Started** | Project creation date |
| **Progress** | (completed tasks / total tasks) × 100 as progress bar |
| **ETA** | Estimated completion date or "TBD" |
| **Actions** | Delete button |

**Brief status updates:** Server-side. When user navigates to Projects page, Server Component queries current brief status from DB. No push updates needed — `router.refresh()` after any mutation.

**Table features:** Sortable by any column, default newest first, empty state with CTA.

### New Project Overlay

Full-page overlay (shadcn `Dialog`):

| Field | Type | Required |
|-------|------|----------|
| **Project Name** | Text input | Yes |
| **Client Name** | Text input | No |
| **Project Type** | Checkbox (disabled: "End-to-End Project") | N/A |
| **GitHub URL** | Text input | No |
| **Project Brief** | Large textarea (min 300px) | Yes |

**On submit:**
1. Validate: Project Name + Brief not empty
2. Create project + brief records in database
3. Set brief status to `received`
4. Close overlay, `router.refresh()` → new project appears in table
5. Trigger Project Scoper agent with the brief (async via BullMQ)
6. User refreshes page to see brief status update (`received` → `in progress` → `complete`)

### Delete Flow

- First confirmation: "Are you sure you want to delete [Project Name]?"
- Second confirmation: "Type the project name to confirm deletion:" (exact match)
- On confirm: cancel queued tasks → release file locks → delete artifacts → delete DB records
- `router.refresh()` after deletion
- **Irreversible.** Double confirmation because deletion destroys everything.

### Checklist

- [ ] Projects table component with all columns
- [ ] Sortable column headers
- [ ] Brief status badges (grey=received, yellow=in progress, green=complete)
- [ ] Progress bar column
- [ ] Empty state
- [ ] New Project overlay with form + validation
- [ ] On submit: create records + trigger scoper
- [ ] Delete flow with double confirmation
- [ ] Connect all to database via Server Actions

### Test Plan

1. Create project → appears in table with Brief=`received`, Progress=0%, ETA=TBD
2. After scoper runs → refresh page → Brief badge updates correctly
3. Delete project → double confirmation → all data cleaned up
4. Sort by each column → correct ordering
5. Empty state → shows CTA to create first project
6. Special characters in project name → handles correctly

---

## Phase 6.8: Scope Review UI

**Effort:** S | **Impact:** Medium
**Duration:** 2-3 days
**Status:** NOT STARTED
**Branch:** `phase-6.8/scope-review`
**Prerequisite:** Phase 6.7 (projects table must exist, brief=`complete` badge must be clickable)

### Scope

Scope review overlay when clicking the green `complete` badge on a project's brief status.

### Scope Review Overlay

Full-page overlay rendering the scoper's output:
- Summary section
- Requirements list with complexity badges (simple/standard/complex)
- Security assessment badge (LOW=green, MEDIUM=yellow, HIGH=red with "ESCALATE TO HUMAN" warning)
- Effort estimates per component
- Gaps/questions requiring human decision
- Out of scope items
- Milestones

### Actions

- **Reject** — sets brief status back to `received`, logs rejection reason (text input)
- **Approve** — sets project status to `approved`, logs approval
- **Neither triggers downstream actions.** Orchestrator wiring comes in Phase 8.

### Checklist

- [ ] Scope review overlay (full-page dialog)
- [ ] Render scope output as readable HTML/markdown
- [ ] Security classification badge with correct colors
- [ ] Reject button → status update + reason logging
- [ ] Approve button → status update
- [ ] `router.refresh()` after approve/reject

### Test Plan

1. Click `complete` badge → overlay opens with correct scope data
2. Security badges render correctly for LOW/MEDIUM/HIGH
3. Reject → brief status resets to `received`, rejection logged
4. Approve → project status set to `approved`, approval logged
5. Close overlay → returns to projects table

---

## Phase 7: DevOps Agent + Principal Reviewer

**Effort:** L | **Impact:** Critical
**Duration:** 1-2 weeks
**Status:** NOT STARTED
**Branch:** `phase-7/devops-agent`
**Prerequisite:** Phase 6.8 complete
**Model:** Claude Sonnet (infrastructure automation)

### Strategic Context

Scoped exclusively for **Type 1: Greenfield projects**. Creates a complete, self-contained, handover-ready project from scratch. Client receives a working application with live URLs, CI/CD pipeline, and everything needed to continue independently.

### Provider Abstraction (MANDATORY)

**Do NOT hardcode provider SDK calls.** Use an interface so providers can be swapped later:

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

**Initial provider stack (hardcoded behind interface):**
- **Hosting + Auth:** Firebase (Hosting + Authentication)
- **Database:** Dockerized PostgreSQL + Drizzle ORM (local dev), Railway (production)
- **CI/CD:** GitHub Actions
- **Environments:** dev / staging / prod
- **Repo:** GitHub (per client project)
- **E2E:** Playwright (pre-installed, runs in CI)
- **Security:** pnpm audit + dependency scanning in CI

### Pre-work Required

Split `skills/SKILL-devops-engineer.md` (757 lines) into:
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

- [ ] Create `SKILL-reviewer-*.md` files
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

---

## Phase 7.5: QA Production Readiness

**Effort:** L | **Impact:** High
**Duration:** 1 week
**Status:** NOT STARTED
**Prerequisite:** Phase 7 complete — **specifically requires preview deployments for Lighthouse testing**

### Strategic Context

Upgrades QA for production handover. Tests that must pass before a project ships to a client.

### Lighthouse Dependency

Lighthouse requires a deployed URL. This phase depends on Phase 7's **preview deployments**:
- Every PR creates a preview URL (Firebase Hosting preview channel or equivalent)
- Lighthouse CI runs against the preview URL
- If Phase 7 does NOT deliver preview deployments, Lighthouse testing must be deferred

### New QA Capabilities

**Visual Regression Testing:**
- Playwright screenshot comparison against reference images
- Component-level and page-level visual snapshots
- Tolerance threshold for acceptable pixel differences
- Runs in CI on every PR

**Accessibility Testing:**
- axe-core via `@axe-core/playwright`
- WCAG 2.1 AA compliance checks
- Color contrast, alt text, ARIA labels, keyboard navigation, focus management

**Security Baseline Testing:**
- Auth enforcement: unauthenticated requests to protected routes return 401/403
- XSS: script injection in form inputs sanitized
- Security headers: `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`
- CORS: only allowed origins
- CSRF: tokens on state-changing requests (if applicable)

**Production Readiness Gate:**
- Orchestrator-enforced: no project marked "ready for handover" without passing
- All unit + E2E tests pass (visual, accessibility, security)
- Build succeeds
- Lighthouse performance score ≥ 80 (requires preview deployment URL)
- No critical/high severity issues from pnpm audit
- Human reviews results before final production deployment

### Checklist

- [ ] Update QA SKILL files for production readiness
- [ ] Visual regression: Playwright screenshot comparison
- [ ] Accessibility: axe-core integration
- [ ] Security baseline: auth, XSS, headers, CORS test patterns
- [ ] Production readiness gate: orchestrator integration
- [ ] Lighthouse CI integration (against preview deploy URLs from Phase 7)
- [ ] All test types run in GitHub Actions CI
- [ ] Human approval gate for production deployment

---

## Phase 7.7: Tool/Service Separation Refactor

**Effort:** M | **Impact:** High
**Duration:** 3-5 days
**Status:** NOT STARTED
**Branch:** `phase-7.7/tool-service-refactor`
**Prerequisite:** Phase 7.5 complete
**MUST complete before Phase 8** — multi-agent integration requires decoupled agents

### Why This Exists

Current agents mix prompt logic, tool definitions, and business logic in single files. Phase 8 (multi-agent integration) requires agents that can share services, be tested independently, and compose without coupling. Doing this refactor DURING Phase 8 is significantly harder than doing it BEFORE.

### Target Architecture

```
packages/core/src/
├── agents/          → Thin wrappers: system prompt + tool list + model config
├── tools/           → Tool definitions: params → service call → string result (for LLM consumption)
└── services/        → Business logic: typed inputs/outputs, testable without LLM, CLI-callable
```

**Example:**
```typescript
// services/file-writer.ts — pure business logic
export function writeFile(taskId: string, path: string, content: string): WriteResult { ... }

// tools/write-file-tool.ts — LLM-facing wrapper
export const writeFileTool: Tool = {
  name: 'write_file',
  execute: async (params) => {
    const result = writeFile(params.taskId, params.path, params.content);
    return `File written to ${result.path} (${result.bytes} bytes)`;
  }
};

// agents/backend-agent.ts — thin wrapper
export function createBackendAgent(task: Task) {
  return { systemPrompt: loadSkill('backend'), tools: [writeFileTool, ...], model: 'sonnet' };
}
```

### Checklist

- [ ] Define `Service` interface pattern
- [ ] Extract file-writer service from tool
- [ ] Extract command-executor service from tool
- [ ] Extract file-lock service from tool
- [ ] Refactor backend-agent to use services via tools
- [ ] Refactor frontend-agent to use services via tools
- [ ] Refactor QA agent to use services via tools
- [ ] Verify all existing tests pass after refactor
- [ ] Document the pattern in agent development guide

### Test Plan

1. All existing agent tests pass unchanged
2. Services are independently testable (no LLM required)
3. Tools compose correctly with services
4. Agent behavior unchanged after refactor (same inputs → same outputs)

---

## Phase 8: Multi-Agent Integration

**Effort:** XL | **Impact:** Critical
**Duration:** 2-3 weeks
**Status:** INFRASTRUCTURE READY
**Prerequisite:** Phase 7.7 (Tool/Service refactor) complete

### Already Done

- [x] File lock manager
- [x] Database schema supports multi-agent
- [x] Task queue supports all agent types
- [x] Tool/Service separation (Phase 7.7)

### Cache Warming Strategy — CRITICAL (Highest ROI)

**Problem:** Parallel agents create separate caches for the same SKILL files. Race condition multiplies costs.

**Numbers:** Without warming: 4.2% cache hit rate. With warming: 94.1%. Cost reduction: 59%.

```typescript
async function warmProjectCache(projectId: string, skillFiles: string[]) {
  await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 10,
    system: [
      { type: "text", text: skillFiles.join('\n'), cache_control: { type: "ephemeral" } },
      { type: "text", text: projectContext, cache_control: { type: "ephemeral" } }
    ],
    messages: [{ role: "user", content: "Context loaded. Respond with 'Ready.'" }]
  });
}
await warmProjectCache(projectId, skills);
await Promise.all([runAgent("backend", task1), runAgent("frontend", task2)]);
```

### Strategic Cache Breakpoint Placement

**Rules:**
1. Maximum 4 cache breakpoints per request
2. Static content FIRST, dynamic content LAST
3. >20 content blocks before a breakpoint = no cache hits without intermediate breakpoints
4. Minimum 1,024 tokens per cacheable segment (Sonnet/Opus)

**Optimal structure:**
```
[CACHED] Tool definitions           ← Breakpoint 1
[CACHED] SKILL files                ← Breakpoint 2
[CACHED] Project context + scope    ← Breakpoint 3
[CACHED] Conversation history       ← Breakpoint 4
[NOT CACHED] Current task instruction
```

### Cost Tracking Consolidation

**Use existing `cost_tracking` table.** No new tables needed.

Wire into agent execution pipeline (started in Phase 6.5):
- Every agent run → INSERT into `cost_tracking` with model, tokens, calculated USD cost
- Aggregate per project, per agent type, per milestone
- Dashboard queries for Phase 8.5 cost monitoring

**Delete the proposed `token_usage` table** — `cost_tracking` already has all required columns.

### Token Budget Enforcement (Discrete Task)

**This is middleware, not a config setting.** Implementation:

```typescript
class TokenBudgetMiddleware {
  private budgets: Record<string, number> = {
    orchestrator: 500_000,
    backend: 200_000,
    frontend: 200_000,
    qa: 100_000,
    scoper: 300_000,
    reporter: 50_000,
  };

  async checkBudget(agentType: string, cumulativeTokens: number): Promise<Action> {
    const budget = this.budgets[agentType];
    if (cumulativeTokens > budget * 0.9) return 'compact'; // 90% → trigger compaction
    if (cumulativeTokens > budget) return 'escalate';       // 100% → escalate to human
    return 'continue';
  }
}
```

Tracks cumulative tokens across turns within a session. At 90% → compact conversation. At 100% → stop and escalate.

### Verification Gate

After every agent task, orchestrator runs verification:
```bash
test -f "generated/tasks/{id}/output.ts" && echo "✅" || echo "❌"
npx tsc --noEmit "generated/tasks/{id}/output.ts"
npx vitest run "generated/tasks/{id}/**/*.test.ts"
```
Task cannot be marked complete without passing. Failure: retry → different approach → escalate to human.

### Checklist

- [ ] Cache warming implementation
- [ ] Strategic cache breakpoint placement in all agents
- [ ] Token budget enforcement middleware
- [ ] Verification gate (bash-based, orchestrator-driven)
- [ ] Test file lock conflicts between agents
- [ ] Test dependency resolution
- [ ] Implement environment promotion (DEV → TEST → STAGING → PROD)
- [ ] Implement human approval gates
- [ ] End-to-end workflow test (multi-agent project)
- [ ] Parallel agent test (concurrent execution)
- [ ] Conflict resolution test
- [ ] Rollback test

### What's NOT in This Phase

- ~~Context accumulation management~~ — Agents don't have 50-turn conversations. Orchestrator is 5-10 turns max. If context limits become a real problem in production, add compaction then. Don't build speculatively.
- ~~Batch API~~ — Requires async job infrastructure. Only worth building if report volume at 20+ concurrent projects justifies it. Revisit after Phase 9.

---

## Phase 8.5: Model Routing & Cost Optimization

**Effort:** M | **Impact:** High
**Duration:** 3-5 days
**Status:** NOT STARTED
**Prerequisite:** Phase 8 complete

### Task-Complexity-Based Routing

```typescript
class ModelRouter {
  route(task: Task): ModelSelection {
    // Haiku ($0.25/$1.25 per M): ~60% of tasks
    if (task.complexity === 'simple' || task.type in ['lint','format','summarize','explore'])
      return { model: 'claude-haiku-4-5', reason: 'simple-task' };
    // Sonnet ($3/$15 per M): ~30% of tasks
    if (task.complexity === 'standard' || task.type === 'implementation')
      return { model: 'claude-sonnet-4-5', reason: 'standard-task' };
    // Opus ($5/$25 per M): ~10% of tasks
    if (task.complexity === 'complex' || task.type in ['architecture','decomposition','scoping'])
      return { model: 'claude-opus-4-5', reason: 'complex-task' };
    return { model: 'claude-sonnet-4-5', reason: 'default' };
  }
}
```

**Cost at 10K tasks/month:** All Opus ~$6,000 → Routed (60/30/10) ~$2,400 (60% reduction).

### Additional Optimizations

- **Haiku for non-critical work:** compaction, file exploration, formatting, log analysis, doc generation
- **Extended thinking budgets:** Simple 1K, Standard 4K, Complex 10K, max 32K
- **max_tokens per task type:** Code gen 4,096 / Tests 2,048 / Reports 2,048 / Verification 256

### Checklist

- [ ] Implement ModelRouter class
- [ ] Integrate into all agent dispatch paths
- [ ] Route summarization/compaction to Haiku
- [ ] Variable extended thinking budgets per complexity
- [ ] Optimized max_tokens per task type
- [ ] Cache performance monitoring (alert if hit rate < 70%)
- [ ] Per-request cost logging with model attribution
- [ ] Cost dashboard queries (daily/weekly/monthly)

---

## Phase 9: Documentation & Cleanup

**Effort:** S | **Impact:** Medium
**Duration:** 3 days
**Status:** NOT STARTED
**Prerequisite:** System stable for 1 week

### Checklist

- [ ] Rewrite `MASTER_ARCHITECTURE.md`
- [ ] Update `BOOTSTRAP.md`
- [ ] Delete outdated docs (legacy monolithic SKILL files)
- [ ] Create agent development guide (includes Tool/Service pattern from Phase 7.7)
- [ ] Create SKILL file authoring guide
- [ ] Create troubleshooting runbook
- [ ] Write ADRs (BullMQ, Neon, layered SKILLs, Opus for orchestrator, InfraProvider interface)

---

## Phase 9.5: Institutional Memory & Knowledge Persistence

**Effort:** L | **Impact:** High
**Duration:** 1-2 weeks
**Status:** NOT STARTED
**Prerequisite:** Phase 9 complete

### Registry-Based Institutional Memory

Centralized registry per project — solves the "agent fixes bug at 9:00, overwrites fix at 14:00" problem.

```markdown
# Project Registry: {project_name}

## 2026-02-16
| Report | Status | Summary |
|--------|--------|---------|
| backend-api-auth.md | COMPLETE | JWT auth with refresh tokens |
| frontend-login.md | COMPLETE | React login form with validation |

### Decisions Locked
- Auth: JWT with 15min access / 7day refresh tokens
- Database: PostgreSQL with Drizzle ORM
- API style: REST with OpenAPI spec
```

**Rules:**
1. Orchestrator reads registry at session start — last 3 days only (date-filtered)
2. Sub-agents NEVER read registry directly — orchestrator injects relevant context
3. Every completed task updates the registry
4. "Locked" decisions cannot be reversed without human approval
5. Lightweight reads: 50 lines vs 5,000 lines of full reports

### SKILL Feedback Loop

After failures: orchestrator identifies pattern → if generalizable → update SKILL file anti-patterns → if project-specific → add to registry "Known Issues". All SKILL updates go through human review (PR).

### Progressive Skill Disclosure Enhancement

Enhance skill-loader.ts:
- **Startup:** name/description only (minimal tokens)
- **Activation:** full SKILL.md when task type matches
- **Expansion:** example files only when pattern is new
- **Session caching:** once loaded, cache across subsequent calls in session

### Checklist

- [ ] Registry system per project
- [ ] Orchestrator reads registry at session start (date-filtered)
- [ ] Task completion updates registry automatically
- [ ] Decision locking mechanism
- [ ] SKILL feedback loop (failure → anti-pattern update)
- [ ] Human review gate for SKILL modifications
- [ ] Enhanced progressive skill disclosure in skill-loader.ts

---

## Future Phases: Business Automation 🔮

> Engineering foundation (Phases 6–9.5) must be complete and stable first.

| Phase | Agent | Input | Output | Key Challenge |
|-------|-------|-------|--------|---------------|
| 10 | Product Manager | Market research, feedback | PRDs, user stories | Validating spec quality |
| 11 | Design | Requirements, brand guidelines | CSS/Tailwind tokens, component specs | Output is subjective |
| 12 | Go-to-Market | Product info, audience | Marketing copy, campaigns | Needs real conversion data |
| 13 | Operations | Business metrics | Reports, forecasts, dashboards | Needs multiple completed projects |

---

## Cross-Cutting Concerns

These are applied across ALL phases — not standalone tasks.

### Exponential Backoff Retry
Retry 429 + 5xx with backoff (1s, 2s, 4s). Never retry 4xx. Max 3 retries.

### Prompt Caching on Every Call
Every API call MUST include `cache_control` on static content (SKILL files, tool definitions, project context). No exceptions. This is rule #9 in Non-Negotiable Rules.

### Cache Performance Monitoring
Log `cache_read_input_tokens`, `cache_creation_input_tokens` on every response. Alert if hit rate < 70%.

---

## Non-Negotiable Rules

1. **One phase at a time** — no parallel phase work
2. **Tests before moving on** — baseline and stress tests per phase
3. **Fix issues immediately** — don't defer bugs
4. **SKILL files are source of truth** — behavior from SKILLs, not hardcoded
5. **Sandbox isolation** — outputs to `generated/tasks/{id}/`, never modify SoloEnterprise code
6. **3-strike rule** — 3 failed attempts → escalate to human
7. **Human approval gates** — scoping, production deploy, security escalation
8. **Never skip steps or suggest workarounds** — find proper solutions
9. **Prompt caching on every call** — no API call without cache_control on static content
10. **Every project starts with a scoped brief** — no coding without written scope
11. **Client reports generated weekly** — not optional
12. **Token costs tracked per project** — maps to billing
13. **No SSE/WebSocket/polling** — use `router.refresh()` after mutations (server-side, free)
14. **Provider abstraction** — infrastructure calls go through interfaces, not direct SDK calls

---

*Version 9.0 — Restructured from v8.0. Phase 6.1 split into 6.6/6.7/6.8. SSE dropped. Tool/Service refactor added as Phase 7.7. Cost tracking consolidated. Batch API and context compaction deferred. Effort+Impact ratings added. — 2026-02-16*
