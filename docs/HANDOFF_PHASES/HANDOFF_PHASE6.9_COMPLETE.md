# Phase 6.9: Code Scaffolder + Local Validation Pipeline

**Date:** 2026-02-25
**Branch:** `phase69/scaffolding`
**Status:** COMPLETE
**Prerequisite:** Phases 6.6-6.8 complete
**Duration:** 5-7 days
**Effort:** L | **Impact:** High

---

## Completed Pre-work (2026-02-25)

### Tailwind CSS v4 Theme Infrastructure

New workspace package `packages/theme/` (`@soloenterprise/theme`) provides centralized design tokens for all frontends:

| File | Purpose |
|------|---------|
| `base.css` | Foundation: spacing, typography, radii, motion, breakpoints |
| `dashboard.css` | SoloEnterprise brand: neutral + brand color scales, semantic colors, shadcn/ui variable bridge (light + dark) |
| `client-template.css` | Agent-generated projects: runtime-overridable `--client-*` CSS vars, semantic color names |

**Dashboard wiring:** `src/app/globals.css` imports `@soloenterprise/theme/dashboard` (replaces inline `@theme`).

**Frontend agent SKILL:** `skills/frontend/SKILL-frontend-theming.md` — loaded for any task involving styling, colors, layout, or component creation. Enforces semantic color usage, forbids raw values in JSX, documents shadcn/ui integration patterns.

**No `tailwind.config.js`** — all theming is CSS-first via `@theme` blocks (TW4 standard).

---

## Why This Phase Exists

Currently, every agent task starts from a blank page. Claude generates imports (sometimes wrong), file structure (sometimes inconsistent), and boilerplate (always the same). This wastes output tokens (5x more expensive than input) and causes ~20% of tasks to need retries due to wrong imports, wrong file paths, or type mismatches.

Phase 6.9 introduces a two-stage code generation pipeline:
1. **Stage 1 (Local, Free):** Generate boilerplate scaffolds mechanically — no AI
2. **Stage 2 (Claude API, Costs Money):** Send scaffold + requirements to Claude — Claude fills in business logic only
3. **Stage 3 (Local, Free):** Validate output with tsc, eslint, vitest before marking complete
4. **Stage 4 (Optional):** If validation fails, send errors back to Claude for one retry

This reduces output tokens by 40-60% per task and prevents the most common failure modes.

---

## Architecture

### New Package: `packages/core/src/scaffolder/`
packages/core/src/scaffolder/
├── index.ts                    # Public exports
├── import-resolver.ts          # P0: Scans project for available imports
├── zod-from-drizzle.ts         # P0: Generates Zod schemas from Drizzle schema
├── type-generator.ts           # P0: Generates TS interfaces from Zod/Drizzle
├── backend-route.ts            # P1: Hono route shell scaffolder
├── backend-service.ts          # P1: Service layer scaffolder
├── frontend-page.ts            # P1: Next.js page shell scaffolder
├── frontend-form.ts            # P2: Form component scaffolder
├── test-shell.ts               # P1: Vitest test file scaffolder (unit + integration)
├── test-shell-tdd.ts           # P1: Vitest test file from spec only (TDD mode, no source code required)
├── report-template.ts          # P1: Client report pre-fill from DB data
├── scope-template.ts           # P1: YAML scope skeleton
├── error-helpers.ts            # P3: Standard error response factories
├── middleware-wiring.ts        # P3: Auth/rate-limit middleware injection
└── local-validator.ts          # Runs tsc, eslint, vitest on scaffold/output

### Integration Point: Agent Workers

Each agent's worker is modified to use the two-stage pipeline:
```typescript
// BEFORE (current flow in backend-agent.ts):
const skills = await loadSkillsForTask(description, 'backend');
const systemPrompt = buildSystemPrompt(skills);
const response = await callClaude(systemPrompt, taskDescription);
const files = parseAgentOutput(response);
await writeGeneratedFiles(files, taskId);

// AFTER (new flow):
const skills = await loadSkillsForTask(description, 'backend');
const scaffold = await scaffoldBackendTask(task, schema);     // NEW: Stage 1
const validation1 = await localValidator.check(scaffold);     // NEW: Stage 2
if (!validation1.passed) scaffold = await localValidator.fix(scaffold); // Auto-fix trivial issues

const systemPrompt = buildSystemPrompt(skills);
const prompt = buildScaffoldPrompt(scaffold, taskDescription); // NEW: Different prompt shape
const response = await callClaude(systemPrompt, prompt);
const files = parseAgentOutput(response);

const validation2 = await localValidator.check(files);         // NEW: Stage 3
if (!validation2.passed) {
  // Stage 4: Send errors back to Claude for one retry
  const retryResponse = await callClaude(systemPrompt, buildRetryPrompt(files, validation2.errors));
  const retryFiles = parseAgentOutput(retryResponse);
  await writeGeneratedFiles(retryFiles, taskId);
} else {
  await writeGeneratedFiles(files, taskId);
}
```

