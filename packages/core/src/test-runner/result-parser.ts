export interface TestExecutionResult {
  passed: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  failures: TestFailure[];
  duration: number; // milliseconds
}

export interface TestFailure {
  testName: string;
  file: string;
  error: string;
  expected?: string;
  received?: string;
}

/**
 * Vitest JSON reporter types (subset we care about).
 * Shape confirmed from vitest source — vitest-dev/vitest#5068.
 */
interface VitestAssertionResult {
  ancestorTitles: string[];
  fullName: string;
  status: 'passed' | 'failed' | 'skipped' | 'pending' | 'todo' | 'disabled';
  title: string;
  duration?: number | null;
  failureMessages: string[];
  location?: { line: number; column: number } | null;
}

interface VitestTestResult {
  name: string; // file path
  status: 'failed' | 'passed';
  startTime: number;
  endTime: number;
  assertionResults: VitestAssertionResult[];
  message: string;
}

interface VitestJsonOutput {
  numFailedTests: number;
  numPassedTests: number;
  numPendingTests: number;
  numTodoTests: number;
  numTotalTests: number;
  numTotalTestSuites: number;
  success: boolean;
  startTime: number;
  testResults: VitestTestResult[];
}

function syntheticFailure(error: string): TestExecutionResult {
  return {
    passed: false,
    totalTests: 0,
    passedTests: 0,
    failedTests: 1,
    skippedTests: 0,
    failures: [{ testName: 'Test Runner', file: '', error }],
    duration: 0,
  };
}

/**
 * Extracts expected/received values from a Vitest failure message.
 * Vitest formats these as:
 *   expected: "foo"
 *   received: "bar"
 * or with the - / + diff format.
 */
function extractExpectedReceived(
  failureMessages: string[],
): { expected?: string; received?: string } {
  const combined = failureMessages.join('\n');

  // Format 1: Separate lines — "expected: 401\nreceived: 200"
  const expectedMatch = combined.match(/^expected:\s+(?:["'](.+?)["']|(.+))\s*$/m);
  const receivedMatch = combined.match(/^received:\s+(?:["'](.+?)["']|(.+))\s*$/m);

  if (expectedMatch || receivedMatch) {
    const expected = expectedMatch?.[1] ?? expectedMatch?.[2];
    const received = receivedMatch?.[1] ?? receivedMatch?.[2];
    return {
      expected: expected?.trim(),
      received: received?.trim(),
    };
  }

  // Format 2: Vitest 4.x inline — "expected '<received>' to be '<expected>'"
  // Variants: "to be", "to equal", "to deeply equal"
  const inlineMatch = combined.match(
    /expected\s+['"](.+?)['"]\s+to\s+(?:be|equal|deeply equal)\s+['"](.+?)['"]/,
  );
  if (inlineMatch) {
    return {
      received: inlineMatch[1]!.trim(),
      expected: inlineMatch[2]!.trim(),
    };
  }

  return {};
}

/**
 * Try to extract a JSON object from a string that may contain non-JSON
 * text before/after the JSON blob (e.g. stderr output mixed in).
 */
function extractJson(raw: string): string {
  // Find the first '{' that starts the root JSON object
  const start = raw.indexOf('{');
  if (start === -1) throw new Error('No JSON object found in output');

  // Walk from the end to find the matching closing '}'
  const end = raw.lastIndexOf('}');
  if (end === -1 || end <= start) throw new Error('No closing brace found in output');

  return raw.slice(start, end + 1);
}

export function parseVitestOutput(stdout: string): TestExecutionResult {
  // Case: empty string
  if (!stdout || stdout.trim() === '') {
    return syntheticFailure('Empty test output');
  }

  let parsed: VitestJsonOutput;
  try {
    const jsonStr = extractJson(stdout);
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return syntheticFailure(`Failed to parse test output: ${message}`);
  }

  // Validate minimum shape
  if (!Array.isArray(parsed.testResults)) {
    return syntheticFailure('Failed to parse test output: missing testResults array');
  }

  const totalTests = parsed.numTotalTests ?? 0;
  const passedTests = parsed.numPassedTests ?? 0;
  const failedTests = parsed.numFailedTests ?? 0;
  const skippedTests = (parsed.numPendingTests ?? 0) + (parsed.numTodoTests ?? 0);

  // Case: zero tests found — but check for file-level errors first.
  // When a file fails to load (e.g. missing dependency), Vitest reports 0 tests
  // but includes the error in testResults[].message for the failed suite.
  if (totalTests === 0) {
    const fileErrors = parsed.testResults
      .filter((r) => r.status === 'failed' && r.message)
      .map((r) => r.message.trim())
      .filter(Boolean);

    if (fileErrors.length > 0) {
      return syntheticFailure(fileErrors.join('\n').slice(0, 4000));
    }

    return syntheticFailure('No tests found');
  }

  // Collect failures
  const failures: TestFailure[] = [];
  for (const suite of parsed.testResults) {
    for (const assertion of suite.assertionResults) {
      if (assertion.status === 'failed') {
        const { expected, received } = extractExpectedReceived(assertion.failureMessages);
        failures.push({
          testName: assertion.fullName || assertion.title,
          file: suite.name,
          error: assertion.failureMessages.join('\n') || 'Unknown error',
          ...(expected !== undefined && { expected }),
          ...(received !== undefined && { received }),
        });
      }
    }
  }

  // Compute duration from testResults
  let duration = 0;
  if (parsed.testResults.length > 0) {
    const earliest = Math.min(...parsed.testResults.map((r) => r.startTime));
    const latest = Math.max(...parsed.testResults.map((r) => r.endTime));
    duration = latest - earliest;
  }

  return {
    passed: parsed.success && failedTests === 0,
    totalTests,
    passedTests,
    failedTests,
    skippedTests,
    failures,
    duration,
  };
}
