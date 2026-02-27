import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { TestExecutionResult } from './result-parser';

/**
 * Recursively find all *.test.ts / *.test.tsx files in a directory.
 */
export function findTestFiles(dir: string): string[] {
  const results: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      results.push(...findTestFiles(full));
    } else if (entry.isFile() && /\.test\.tsx?$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Build a retry prompt that includes test failure details for Claude to fix.
 *
 * For backend/frontend agents: instructs Claude to fix implementation code.
 * For QA agent: instructs Claude to fix tests (since QA generates tests, not impl).
 */
export function buildTestRetryPrompt(
  originalFiles: Array<{ path: string; content: string }>,
  testResult: TestExecutionResult,
  options?: { isQA?: boolean },
): string {
  const parts: string[] = [];

  parts.push('# Test Failures — Fix Required\n');
  parts.push(`${testResult.failedTests} of ${testResult.totalTests} tests failed.\n`);

  // List each failure with details
  parts.push('## Failed Tests\n');
  for (const failure of testResult.failures) {
    parts.push(`### ${failure.testName}`);
    if (failure.file) {
      parts.push(`**File:** ${failure.file}`);
    }
    parts.push(`**Error:** ${failure.error}`);
    if (failure.expected !== undefined) {
      parts.push(`**Expected:** ${failure.expected}`);
    }
    if (failure.received !== undefined) {
      parts.push(`**Received:** ${failure.received}`);
    }
    parts.push('');
  }

  // Include original source files for reference
  parts.push('## Original Source Files\n');
  for (const file of originalFiles) {
    parts.push(`### ${file.path}`);
    parts.push('```typescript');
    parts.push(file.content);
    parts.push('```\n');
  }

  // Agent-specific instruction
  if (options?.isQA) {
    parts.push('## Instructions\n');
    parts.push(
      'These tests failed when run against the implementation. Fix the tests if they contain bugs, or flag if the implementation has issues.',
    );
    parts.push('Do NOT modify implementation files unless the tests reveal a genuine implementation bug.');
  } else {
    parts.push('## Instructions\n');
    parts.push('Fix the code so these tests pass. Do not modify the test files unless the tests themselves are buggy.');
  }

  parts.push('\nOutput all fixed files using the <file path="...">content</file> XML format.');

  return parts.join('\n');
}