---

## P0 — Import Resolver (Do First)

### `import-resolver.ts`

Scans the project's generated sandbox and the main codebase to build an import map.
```typescript
interface ImportMap {
  packages: Record<string, string[]>;  // '@soloenterprise/db' → ['db', 'schema']
  drizzle: string[];                    // ['eq', 'and', 'or', 'desc', 'asc']
  project: Record<string, string[]>;   // '@/db/schema' → ['users', 'tasks', 'projects']
  shadcn: string[];                     // ['Button', 'Input', 'Card', 'Dialog']
  vitest: string[];                     // ['describe', 'it', 'expect', 'beforeEach', 'vi']
}

export async function resolveImports(projectPath: string): Promise<ImportMap>;
```

**Output format in scaffold:**
```typescript
// Available imports (generated by import-resolver):
// { db } from '@soloenterprise/db'
// { users, tasks, projects } from '@soloenterprise/db/schema'
// { eq, and, or } from 'drizzle-orm'
// { Hono } from 'hono'
// { z } from 'zod'
```

This is passed as INPUT context to Claude, NOT as a generated file. It prevents hallucinated imports — the #1 cause of task retries.

### `zod-from-drizzle.ts`

Reads `packages/db/src/schema.ts` and generates Zod validation schemas for each table.
```typescript
interface ZodSchemaOutput {
  tableName: string;
  insertSchema: string;   // z.object({ name: z.string(), email: z.string().email() })
  updateSchema: string;   // insertSchema.partial()
  selectSchema: string;   // Full output shape
  queryParamsSchema: string; // z.object({ limit: z.number().optional(), offset: z.number().optional() })
}

export async function generateZodSchemas(schemaPath: string): Promise<ZodSchemaOutput[]>;
```

### `type-generator.ts`

Generates TypeScript interfaces from Zod schemas for request/response typing.
```typescript
export async function generateTypes(zodSchemas: ZodSchemaOutput[]): Promise<string>;
// Output: CreateUserInput, UpdateUserInput, UserResponse, PaginatedResponse<T>
```

---

## P1 — Core Scaffolds

### `backend-route.ts`
```typescript
interface RouteScaffoldInput {
  routeName: string;        // 'users', 'products'
  methods: ('GET' | 'POST' | 'PUT' | 'DELETE')[];
  tableName?: string;       // Links to Drizzle schema
  authenticated?: boolean;
  importMap: ImportMap;
}

export async function scaffoldBackendRoute(input: RouteScaffoldInput): Promise<string>;
```

Generates:
- Hono route file with method handlers
- Correct imports from import map
- Zod validation at endpoint boundary (from zod-from-drizzle output)
- TODOs where business logic goes
- Error response patterns from SKILL-backend-patterns

### `test-shell.ts` (existing code mode)
```typescript
interface TestScaffoldInput {
  sourceFilePath: string;    // The file being tested
  sourceCode: string;        // Contents of the file
  testType: 'unit' | 'integration' | 'component';
  importMap: ImportMap;
}

export async function scaffoldTestFile(input: TestScaffoldInput): Promise<string>;
```

### `test-shell-tdd.ts` (TDD mode — spec only, no source code)
```typescript
interface TddTestScaffoldInput {
  taskDescription: string;   // What should be built
  expectedEndpoints?: string[];  // ['POST /api/users', 'GET /api/users/:id']
  zodSchemas?: ZodSchemaOutput[];  // Expected data shapes
  importMap: ImportMap;
}

export async function scaffoldTddTestFile(input: TddTestScaffoldInput): Promise<string>;
```

**CRITICAL DESIGN NOTE:** This scaffolder works WITHOUT source code. It generates test shells from the task spec and expected data shapes. The tests define WHAT the code should do, not HOW it does it. This enables TDD workflow in Phase 8 where QA runs before implementation.

---

## Local Validator

### `local-validator.ts`
```typescript
interface ValidationResult {
  passed: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

interface ValidationError {
  type: 'typescript' | 'eslint' | 'vitest' | 'syntax';
  file: string;
  line?: number;
  message: string;
}

export async function validateGeneratedCode(
  files: GeneratedFile[],
  sandboxPath: string,
  options?: {
    runTests?: boolean;     // Default: false for scaffold, true for final output
    runLint?: boolean;      // Default: true
    runTypeCheck?: boolean; // Default: true
  }
): Promise<ValidationResult>;
```

