# SoloEnterprise: Project Phases

**Last Updated:** 2026-02-24
**Current Phase:** Phase 6.9 (Code Scaffolder + Local Validation) — Next
**Branch:** `development`

---

## Timeline Overview

| Phase | Status | Effort | Impact | Duration |
|-------|--------|--------|--------|----------|
| 0–4. Foundation + Agents | ✅ COMPLETE | — | — | — |
| 5–5.7 Orchestrator + Validation + Architect + Image Extractor | ✅ COMPLETE | — | — | — |
| 6. Project Scoper Agent | ✅ COMPLETE | — | — | — |
| 6.5 Client Reporter Agent | ✅ COMPLETE | — | — | — |
| 6.6 Dashboard Navigation Overhaul | ✅ COMPLETE | — | — | — |
| 6.7 Projects Management UI | ✅ COMPLETE | — | — | — |
| 6.8 Scope Review UI | ✅ COMPLETE | — | — | — |
| **6.9 Code Scaffolder + Local Validation** | **🔵 NEXT** | **L** | **High** | **5-7 days** |
| 6.10 Sandbox Test Execution Pipeline | ⬜ NOT STARTED | M | High | 3-5 days |
| 7. DevOps Agent + Principal Reviewer | ⬜ NOT STARTED | L | Critical | 1-2 weeks |
| 7.5 QA Production Readiness | ⬜ NOT STARTED | L | High | 1 week |
| 7.7 Tool/Service Separation Refactor | ⬜ NOT STARTED | M | High | 3-5 days |
| 8. Multi-Agent Integration | ⬜ NOT STARTED | XL | Critical | 2-3 weeks |
| 8.5 Model Routing & Cost Optimization | ⬜ NOT STARTED | M | High | 3-5 days |
| 9. Documentation | ⬜ NOT STARTED | S | Medium | 3 days |
| 9.5 Institutional Memory & Knowledge Persistence | ⬜ NOT STARTED | L | High | 1-2 weeks |
| 10+ Business Automation (PM, Design, GTM, Ops) | 🔮 FUTURE | — | — | TBD |

**Remaining Estimate:** 9-15 weeks (Phases 6.9–9.5)

---

## Agents Status

| Agent | SKILL Files | Implementation | Status |
|-------|-------------|----------------|--------|
| Backend | ✅ Layered | ✅ `backend-agent.ts` | **WORKING** |
| Frontend | ✅ Layered | ✅ `frontend-agent.ts` | **WORKING** |
| QA | ✅ Layered | ✅ `qa-agent.ts` | **WORKING** |
| Orchestrator | ✅ Layered | ✅ `orchestrator-agent.ts` | **WORKING** |
| Project Scoper | ✅ Layered | ✅ `project-scoper-agent.ts` | **COMPLETE** |
| Client Reporter | ✅ Layered | ✅ `client-reporter-agent.ts` | **COMPLETE** |
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

## Phase 6.5: Client Reporter Agent ✅ COMPLETE

**Effort:** M | **Impact:** High
**Status:** COMPLETE — merged to `development` (2026-02-16)
**Branch:** `phase6/report-agent`
**Model:** Claude Sonnet (structured output generation)

### Delivered

- ✅ `client-reporter-agent.ts` — generates weekly/milestone/summary reports from project data
- ✅ Token-to-USD pricing (`token-pricing.ts`) — model-aware, cache savings tracking (Sonnet/Opus/Haiku)
- ✅ Report parser (`report-parser.ts`) — extracts XML-tagged report content and internal notes
- ✅ Project context loader (`project-context-loader.ts`) — builds business context from DB for reports
- ✅ Cost tracking service (`cost-tracking-service.ts`) — records per-call API costs, wired into all 6 agents
- ✅ `estimateBillableHours()` — heuristic mapping token counts to consulting hours
- ✅ API: `POST /api/reports` — queue report generation (returns 202 with jobId)
- ✅ API: `GET /api/reports/{projectId}` — list reports with type/status/limit filters
- ✅ API: `GET /api/reports/{projectId}/latest` — most recent report with optional type filter
- ✅ 44 new tests across 5 test files (412 total, all passing)
- ✅ Vitest upgraded 1.6.1 → 4.0.18 (fixed CJS deprecation warning)
- ✅ Root `vitest.config.ts` for API route tests with `@/` path alias

### Test Files

