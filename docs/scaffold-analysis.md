# SoloEnterprise: Pre-Build Scaffold Analysis

**Premise:** Every token Claude *writes* (output) costs 5x what it costs to *read* (input). Moving boilerplate from output → input = 80% savings on those tokens. The goal: build locally what doesn't require intelligence, send to Claude only what does.

**Pricing Reference (Sonnet 4.5):** Input $3/MTok | Output $15/MTok | Cached Input $0.30/MTok

---

## Backend Agent Scaffolds

| # | What to Pre-Build | Description | Est. Output Tokens Saved | Saving per Task (Sonnet) | Build Difficulty |
|---|-------------------|-------------|--------------------------|--------------------------|------------------|
| 1 | **Hono Route Shell** | Generate the full route file structure: imports (`import { Hono } from 'hono'`), app instance, route method stubs (GET/POST/PUT/DELETE) with handler signatures, export. Derived from task description keywords ("create endpoint", "CRUD"). | 200-350 | $0.003-0.005 | Easy |
| 2 | **Zod Validation Schemas** | Auto-generate Zod schemas directly from Drizzle schema.ts. Each table's columns → Zod object with correct types (text→z.string(), integer→z.number(), uuid→z.string().uuid()). Includes `.optional()` for nullable columns. Insert schema, update schema (all partial), query params schema. | 300-500 | $0.005-0.008 | Medium |
| 3 | **Drizzle Query Stubs** | Generate typed query functions from schema: `findById()`, `findMany()` with pagination, `create()`, `update()`, `deleteById()`. Correct table imports, `eq()`/`and()`/`or()` patterns, proper `returning()` clauses. Claude just fills in business logic filters. | 250-400 | $0.004-0.006 | Medium |
| 4 | **Service Layer Boilerplate** | Generate service file with function signatures derived from route stubs. Standard error handling wrapper (`try/catch` with typed errors), logging calls, input/output type annotations. The "plumbing" between routes and DB. | 200-300 | $0.003-0.005 | Easy |
| 5 | **TypeScript Request/Response Types** | Auto-generate interfaces for API request bodies and response shapes from Zod schemas. `CreateUserInput`, `UserResponse`, `PaginatedResponse<User>`. Reusable across route + service + test. | 150-250 | $0.002-0.004 | Easy |
| 6 | **Error Response Helpers** | Pre-build standardized error factories: `notFound()`, `badRequest()`, `unauthorized()`, `serverError()`. Same on every project — never needs Claude. | 100-150 | $0.002 | Trivial |
| 7 | **Middleware Wiring** | Auth middleware, rate limiter, CORS, request logging — all boilerplate per your SKILL patterns. Derive from task requirements ("authenticated endpoint" → inject auth middleware). | 150-200 | $0.002-0.003 | Easy |

**Backend subtotal: ~1,350-2,150 output tokens saved per task → $0.020-0.033 saved per task**

---

## Frontend Agent Scaffolds