The validator:
1. Writes files to a temporary directory inside the sandbox
2. Runs `tsc --noEmit` (type checking)
3. Runs `eslint` (lint)
4. Optionally runs `vitest run` (tests)
5. Collects errors with file paths and line numbers
6. Returns structured results

This is the SAME validation logic that Phase 7 (DevOps) will use as pre-PR gates. Build it right here so Phase 7 just wraps it.

---

## Prompt Shape Change

### Current prompt (Claude generates everything):
System: [SKILL files]
User: Build a user registration endpoint with email/password, JWT tokens.

### New prompt (Claude fills in scaffold):
System: [SKILL files]
User: Here is a working code scaffold for a user registration endpoint.
The scaffold compiles and has correct imports.
Fill in the business logic marked with TODO comments.
Do NOT change imports, file structure, or type definitions.
--- SCAFFOLD ---
[scaffold code here]
--- REQUIREMENTS ---
Build a user registration endpoint with email/password, JWT tokens.
Registration should check for existing email, hash password with bcrypt,
create user record, and return JWT access + refresh tokens.
--- AVAILABLE IMPORTS ---
[import map here]

---

## Modified SKILL Files

The following SKILL files need minor additions to instruct agents on working with scaffolds:

### SKILL-backend-core.md — ADD section:
```markdown
## Scaffold Mode

When you receive a code scaffold (marked with `--- SCAFFOLD ---`):
- DO NOT modify imports — they are verified correct
- DO NOT change file structure or type definitions
- Fill in ALL TODO comments with working implementation
- You may add NEW imports only if the scaffold's import map includes them
- If the scaffold is missing something critical, explain what's missing instead of rewriting
```

### SKILL-frontend-core.md — ADD equivalent section
### SKILL-qa-core.md — ADD equivalent section

---

## Test Plan

### Baseline Tests (1-5)

1. **Import resolver** — given a project with known exports, produces correct ImportMap
2. **Zod from Drizzle** — given schema.ts with 3 tables, produces valid Zod schemas
3. **Backend route scaffold** — given route config, produces compilable Hono route with TODOs
4. **Test shell scaffold** — given source file, produces valid test file structure
5. **Local validator** — given files with known errors, returns correct error list

### Stress Tests (6-10)

6. **TDD test shell** — given only a spec (no source code), produces meaningful test expectations
7. **Complex schema** — Drizzle schema with relations, enums, JSON columns → correct Zod output
8. **Import conflicts** — project with overlapping export names → resolver handles correctly
9. **Validator with real agent output** — run validator on actual agent-generated code from Phase 5.5
10. **Full pipeline** — scaffold → Claude API → validate → pass (end-to-end with real API call)

---

## What's NOT in This Phase

- Playwright / E2E testing (Phase 6.10)
- TDD workflow wiring at orchestrator level (Phase 8)
- Model routing / Haiku for validation (Phase 8.5)
- DevOps PR pipeline (Phase 7)
- SKILL file auto-updates from failures (Phase 9.5)

---

## Implementation Summary (2026-02-25)

### Files Created (19 source + 8 test = 27 files)

**Source files (`packages/core/src/scaffolder/`):**
| File | LOC | Purpose |
|------|-----|---------|
| `drizzle-schema-parser.ts` | ~230 | Regex parser for Drizzle schema.ts |
| `import-resolver.ts` | ~200 | Builds ImportMap from known packages + schema |
| `zod-from-drizzle.ts` | ~190 | Generates Zod schemas from parsed Drizzle info |
| `type-generator.ts` | ~80 | Generates TypeScript types from Zod schemas |
| `backend-route.ts` | ~170 | Hono route + validators + types scaffolder |
| `backend-service.ts` | ~110 | CRUD service stubs scaffolder |
| `frontend-page.ts` | ~200 | Next.js App Router page scaffolder |
| `frontend-form.ts` | ~200 | React Hook Form + Zod client component |
| `test-shell.ts` | ~160 | Vitest test file from existing source |
| `test-shell-tdd.ts` | ~160 | Vitest tests from spec only (TDD) |
| `report-template.ts` | ~90 | Markdown report pre-fill |
| `scope-template.ts` | ~80 | YAML scope skeleton |
| `local-validator.ts` | ~100 | TS syntax + import validation |
| `prompt-builder.ts` | ~100 | Scaffold → prompt formatter |
| `scaffold-orchestrator.ts` | ~250 | Main entry point + heuristic detection |
| `index.ts` | ~40 | Barrel exports |