| File | Tests |
|------|-------|
| `packages/core/src/agents/utils/__tests__/token-pricing.test.ts` | 11 |
| `packages/core/src/agents/utils/__tests__/report-parser.test.ts` | 6 |
| `packages/core/src/services/__tests__/cost-tracking-service.test.ts` | 6 |
| `packages/core/src/agents/utils/__tests__/project-context-loader.test.ts` | 7 |
| `src/app/api/reports/__tests__/reports-api.test.ts` | 14 |

### What's NOT in This Phase

- ~~Batch API~~ — Deferred to Phase 8+
- ~~PDF generation~~ — Markdown sufficient for MVP
- ~~Automated scheduling~~ — Reports manually triggered via API
- ~~Dashboard UI~~ — Phase 6.6/6.7 territory

---

## Phase 6.6: Dashboard Navigation Overhaul ✅ COMPLETE

**Effort:** S | **Impact:** Medium
**Status:** COMPLETE — merged via PRs #15, #26, #27 (2026-02-18)
**Branch:** `phase-6.6/navigation-overhaul`

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

## Phase 6.7: Projects Management UI ✅ COMPLETE

**Effort:** M | **Impact:** High
**Status:** COMPLETE — delivered alongside Phase 6.6 (2026-02-18)
**Branch:** `phase-6.6/navigation-overhaul` (bundled)

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

## Phase 6.8: Scope Review UI ✅ COMPLETE

**Effort:** S | **Impact:** Medium
**Status:** COMPLETE — delivered alongside Phase 6.6 (2026-02-18)
**Branch:** `phase-6.6/navigation-overhaul` (bundled)

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

## Phase 6.6-6.8: Dashboard + Projects + Scope Review ✅ COMPLETE

**Status:** COMPLETE — merged via PRs #15, #26, #27 (2026-02-18)

### Delivered

- ✅ Sidebar navigation replacing top header (shadcn/ui + lucide-react)
- ✅ Company → Projects hierarchy with full CRUD
- ✅ Structured brief intake form (7+ guided fields)
- ✅ Project detail with activity panel and worker status
- ✅ Scope review page with approve/reject actions
- ✅ Metrics dashboard
- ✅ Cross-company projects hub
- ✅ Cancel agent / cancel all tasks per project

### What Changed from Original Plan

- Company layer added (projects grouped under clients — architecturally better than flat table)
- Delete replaced with cancel operations
- Brief form is structured (not just textarea)

---

## Phase 6.9: Code Scaffolder + Local Validation Pipeline

**Effort:** L | **Impact:** High
**Duration:** 5-7 days
**Status:** NOT STARTED
**Branch:** `phase-6.9/code-scaffolder`
**Prerequisite:** Phases 6.6-6.8 complete

### Scope

Two-stage code generation pipeline: scaffold locally (free) → Claude fills business logic (API cost) → validate locally (free). Reduces output tokens by 40-60% and prevents most retry-causing failures.

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Import Resolver | `packages/core/src/scaffolder/import-resolver.ts` | Prevents hallucinated imports |
| Zod from Drizzle | `packages/core/src/scaffolder/zod-from-drizzle.ts` | Auto-generate validation schemas |
| Type Generator | `packages/core/src/scaffolder/type-generator.ts` | Request/response TypeScript interfaces |
| Backend Route Scaffold | `packages/core/src/scaffolder/backend-route.ts` | Hono route shell with TODOs |
| Test Shell (standard) | `packages/core/src/scaffolder/test-shell.ts` | Vitest test file from source code |
| Test Shell (TDD) | `packages/core/src/scaffolder/test-shell-tdd.ts` | Vitest test file from spec only (no source code) |
| Local Validator | `packages/core/src/scaffolder/local-validator.ts` | tsc + eslint + vitest validation gate |

### SKILL File Updates

- SKILL-backend-core.md, SKILL-frontend-core.md, SKILL-qa-core.md — add "Scaffold Mode" section

### Design Decision: TDD Mode

The test-shell-tdd scaffolder generates tests from spec alone (no source code). This enables Phase 8's TDD workflow where QA runs BEFORE implementation agents. Designing it now avoids retrofitting later.

### Checklist