| # | What to Pre-Build | Description | Est. Output Tokens Saved | Saving per Task (Sonnet) | Build Difficulty |
|---|-------------------|-------------|--------------------------|--------------------------|------------------|
| 8 | **Next.js Page Shell** | Generate page.tsx with correct App Router structure: metadata export, Server Component default (or `"use client"` if task says "interactive"/"form"/"state"). Correct import paths for the project. | 150-250 | $0.002-0.004 | Easy |
| 9 | **shadcn/ui Import Map** | Pre-resolve which shadcn components exist in the project and their exact import paths. Eliminates Claude hallucinating imports. Pass as context: "Available components: Button (@/components/ui/button), Input, Form, Dialog, Card..." | 100-200 (as avoided re-gen) | $0.002-0.003 | Trivial |
| 10 | **Form Boilerplate** | Generate form component shell with react-hook-form setup, Zod resolver, onSubmit handler signature, field shells for each required input. Derived from Zod schemas (which you already generated in #2). | 300-450 | $0.005-0.007 | Medium |
| 11 | **API Fetch Hook** | Generate custom hook with loading/error/data state, fetch call to the endpoint being built, proper TypeScript generics. Pattern is identical every time — only the URL and types change. | 200-300 | $0.003-0.005 | Easy |
| 12 | **Layout/Grid Structure** | Basic page layout shell with Tailwind responsive grid. Standard patterns: sidebar+content, header+main+footer, dashboard grid. Keyword-derived from task description. | 100-200 | $0.002-0.003 | Easy |
| 13 | **Loading/Error States** | Pre-build Suspense boundaries, error.tsx, loading.tsx skeletons. Same on every page — shadcn Skeleton component with layout matching the page shell. | 100-150 | $0.002 | Trivial |

**Frontend subtotal: ~950-1,550 output tokens saved per task → $0.014-0.023 saved per task**

---

## QA Agent Scaffolds

| # | What to Pre-Build | Description | Est. Output Tokens Saved | Saving per Task (Sonnet) | Build Difficulty |
|---|-------------------|-------------|--------------------------|--------------------------|------------------|
| 14 | **Test File Structure** | Generate complete test shell: Vitest imports, `describe()` block named after the source file, `beforeEach`/`afterEach` with DB cleanup for integration tests, empty `it()` blocks named from function signatures. | 200-350 | $0.003-0.005 | Easy |
| 15 | **Mock Setup** | Auto-generate `vi.mock()` calls for known dependencies (db, external services, auth). Derived from the source file's import statements — parse them, generate corresponding mocks. | 150-250 | $0.002-0.004 | Medium |
| 16 | **React Testing Library Boilerplate** | For component tests: import render/screen/fireEvent, generate `render(<Component {...defaultProps} />)` with default props derived from component's TypeScript interface. | 150-250 | $0.002-0.004 | Medium |
| 17 | **API Test Patterns** | Generate `app.request()` call stubs for each HTTP method the route handles. Include headers, content-type, empty body shapes matching the Zod schema. Claude fills in the assertions. | 200-300 | $0.003-0.005 | Easy |
| 18 | **Assertion Templates** | Pre-build common assertion patterns: status code checks, response body shape validation, database state verification queries. Repetitive boilerplate that never varies. | 100-200 | $0.002-0.003 | Trivial |

**QA subtotal: ~800-1,350 output tokens saved per task → $0.012-0.020 saved per task**

---

## Project Scoper Scaffolds

| # | What to Pre-Build | Description | Est. Output Tokens Saved | Saving per Task (Opus) | Build Difficulty |
|---|-------------------|-------------|--------------------------|------------------------|------------------|
| 19 | **YAML Scope Skeleton** | Pre-build the entire YAML structure with all required fields: project_scope, requirements (empty array), gaps, estimates, milestones, out_of_scope, agents_required. Scoper fills in values instead of generating structure. | 300-500 | $0.008-0.013 | Easy |
| 20 | **Client Document Template** | Markdown template with standard sections: Executive Summary, Requirements, Timeline, Risks, Next Steps. Same structure every time. Scoper fills in content, doesn't create format. | 200-350 | $0.005-0.009 | Easy |
| 21 | **Risk Assessment Checklist** | Pre-built checklist of common risks (third-party integrations, auth complexity, data migration, performance, regulatory). Scoper checks/unchecks and adds specifics instead of inventing categories. | 150-250 | $0.004-0.006 | Trivial |

**Scoper subtotal: ~650-1,100 output tokens saved per task → $0.016-0.028 saved per task**

---

## Client Reporter Scaffolds

| # | What to Pre-Build | Description | Est. Output Tokens Saved | Saving per Task (Sonnet) | Build Difficulty |
|---|-------------------|-------------|--------------------------|--------------------------|------------------|
| 22 | **Weekly Report Template** | Markdown template pre-filled with actual data from DB: task counts, completion percentages, milestone progress bars. Reporter just writes the narrative sections. | 400-600 | $0.006-0.009 | Medium |
| 23 | **Internal Notes Template** | Pre-populate with real numbers from cost-tracking-service: token costs, agent success rates, retry counts. Reporter adds analysis/recommendations, doesn't generate the data. | 200-350 | $0.003-0.005 | Easy |
| 24 | **Action Items Format** | Standard action item structure pre-built. Reporter fills in specific items vs generating the whole markdown table format. | 100-150 | $0.002 | Trivial |

**Reporter subtotal: ~700-1,100 output tokens saved per task → $0.011-0.017 saved per task**

---

## Orchestrator Scaffolds

| # | What to Pre-Build | Description | Est. Output Tokens Saved | Saving per Task (Opus) | Build Difficulty |
|---|-------------------|-------------|--------------------------|------------------------|------------------|
| 25 | **Task YAML Skeleton** | Pre-build the task array structure with all required fields. Orchestrator fills in names, descriptions, dependencies — doesn't generate YAML boilerplate. | 200-400 | $0.005-0.010 | Easy |
| 26 | **Dependency Graph Template** | Pre-compute which task types commonly depend on which (backend before frontend, both before QA). Provide as default graph for orchestrator to modify rather than create from scratch. | 150-250 | $0.004-0.006 | Easy |
| 27 | **Agent Availability Context** | Pre-build current agent status block (which agents are active, which are planned, queue depths, active locks). Currently part of SKILL but could be dynamic and real-time. | 100-200 | $0.003-0.005 | Trivial |

**Orchestrator subtotal: ~450-850 output tokens saved per task → $0.011-0.021 saved per task**

---

## Cross-Cutting Scaffolds (All Agents)

| # | What to Pre-Build | Description | Est. Output Tokens Saved | Saving per Task | Build Difficulty |
|---|-------------------|-------------|--------------------------|-----------------|------------------|
| 28 | **Import Resolver** | Scan project for available exports. Pass as context: "Available imports: { db } from '@/db', { users, tasks } from '@/db/schema', { eq, and } from 'drizzle-orm'..." Eliminates hallucinated imports — the #1 source of syntax errors. | 100-200 (prevents retries) | $0.050+ (1 avoided retry) | Medium |
| 29 | **Project File Tree** | Auto-generate current file tree of the project sandbox. Agent knows exactly what exists vs what needs creating. Prevents duplicate files, wrong paths. | 50-100 | $0.001-0.002 | Trivial |
| 30 | **Previous Task Outputs Summary** | For tasks with dependencies: auto-summarize what the dependency task produced (file paths, exported functions, types). Currently agents get full context — a summary is cheaper. | 200-500 | $0.003-0.008 | Medium |

---

## Summary by Agent

| Agent | Output Tokens Saved/Task | Dollar Saving/Task | Tasks/Month (est.) | Monthly Saving |
|-------|--------------------------|--------------------|--------------------|----------------|
| Backend | 1,350-2,150 | $0.020-0.033 | 200-400 | **$4.00-13.20** |
| Frontend | 950-1,550 | $0.014-0.023 | 150-300 | **$2.10-6.90** |
| QA | 800-1,350 | $0.012-0.020 | 150-300 | **$1.80-6.00** |
| Scoper (Opus) | 650-1,100 | $0.016-0.028 | 20-50 | **$0.32-1.40** |
| Reporter (Sonnet) | 700-1,100 | $0.011-0.017 | 40-80 | **$0.44-1.36** |
| Orchestrator (Opus) | 450-850 | $0.011-0.021 | 50-100 | **$0.55-2.10** |
| Cross-cutting | 350-800 | $0.054-0.060 | All tasks | **$5.00-15.00** |

**Total estimated monthly saving: $14-46/month on scaffold alone**

---

## The Real Savings: Avoided Retries

The table above only counts direct token savings. The BIGGER number is **avoided retries**:

| Problem | Current Retry Rate | Cost per Retry (Sonnet) | Scaffold Fix |
|---------|-------------------|------------------------|--------------|
| Wrong imports | ~15-20% of tasks | $0.05-0.09 (full re-run) | #28 Import Resolver eliminates this |
| Wrong file paths | ~5-10% of tasks | $0.05-0.09 | #29 File Tree context |
| Type mismatches | ~10-15% of tasks | $0.05-0.09 | #2 Zod + #5 Types pre-generated |
| Test boilerplate wrong | ~10% of QA tasks | $0.05-0.09 | #14-18 QA scaffolds |

If 20% of tasks currently need 1 retry = 120-240 retries/month × $0.07 avg = **$8.40-16.80/month in retry waste**.

**Combined savings: $22-63/month** — and this grows linearly with project volume.

---

## Build Priority (Effort vs Impact)

| Priority | Items | Build Effort | Impact |
|----------|-------|-------------|--------|
| **P0 — Do first** | #28 Import Resolver, #2 Zod from Drizzle, #5 Types | 2-3 days | Prevents most retries |
| **P1 — High value** | #1 Route Shell, #14 Test Structure, #22 Report Template | 2-3 days | Biggest token savings |
| **P2 — Medium value** | #3 Drizzle Stubs, #10 Form Boilerplate, #15 Mock Setup | 3-5 days | Good savings, more complex |
| **P3 — Nice to have** | #6 Error Helpers, #13 Loading States, #21 Risk Checklist | 1-2 days | Small but trivial to build |
| **P4 — Later** | #30 Task Summary, #26 Dependency Graph, #12 Layout | 3-5 days | Useful at higher scale |

**Recommended first sprint: P0 + P1 = ~4-6 days of work, captures 60-70% of total savings.**

---

## Architecture Note

All scaffolds live in `packages/core/src/scaffolder/`. Each is a pure TypeScript function — no AI, no API calls:

```typescript
// packages/core/src/scaffolder/index.ts
export { scaffoldBackendRoute } from './backend-route';
export { scaffoldZodSchemas } from './zod-from-drizzle';
export { scaffoldTestFile } from './test-shell';
export { scaffoldTypes } from './type-generator';
export { resolveImports } from './import-resolver';
// ...etc

// Called in the worker BEFORE the Claude API call:
const scaffold = await scaffoldBackendRoute(task, schema);
const prompt = `Here is a working skeleton. Fill in the business logic:\n${scaffold}\n\nRequirements: ${task.description}`;
```