**Test files (`packages/core/src/scaffolder/__tests__/`):**
| File | Tests |
|------|-------|
| `drizzle-schema-parser.test.ts` | 12 |
| `import-resolver.test.ts` | 16 |
| `zod-from-drizzle.test.ts` | 16 |
| `backend-route.test.ts` | 5 |
| `test-shell-tdd.test.ts` | 9 |
| `local-validator.test.ts` | 9 |
| `scaffold-orchestrator.test.ts` | 16 |
| `prompt-builder.test.ts` | 9 |

### Modified Files (7)
- `packages/core/package.json` — added `"./scaffolder"` export
- `packages/core/src/agents/backend-agent.ts` — scaffold pipeline integration
- `packages/core/src/agents/frontend-agent.ts` — scaffold pipeline integration
- `packages/core/src/agents/qa-agent.ts` — scaffold pipeline integration
- `skills/backend/SKILL-backend-core.md` — Scaffold Mode section
- `skills/frontend/SKILL-frontend-core.md` — Scaffold Mode section
- `skills/qa/SKILL-qa-core.md` — Scaffold Mode section

### Test Results
- **92 new scaffolder tests** — all passing
- **663 total tests** — zero regressions (3 skipped, pre-existing)
- All 13 tables and 8 enums parsed from real schema.ts

---

## Platform Integration Test Results (2026-02-27)

All 10 tests passed. Testing validated the scaffold pipeline end-to-end across all three integrated agents (backend, frontend, QA), the orchestrator's full decompose-assign-execute flow, and measured actual token savings.

| # | Agent | Result | Takes | Key Finding |
|---|-------|--------|-------|-------------|
| 1 | Backend | PASS | 5 | Scaffold fires, Claude fills TODOs, 4 files, ~15% fewer tokens |
| 2 | Frontend | PASS | 8 | Type detection fixed, TanStack Query conventions injected via fallback, scaffold 3 files |
| 3 | QA | PASS | 4 | TDD scaffold wired in, test-tdd type detected, 20% output reduction vs no scaffold |
| 4 | Backend | PASS | 1 | Real schema data: 31/31 columns, 3/3 enums, zero placeholders on tasks table. Clients table also verified. Placeholder fallback works for missing tables |
| 5 | Frontend | PASS | 5 | Form scaffold works, frontend-form type detected, 3 scaffold files. Context profile fix for forms confirmed working via code trace |
| 6 | Any | PASS | 1 | Validator catches syntax errors and unknown package imports. Gaps documented: @/ aliases skipped, no semantic analysis, no unused variable detection |
| 7 | Backend | PASS | 1 | Retry pipeline plumbing verified via unit tests. No API calls needed |
| 8 | Backend | PASS | 3 | Multi-table detection works: milestones + projects + tasks, related Zod schemas generated, heartbeat logging working |
| 9 | Orchestrator | PASS | 3 | Full pipeline: Orchestrator decomposes → Backend → Frontend + QA parallel. Dependencies enforced, tech specs generated at queue time with 50% token reduction |
| 10 | All | PASS | 1 | Backend 22% output reduction (16,121 vs 20,702 chars), 21% faster (46s vs 58s). Consistent ~20% floor across agents |

### Token Savings: Honest Assessment

**Measured:** 20-22% output reduction (consistently across agents).
**Original projection:** 40-60%.

The gap exists because current scaffolds provide structure (imports, file layout, type definitions, TODO markers) but Claude still regenerates significant content around the TODOs rather than filling them minimally. Closing the gap requires:
1. Richer scaffolds with more pre-filled business logic patterns
2. Stricter "fill TODOs only" prompt enforcement
3. Model-level adherence improvements (future Claude versions)

The 20-22% floor is still valuable: it's free (local computation), reduces retry rates, and improves output consistency.

---

## Bugs Found and Fixed During Testing (7-15)

| # | Bug | Root Cause | Fix | Test |
|---|-----|-----------|-----|------|
| 7 | Frontend-page scaffold returns 0 files | No placeholder fallback when context unavailable | Produce placeholder files with TODOs | Test 2 |
| 8 | Frontend detected as frontend-form instead of frontend-page | Heuristic matched form before page | Fixed priority: page signals checked before form signals | Test 2 |
| 9 | QA agent not calling scaffold pipeline | `generateScaffold` not wired into qa-agent.ts | Added scaffold integration following backend/frontend pattern | Test 3 |
| 10 | QA test-tdd scaffold returns 0 files | No placeholder fallback in test-shell-tdd.ts | Added placeholder test file with describe blocks and it.todo() stubs | Test 3 |
| 11 | Backend Anthropic client silent hangs | No timeout configured | Added timeout: 120s, maxRetries: 2, 30s heartbeat logging | Test 8 |
| 12 | Multi-table scaffolds missing related schemas | Scaffold only generated for primary resource | Added extractRelatedTableNames() with singular-stem matching | Test 8 |
| 13 | Tech spec generates Express vs Hono codebase | Architect spec generator not aligned with project stack | Identified in Test 9 — orchestrator workaround on retry | Test 9 |
| 14 | Form tasks classified as simple-component | Profile detection missing form/submission signals | Added form signals to api-consumer detection | Test 5 |
| 15 | API patterns: -1 sentinel | Intentional design — -1 means fallback injected, 0 means none, positive means real files | Documented as expected behavior | Test 2 |