- [ ] Import resolver scans project and produces ImportMap
- [ ] Zod schema generator reads Drizzle schema.ts
- [ ] Type generator produces TS interfaces from Zod
- [ ] Backend route scaffolder with Hono patterns
- [ ] Frontend page scaffolder with Next.js patterns
- [ ] Test shell scaffolder (standard mode — from source)
- [ ] Test shell scaffolder (TDD mode — from spec only)
- [ ] Local validator runs tsc + eslint
- [ ] Agent workers modified to two-stage pipeline
- [ ] SKILL files updated with Scaffold Mode section
- [ ] Baseline tests 1-5 pass
- [ ] Stress tests 6-10 pass

### What's NOT in This Phase

- Playwright / E2E testing (Phase 6.10)
- TDD workflow orchestrator wiring (Phase 8)
- DevOps PR pipeline (Phase 7)

---

## Phase 6.10: Sandbox Test Execution Pipeline

**Effort:** M | **Impact:** High
**Duration:** 3-5 days
**Status:** NOT STARTED
**Branch:** `phase-6.10/sandbox-test-runner`
**Prerequisite:** Phase 6.9 (scaffolder + local-validator must exist)

### Why This Phase Exists

SoloEnterprise validates structure (tsc, eslint) but not behavior. A file can pass type-checking and still crash at runtime. Phase 6.10 makes generated Vitest tests actually EXECUTE against generated implementation code inside sandboxes. Tests must pass before a task is marked complete.

This closes the gap: "you're validating structure but not behavior."

### What Changed from Original Spec

The original spec included Playwright (component testing + E2E). Both were cut:

- **Playwright component testing** (`@playwright/experimental-ct`) requires a Vite/Webpack bundler setup inside the sandbox to mount React components. Sandboxes are loose files with no bundler — you'd need to scaffold an entire Vite project per sandbox. Use `@testing-library/react` + `jsdom` via Vitest instead (zero browser binary, same pipeline).
- **Playwright E2E** requires a running server to navigate to. Sandbox code has no `package.json`, no `next dev`, no entry point. There's nothing to `page.goto()`.
- **Coverage** adds Istanbul/V8 instrumentation complexity with zero value when the test corpus is agent-generated and there's no baseline.

See **"Playwright Roadmap"** section below for when Playwright gets introduced.

### Architecture

#### Sandbox Test Runner

The core challenge: generated code in `generated/tasks/{task-id}/` doesn't have its own `node_modules`, `tsconfig`, or test runner config. It's just loose files.

Solution: A shared test harness that sandboxes reference via generated configs.

```
packages/core/src/test-runner/
├── index.ts                    # Public exports
├── sandbox-runner.ts           # Orchestrates test execution in sandbox
├── vitest-sandbox-config.ts    # Generates vitest.config for a sandbox
├── mock-harness.ts             # Stubs for @soloenterprise/*, next/*, external deps
├── import-resolver.ts          # Path alias setup for sandbox → monorepo resolution
└── result-parser.ts            # Parses vitest JSON output into structured results
```

#### Core Interface

```typescript
interface TestExecutionResult {
  passed: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  failures: TestFailure[];
  duration: number;  // milliseconds
}

interface TestFailure {
  testName: string;
  file: string;
  error: string;
  expected?: string;
  received?: string;
}

export async function executeTestsInSandbox(
  sandboxPath: string,
  options: {
    timeout?: number;       // Default: 30000ms
    testFiles?: string[];   // Specific test files, or all *.test.ts
  }
): Promise<TestExecutionResult>;
```

#### How Sandbox Execution Works

1. **Config generation** — Creates a temporary `vitest.config.ts` pointing at the sandbox directory, with path aliases resolving `@soloenterprise/*` and `@/*` back to the monorepo or mock stubs
2. **Mock harness injection** — Provides mock modules for runtime dependencies that can't resolve in a sandbox (database, Redis, external APIs, Next.js internals)
3. **Subprocess execution** — Runs `vitest run --reporter=json` in a child process with the generated config, enforcing timeout
4. **Output parsing** — Parses Vitest JSON reporter output into structured `TestExecutionResult`
5. **Cleanup** — Removes temporary config files

#### Import Resolution (The Hard Part)

Generated sandbox files reference imports that don't exist in the sandbox:

```typescript
// These all need to resolve when vitest runs inside the sandbox:
import { db } from "@soloenterprise/db";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { eq } from "drizzle-orm";
```

**Resolution strategy:**

