# Phase 6.10: Sandbox Test Execution Pipeline

**Date:** 2026-02-25
**Branch:** `phase-6.10/sandbox-test-runner`
**Status:** SPEC — NOT STARTED
**Prerequisite:** Phase 6.9 (scaffolder + local-validator must exist)
**Duration:** 3-5 days
**Effort:** M | **Impact:** High

---

## Why This Phase Exists

SoloEnterprise validates structure (tsc, eslint via Phase 6.9's local-validator) but not behavior. A file can pass type-checking and still crash at runtime. Phase 6.10 makes generated Vitest tests actually EXECUTE against generated implementation code inside sandboxes. Tests must pass before a task is marked complete.

This closes the gap: "you're validating structure but not behavior."

---

## What Was Cut from the Original Spec (and Why)

The original Phase 6.10 spec included Playwright. All Playwright was removed:

| Cut | Reason |
|-----|--------|
| **Playwright component testing** (`@playwright/experimental-ct`) | Requires a Vite/Webpack bundler setup inside the sandbox to mount React components. Sandboxes are loose files with no bundler — you'd need to scaffold an entire Vite project per sandbox. Use `@testing-library/react` + `jsdom` via Vitest instead (zero browser binary, same pipeline). |
| **Playwright E2E** (`mode: 'e2e'`) | Requires a running server to `page.goto()`. Sandbox code has no `package.json`, no `next dev`, no entry point. There's nothing to navigate to. |
| **Coverage reporting** | Adds Istanbul/V8 instrumentation complexity with zero value when the test corpus is agent-generated and there's no baseline metrics. Premature. |
| **200MB Chromium binary** | Dead weight. No Playwright = no browser binary needed. |

**Playwright is introduced in Phase 7** when the DevOps agent creates deployable projects with preview URLs. See "Playwright Roadmap" at the bottom of this document.

---

## Architecture

### Sandbox Test Runner

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

### Core Interface

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

### How Sandbox Execution Works

1. **Config generation** — Creates a temporary `vitest.config.ts` pointing at the sandbox directory, with path aliases resolving `@soloenterprise/*` and `@/*` back to the monorepo or mock stubs
2. **Mock harness injection** — Provides mock modules for runtime dependencies that can't resolve in a sandbox (database, Redis, external APIs, Next.js internals)
3. **Subprocess execution** — Runs `vitest run --reporter=json` in a child process with the generated config, enforcing timeout
4. **Output parsing** — Parses Vitest JSON reporter output into structured `TestExecutionResult`
5. **Cleanup** — Removes temporary config files

---

## Import Resolution (The Hard Part)

Generated sandbox files reference imports that don't exist in the sandbox:

```typescript
// These all need to resolve when vitest runs inside the sandbox:
import { db } from "@soloenterprise/db";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { eq } from "drizzle-orm";
```

### Resolution Strategy

| Import Pattern | Resolution | Notes |
|---------------|------------|-------|
| `@soloenterprise/db` | Mock harness — stub with mock db client | Tests mock their own db calls |
| `@soloenterprise/db/schema` | Real — alias to `packages/db/src/schema.ts` | Types only, no runtime cost |
| `@soloenterprise/core/*` | Mock harness — stub services | Queue, locks, etc. |
| `@/*` (Next.js app imports) | Mock harness — stubs for components/hooks | Sandbox can't reach `src/` |
| `next/navigation` | Mock harness — `useRouter`, `redirect`, etc. | vi.fn() stubs |
| `next/image` | Mock harness — passthrough div | Renders `<img>` |
| `drizzle-orm` | Real — alias to `node_modules/drizzle-orm` | Operators work as-is |
| External packages (zod, etc.) | Real — alias to monorepo `node_modules` | Already installed |

The `import-resolver.ts` scans sandbox files for import statements and generates a `resolve.alias` map for the Vitest config. This is the component that makes or breaks sandbox test execution — if imports don't resolve, nothing runs.

**Relationship to Phase 6.9's import-resolver:** Phase 6.9's `packages/core/src/scaffolder/import-resolver.ts` builds an `ImportMap` of available imports for scaffold generation (input to Claude). Phase 6.10's `packages/core/src/test-runner/import-resolver.ts` generates Vitest `resolve.alias` entries for test execution (runtime resolution). They serve different purposes but can share the project-scanning logic.

---

## Mock Harness

```typescript
// packages/core/src/test-runner/mock-harness.ts

// Pre-built mock modules that the generated vitest config aliases to.
// Each mock provides the minimum surface area to not crash at import time.

// --- @soloenterprise/db mock ---
export const db = {
  query: new Proxy({}, {
    get: () => ({
      findMany: async () => [],
      findFirst: async () => null
    })
  }),
  select: () => ({
    from: () => ({
      where: () => ({
        limit: () => ({ then: (r: Function) => r([]) })
      })
    })
  }),
  insert: () => ({ values: () => ({ returning: async () => [{ id: 1 }] }) }),
  update: () => ({ set: () => ({ where: async () => ({ rowCount: 1 }) }) }),
  delete: () => ({ where: async () => ({ rowCount: 1 }) }),
};

// --- next/navigation mock ---
export const useRouter = () => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
});
export const usePathname = () => '/';
export const useSearchParams = () => new URLSearchParams();
export const redirect = vi.fn();
export const notFound = vi.fn();

// --- next/image mock ---
export default function Image(props: any) {
  return props; // Tests don't render actual images
}
```

**Important:** These mocks exist so imports don't crash at module load time. Tests that need specific behavior should override with `vi.mock()` at the test level — the QA agent already generates these. The harness is a safety net, not a testing framework.

---

## Worker Pipeline Update

```
BEFORE 6.10 (Phase 6.9):
  Scaffold → Claude API → Validate (tsc/lint) → Done

AFTER 6.10:
  Scaffold → Claude API → Validate (tsc/lint) → Execute Tests → Done
                                                      ↓ (if fails)
                                                 Retry with errors → Execute Tests → Done or Escalate
```

### Task-Type-Aware Execution

| Task Type | Test Runner | Action |
|-----------|-------------|--------|
| Backend route | Vitest (unit + integration) | Run all `*.test.ts` in sandbox |
| Frontend component | Vitest + jsdom + RTL | Run all `*.test.ts` with jsdom env |
| Full feature | Vitest (both environments) | Run all tests |
| Bug fix | Vitest (affected files) | Run only test files matching modified sources |
| Scoper/Reporter | Skip | No executable tests — business document output |

### Retry-with-Errors Flow

When tests fail, the failure details are fed back to Claude:

```typescript
const testResult = await executeTestsInSandbox(sandboxPath);

if (!testResult.passed) {
  const retryPrompt = buildTestRetryPrompt({
    originalFiles: files,
    failures: testResult.failures,
    // Include: test name, file, error message, expected vs received
  });
  const retryResponse = await callClaude(systemPrompt, retryPrompt);
  const retryFiles = parseAgentOutput(retryResponse);

  const retryResult = await executeTestsInSandbox(sandboxPath);
  if (!retryResult.passed) {
    // Escalate to human — 2 attempts failed
    await escalateToHuman(taskId, retryResult.failures);
  }
}
```

This follows the existing 3-strike rule. The pipeline gets: 1 attempt + 1 retry with test errors = 2 shots before escalation. (The third strike is reserved for the overall task retry at the queue level.)

---

## QA SKILL File Updates

### `skills/qa/SKILL-qa-core.md` — ADD section:

```markdown
## Sandbox-Executable Tests

All generated tests MUST be executable in sandbox isolation. The test runner provides
mock stubs for common imports, but your tests must be self-contained.

### Rules:
- Import from `@soloenterprise/db/schema` for types — this resolves to the real schema
- Use `vi.mock()` for ANY service or database call you depend on
- Do NOT import from `@/` paths (Next.js app directory) — these won't resolve
- Do NOT import components from other sandbox files unless they're in the same task
- Test file naming: `{source-file}.test.ts` (co-located with source)

### Available Mock Stubs (provided by test harness):
- `@soloenterprise/db` — mock db client (returns empty arrays/null by default)
- `@soloenterprise/core/*` — mock services (queue, locks, etc.)
- `next/navigation` — mock useRouter, redirect, notFound
- `next/image` — passthrough component
- `drizzle-orm` — real operators (eq, and, or, etc.)
```

### `skills/qa/SKILL-qa-patterns.md` — ADD section:

```markdown
## Test Patterns for Sandbox Execution

### Backend Test Pattern
- Mock the database at the module level with `vi.mock('@soloenterprise/db')`
- Set up mock return values in `beforeEach`
- Test the handler function directly, not via HTTP

### Frontend Component Test Pattern
- Use `@testing-library/react` for rendering
- Use `@testing-library/jest-dom` for DOM assertions
- Mock `next/navigation` hooks if the component uses routing
- Test user-visible behavior, not implementation details

### What NOT to Test in Sandbox
- Actual database queries (mock them)
- External API calls (mock them)
- File system operations (mock them)
- Browser-specific APIs beyond jsdom support (defer to E2E in Phase 7+)
```

---

## Dependencies to Install

```bash
pnpm add -D @testing-library/react @testing-library/jest-dom jsdom
```

Lightweight dev dependencies. No Chromium binary, no browser download. `vitest` is already installed.

---

## Integration with Phase 6.9

Phase 6.9's `local-validator.ts` has a `runTests` option that currently just runs `vitest run`. Phase 6.10 replaces that with the proper sandbox runner:

```typescript
// Phase 6.9 (current):
validateGeneratedCode(files, sandboxPath, { runTests: true })
// ↑ This just shells out to vitest — no import resolution, no mocks

// Phase 6.10 (replacement):
validateGeneratedCode(files, sandboxPath, { runTests: true })
// ↑ Now calls executeTestsInSandbox() which handles config gen, mocks, aliases
```

The `validateGeneratedCode` interface stays the same. The implementation changes underneath. No breaking changes for callers.

---

## Checklist

- [ ] Sandbox runner executes Vitest in sandbox subprocess
- [ ] Vitest config generator creates valid config with path aliases per sandbox
- [ ] Import resolver scans sandbox files and generates alias map
- [ ] Mock harness provides stubs for `@soloenterprise/db`, `@soloenterprise/core`, `next/*`
- [ ] Result parser handles Vitest JSON reporter output
- [ ] Worker pipeline extended with test execution stage (after tsc/lint)
- [ ] Retry-with-errors: test failures fed back to Claude for fix attempt
- [ ] Timeout handling: hanging tests killed after 30s, reported as failure
- [ ] Frontend tests use jsdom environment via `@testing-library/react`
- [ ] QA SKILL files updated with sandbox-executable test constraints
- [ ] Baseline tests 1-5 pass
- [ ] Stress tests 6-10 pass

---

## Test Plan

### Baseline Tests (1-5)

1. **Vitest sandbox execution** — given sandbox with valid test + implementation, tests pass, returns `{ passed: true }`
2. **Vitest failure reporting** — given sandbox with failing test, returns structured `TestFailure[]` with test name, file, error, expected/received
3. **Frontend component test** — given React component + RTL test (jsdom env), Vitest runs and passes in sandbox
4. **Config generation** — generates valid `vitest.config.ts` with correct path aliases for a sandbox containing `@soloenterprise/*` and `@/*` imports
5. **Timeout handling** — test with infinite loop is killed after timeout, reported as failure (not hang)

### Stress Tests (6-10)

6. **Real backend output** — take actual backend-agent output from Phase 5.5, run generated tests against it in sandbox
7. **Real frontend output** — take actual frontend-agent output, run RTL component test via Vitest+jsdom in sandbox
8. **Concurrent sandboxes** — two test runners in different sandboxes simultaneously, no interference (separate configs, separate processes)
9. **Missing dependency** — sandbox imports module that doesn't exist and isn't mocked, error message is clear and actionable (not cryptic Vitest internals)
10. **Full pipeline** — scaffold → Claude API → validate (tsc/lint) → execute tests → all pass (end-to-end)

---

## What's NOT in This Phase

- **Playwright** (any form) — see Playwright Roadmap below
- **Coverage reporting** — no baseline metrics, premature
- **TDD workflow wiring** — Phase 8 (orchestrator runs QA before implementation)
- **Adversarial code review** — Phase 7 (Reviewer agent)
- **CI/CD pipeline integration** — Phase 7 (DevOps agent)

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

### Summary

| Phase | Playwright Capability | Prerequisite |
|-------|----------------------|--------------|
| 6.10 | **None** — Vitest only | Phase 6.9 scaffolder |
| 7 | E2E tests in CI for client projects | Preview deployments |
| 7.5 | Visual regression + accessibility + Lighthouse | Preview URLs from Phase 7 |
| 8 | Orchestrator verification gate (optional E2E) | Complete assembled projects |

**The rule is simple: Playwright needs a running application to test. Until Phase 7 creates deployed preview URLs, there's nothing for Playwright to navigate.**

---

Do NOT create any implementation files. This is a specification document only.