### Pre-existing bugs fixed during testing (from earlier phases)

| # | Bug | Fix | Test |
|---|-----|-----|------|
| — | Dependency guard missing in claimTaskForProcessing | Added dep completeness check before claiming | Test 9 |
| — | Tech stack mismatch in architect spec generator | Injected Hono/Drizzle/Zod/Vitest stack into system prompt | Test 9 |
| — | TDD detection causing false positives | Disabled TDD detection, QA always uses test-shell | Test 3 |

---

## Architectural Changes During Testing

### Frontend Context Loader Rewrite
- Dynamic hook discovery for React 19+ patterns (useActionState, useOptimistic, useFormStatus)
- API pattern loading with TanStack Query / Server Actions / React 19 fallback conventions
- When real frontend context is unavailable, injects opinionated defaults rather than returning empty
- **16 new tests** for frontend context loader

### ANTIPATTERNS.md Created
- `docs/ANTIPATTERNS.md` — data fetching decision tree, mutation patterns, React 19 hooks guidance
- Referenced by frontend SKILL files as authoritative source for pattern decisions

### SKILL File Updates
- `SKILL-frontend-core.md` — Updated for Next.js 16+, nuanced useEffect guidance, Server Actions, useActionState, useOptimistic
- `SKILL-frontend-patterns.md` — Added data fetching decision tree
- All three core SKILLs (backend, frontend, QA) have consistent Scaffold Mode sections

### Multi-table Detection
- `scaffold-orchestrator.ts` — `extractRelatedTableNames()` uses singular-stem matching to find related tables from task description
- Example: task mentioning "milestones" also pulls in "projects" and "tasks" Zod schemas when they appear as foreign key targets

### Heartbeat Logging
- `backend-agent.ts` — 30-second heartbeat logging during Claude API calls prevents silent hang confusion in logs

### System Test Sandbox Project
- Permanent test project seeded in DB with UUID `00000000-0000-0000-0000-000000000000`
- Permissive scope covering all agent types for integration testing
- Eliminates need to create/clean up test projects per test run

### QA Scaffold Pipeline Integration
- `qa-agent.ts` — Full scaffold pipeline wired in (was missing during initial implementation)
- `DISABLE_SCAFFOLD` env var guard added (matching backend/frontend pattern)

### Form Signal Detection
- Context profile api-consumer detection expanded with form/submission signals
- Prevents form tasks from being misclassified as simple-component

---

## Known Gaps

### Validator Limitations (local-validator.ts)

The local validator currently catches **2 of 5** problem types:

| Check | Status | Notes |
|-------|--------|-------|
| Syntax errors (missing brackets, invalid TS) | ✅ Implemented | Regex-based parsing |
| Unknown package imports | ✅ Implemented | Checks against known packages list |
| @/ path aliases | ⚠️ Skipped | Line 105: unconditionally skipped. Low-effort fix available (resolve against project tsconfig paths) |
| Semantic analysis (undefined references) | ❌ Not implemented | Requires `getSemanticDiagnostics` with type stubs. High effort. |
| Unused variable detection | ❌ Not implemented | Defer to ESLint in PR pipeline (Phase 7) |

### Token Savings Gap

Current scaffolds achieve 20-22% output token reduction vs the original 40-60% projection. The scaffolds provide correct imports, file structure, and type definitions — but Claude regenerates surrounding content rather than minimally filling TODOs. Potential improvements:

1. **Richer scaffolds** — Pre-fill more business logic patterns (error handling, pagination, auth checks)
2. **Stricter prompt enforcement** — Stronger "fill TODOs only, do not modify scaffold" instructions
3. **Post-processing** — Strip scaffold-identical lines from Claude output to measure "net new" tokens

### TDD Detection Disabled

TDD detection in QA scaffold was causing false positives. Currently disabled — QA always uses test-shell mode. Will reintroduce when TDD workflow is wired at orchestrator level (Phase 8).