| Import Pattern | Resolution |
|---------------|------------|
| `@soloenterprise/db` | Mock harness — stub with mock db client |
| `@soloenterprise/db/schema` | Real — alias to `packages/db/src/schema.ts` (types only) |
| `@soloenterprise/core/*` | Mock harness — stub services |
| `@/*` (Next.js app imports) | Mock harness — stubs for components/hooks |
| `next/navigation` | Mock harness — `useRouter`, `redirect`, etc. |
| `next/image` | Mock harness — passthrough div |
| `drizzle-orm` | Real — alias to `node_modules/drizzle-orm` |
| External packages (zod, etc.) | Real — alias to monorepo `node_modules` |

The `import-resolver.ts` generates a `resolve.alias` map for the Vitest config based on scanning the sandbox files for import statements.

#### Mock Harness

```typescript
// packages/core/src/test-runner/mock-harness.ts

// Pre-built mock modules that the generated vitest config aliases to.
// Each mock provides the minimum surface area to not crash at import time.

export const mockDb = {
  query: new Proxy({}, { get: () => ({ findMany: async () => [], findFirst: async () => null }) }),
  select: () => ({ from: () => ({ where: () => ({ limit: () => ({ then: (r: Function) => r([]) }) }) }) }),
  insert: () => ({ values: () => ({ returning: async () => [{ id: 1 }] }) }),
  update: () => ({ set: () => ({ where: async () => ({ rowCount: 1 }) }) }),
  delete: () => ({ where: async () => ({ rowCount: 1 }) }),
};

export const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
};

// ... etc for each mock module
```

Tests that need real DB behavior should mock at the test level (the QA agent already generates `vi.mock()` calls). The harness just prevents import-time crashes.

### Worker Pipeline Update

```
BEFORE 6.10 (Phase 6.9):
  Scaffold → Claude API → Validate (tsc/lint) → Done

AFTER 6.10:
  Scaffold → Claude API → Validate (tsc/lint) → Execute Tests → Done
                                                      ↓ (if fails)
                                                 Retry with errors → Execute Tests → Done or Escalate
```

Test execution is task-type-aware:

| Task Type | Test Runner | Action |
|-----------|-------------|--------|
| Backend route | Vitest (unit + integration) | Run all `*.test.ts` in sandbox |
| Frontend component | Vitest + jsdom + RTL | Run all `*.test.ts` with jsdom env |
| Full feature | Vitest (both) | Run all tests |
| Bug fix | Vitest (affected files) | Run only test files matching modified sources |
| Scoper/Reporter | Skip | No executable tests — business document output |

### QA SKILL File Updates

Update `skills/qa/SKILL-qa-patterns.md`:
- Add "Sandbox-Executable Tests" section — constraints for tests that will actually run
- Import rules: only import from `@soloenterprise/db/schema` (types), mock everything else
- Must include `vi.mock()` for any service/db dependency
- Test file naming: `{source-file}.test.ts` (co-located)

Update `skills/qa/SKILL-qa-core.md`:
- Add note: "All generated tests MUST be executable in sandbox isolation"
- List available mock stubs the test harness provides

### Dependencies to Install

```bash
pnpm add -D @testing-library/react @testing-library/jest-dom jsdom
```

These are lightweight dev dependencies. No Chromium binary, no browser download.

> **Note:** `vitest` and `@testing-library/react` are already available or trivially added. The mock harness is pure TypeScript — no external runtime dependencies.

### Checklist

- [ ] Sandbox runner executes Vitest in sandbox subprocess
- [ ] Vitest config generator creates valid config with path aliases per sandbox
- [ ] Import resolver scans sandbox files and generates alias map
- [ ] Mock harness provides stubs for `@soloenterprise/db`, `@soloenterprise/core`, `next/*`
- [ ] Result parser handles Vitest JSON reporter output
- [ ] Worker pipeline extended with test execution stage (after tsc/lint)
- [ ] Retry-with-errors: test failures fed back to Claude for fix attempt
- [ ] Timeout handling: hanging tests killed and reported as failure
- [ ] QA SKILL files updated with sandbox-executable test constraints
- [ ] Baseline tests 1-5 pass
- [ ] Stress tests 6-10 pass

### Test Plan

**Baseline Tests (1-5)**

1. **Vitest sandbox execution** — given sandbox with valid test + implementation, tests pass, returns `{ passed: true }`
2. **Vitest failure reporting** — given sandbox with failing test, returns structured `TestFailure[]` with test name, file, error, expected/received
3. **Frontend component test** — given React component + RTL test (jsdom env), Vitest runs and passes
4. **Config generation** — generates valid `vitest.config.ts` with correct path aliases for a sandbox containing `@soloenterprise/*` and `@/*` imports
5. **Timeout handling** — test with infinite loop is killed after timeout, reported as failure (not hang)

**Stress Tests (6-10)**

6. **Real agent output** — take actual backend-agent output from Phase 5.5, run generated tests against it
7. **Frontend component** — take actual frontend-agent output, run RTL component test via Vitest+jsdom
8. **Concurrent sandboxes** — two test runners in different sandboxes simultaneously, no interference (separate configs, separate processes)
9. **Missing dependency** — sandbox imports module that doesn't exist and isn't mocked, error message is clear and actionable (not cryptic Vitest internals)
10. **Full pipeline** — scaffold → Claude → validate (tsc/lint) → execute tests → all pass (end-to-end)

### What's NOT in This Phase

- **Playwright** (any form) — see Playwright Roadmap below
- **Coverage reporting** — no baseline metrics exist, premature
- **TDD workflow wiring** — Phase 8
- **Adversarial code review** — Phase 7 (Reviewer agent)
- **CI/CD pipeline integration** — Phase 7 (DevOps)

---

## Playwright Roadmap: When and Where

Playwright is NOT in Phase 6.10. Here's exactly when each Playwright capability gets introduced and why.

### Phase 7: Playwright in CI (DevOps Agent)

**What:** Playwright installed in generated client projects as part of the CI/CD pipeline scaffold.

**Why now:** Phase 7 creates deployable greenfield projects with GitHub Actions. Playwright runs in CI against the deployed preview URL — this is the correct use of E2E testing. The DevOps agent scaffolds the `playwright.config.ts`, installs Chromium in CI, and wires `npx playwright test` into the GitHub Actions workflow.

**Scope:**
- Playwright config scaffolded into client project repos (not SoloEnterprise itself)
- Chromium installed in CI only (not local dev)
- E2E tests run against preview deployment URLs created by the DevOps agent
- QA agent generates Playwright E2E tests as part of client project test suites

**QA SKILL updates at this point:**
- `SKILL-qa-patterns.md` — Playwright E2E patterns (page object model, fixtures, waiting strategies)
- `SKILL-qa-examples.md` — Full Playwright E2E example (login flow, form submission, navigation)

### Phase 7.5: Playwright for Production QA

**What:** Visual regression testing, accessibility testing, and Lighthouse integration — all via Playwright.

**Why now:** Phase 7.5 requires preview deployment URLs (from Phase 7) to run Lighthouse and visual regression. This is the first time there's an actual deployed URL to test against.

**Scope:**
- `@playwright/test` screenshot comparison for visual regression
- `@axe-core/playwright` for WCAG 2.1 AA accessibility checks
- Lighthouse CI against preview URLs
- Production readiness gate (all tests must pass before handover)

### Phase 8: Playwright in Multi-Agent Verification

**What:** Orchestrator's verification gate can optionally run Playwright E2E tests as a final check after all agents complete their tasks.

**Why now:** Only after multi-agent integration produces complete, deployable applications does end-to-end browser testing become meaningful. Individual task sandboxes produce fragments — only the assembled project has navigable pages.

### Summary Table

| Phase | Playwright Capability | Prerequisite |
|-------|----------------------|--------------|
| 6.10 | **None** — Vitest only | Phase 6.9 scaffolder |
| 7 | E2E tests in CI for client projects | Preview deployments |
| 7.5 | Visual regression + accessibility + Lighthouse | Preview URLs from Phase 7 |
| 8 | Orchestrator verification gate (optional E2E) | Complete assembled projects |

**The rule is simple: Playwright needs a running application to test. Until Phase 7 creates deployed preview URLs, there's nothing for Playwright to navigate.**

---

## Phase 7: DevOps Agent + Principal Reviewer

**Effort:** L | **Impact:** Critical
**Duration:** 1-2 weeks
**Status:** NOT STARTED
**Branch:** `phase-7/devops-agent`
**Prerequisite:** Phase 6.10 complete
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

*Version 10.1 — Rewrote Phase 6.10: stripped Playwright (deferred to Phase 7+), scoped to Vitest sandbox execution only. Added Playwright Roadmap section. — 2026-02-25*
