import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { readdir, readFile, rename } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import type { TestExecutionResult } from './result-parser';
import { parseVitestOutput } from './result-parser';
import { resolveImportsForSandbox } from './import-resolver';
import { generateSandboxConfig } from './vitest-sandbox-config';

const DEFAULT_TIMEOUT = 30_000;
const MIN_PER_TEST_TIMEOUT = 5_000;
const SIGKILL_GRACE = 5_000;

/**
 * Walk up from a starting directory to find the monorepo root.
 * Looks for a packages/ directory (the monorepo marker).
 */
export function findMonorepoRoot(startDir: string): string | null {
  let current = resolve(startDir);
  const root = resolve('/');

  while (current !== root) {
    // Check for packages/ directory (monorepo marker)
    if (existsSync(join(current, 'packages')) && existsSync(join(current, 'package.json'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}

/**
 * Recursively collect all file paths from a directory tree.
 */
function collectAllFiles(dir: string): string[] {
  const files: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isFile()) {
      files.push(fullPath);
    } else if (entry.isDirectory() && entry.name !== 'node_modules') {
      files.push(...collectAllFiles(fullPath));
    }
  }
  return files;
}

/**
 * Auto-detect whether the sandbox needs jsdom (frontend) or node (backend).
 * Returns 'jsdom' if .tsx files exist or @testing-library/react is imported.
 */
export async function detectEnvironment(
  sandboxPath: string,
): Promise<'node' | 'jsdom'> {
  const filePaths = collectAllFiles(sandboxPath);

  for (const filePath of filePaths) {
    // .tsx file → jsdom
    if (filePath.endsWith('.tsx')) return 'jsdom';

    // Check for @testing-library/react import
    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        if (content.includes('@testing-library/react')) return 'jsdom';
      } catch {
        // skip
      }
    }
  }

  return 'node';
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
 * Patterns that match vitest/vite config files which could interfere with
 * our generated sandbox config. We rename them to .bak before running.
 */
const CONFIG_CONFLICT_PATTERN = /^(vitest\.config|vite\.config)\.\w+$/;

/**
 * Scan the sandbox root for existing vitest.config.* / vite.config.* files.
 * Rename them to *.bak so our generated config is the ONLY one Vitest sees.
 * Returns a restore function that renames them back.
 */
export async function quarantineConflictingConfigs(
  sandboxPath: string,
): Promise<{ renamed: string[]; restore: () => Promise<void> }> {
  const renamed: string[] = [];

  let entries;
  try {
    entries = readdirSync(sandboxPath, { withFileTypes: true });
  } catch {
    return { renamed, restore: async () => {} };
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!CONFIG_CONFLICT_PATTERN.test(entry.name)) continue;

    const original = join(sandboxPath, entry.name);
    const backup = original + '.bak';
    try {
      await rename(original, backup);
      renamed.push(original);
      console.log(`Renamed existing config: ${original} → ${backup}`);
    } catch {
      // Best effort — if rename fails, continue
    }
  }

  return {
    renamed,
    restore: async () => {
      for (const original of renamed) {
        try {
          await rename(original + '.bak', original);
        } catch {
          // Best effort restore
        }
      }
    },
  };
}

/**
 * Spawn Vitest in a child process and collect stdout/stderr.
 * Returns { stdout, stderr, exitCode, timedOut }.
 */
function spawnVitest(
  configPath: string,
  sandboxPath: string,
  monorepoRoot: string,
  timeout: number,
): Promise<{ stdout: string; stderr: string; exitCode: number | null; timedOut: boolean }> {
  return new Promise((resolvePromise) => {
    // Use the monorepo's vitest binary directly — avoids npx downloading a separate copy
    // and ensures vitest/config resolves from the monorepo's node_modules.
    const vitestBin = join(monorepoRoot, 'node_modules', '.bin', 'vitest');
    const args = ['run', '--reporter=json', '--config', configPath];

    const child = spawn(vitestBin, args, {
      cwd: sandboxPath,
      env: {
        ...process.env,
        NODE_PATH: join(monorepoRoot, 'node_modules'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      // Force kill after grace period
      setTimeout(() => {
        if (!settled) {
          child.kill('SIGKILL');
        }
      }, SIGKILL_GRACE);
    }, timeout);

    child.on('close', (code) => {
      settled = true;
      clearTimeout(timer);
      resolvePromise({ stdout, stderr, exitCode: code, timedOut });
    });

    child.on('error', (err) => {
      settled = true;
      clearTimeout(timer);
      resolvePromise({
        stdout,
        stderr: stderr + '\n' + err.message,
        exitCode: null,
        timedOut,
      });
    });
  });
}

export async function executeTestsInSandbox(
  sandboxPath: string,
  options?: {
    timeout?: number;
    testFiles?: string[];
    environment?: 'node' | 'jsdom';
    monorepoRoot?: string;
  },
): Promise<TestExecutionResult> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;

  // Validate sandbox path exists
  if (!existsSync(sandboxPath)) {
    return syntheticFailure(`Sandbox path does not exist: ${sandboxPath}`);
  }

  // Resolve to real path to avoid macOS /var → /private/var symlink issues
  // that break Vite's /@fs/ module resolution for setup files
  sandboxPath = realpathSync(sandboxPath);

  // Determine monorepo root
  const monorepoRoot = options?.monorepoRoot ?? findMonorepoRoot(__dirname);
  if (!monorepoRoot) {
    return syntheticFailure(
      'Could not determine monorepo root. Provide it explicitly via options.monorepoRoot.',
    );
  }

  let configCleanup: (() => Promise<void>) | undefined;
  let configRestore: (() => Promise<void>) | undefined;

  try {
    // Step 1: Quarantine conflicting configs (QA agent may generate its own)
    const quarantine = await quarantineConflictingConfigs(sandboxPath);
    configRestore = quarantine.restore;

    // Step 2: Resolve imports
    const aliases = await resolveImportsForSandbox(sandboxPath, monorepoRoot);

    // Step 3: Auto-detect or use provided environment
    const environment =
      options?.environment ?? (await detectEnvironment(sandboxPath));

    // Step 4: Generate sandbox config
    // Per-test timeout = total / 3, minimum 5000ms
    const perTestTimeout = Math.max(Math.floor(timeout / 3), MIN_PER_TEST_TIMEOUT);

    const config = await generateSandboxConfig({
      sandboxPath,
      monorepoRoot,
      aliases,
      testFiles: options?.testFiles,
      timeout: perTestTimeout,
      environment,
    });
    configCleanup = config.cleanup;

    // Step 5: Spawn Vitest
    const spawnStart = Date.now();
    const { stdout, stderr, timedOut } = await spawnVitest(
      config.configPath,
      sandboxPath,
      monorepoRoot,
      timeout,
    );

    // Step 6: Handle results
    if (timedOut) {
      const elapsed = Date.now() - spawnStart;
      return {
        ...syntheticFailure(`Test execution timed out after ${timeout}ms`),
        duration: elapsed,
      };
    }

    // If stdout has content, try to parse it (Vitest exits non-zero on test failure, that's expected)
    if (stdout.trim()) {
      return parseVitestOutput(stdout);
    }

    // No stdout — process crashed
    const stderrSnippet = stderr.trim().slice(0, 2000);
    return syntheticFailure(
      `Vitest process produced no output. stderr:\n${stderrSnippet || '(empty)'}`,
    );
  } finally {
    // Always clean up generated config files
    if (configCleanup) {
      try {
        await configCleanup();
      } catch {
        // Best effort cleanup
      }
    }
    // Restore quarantined configs
    if (configRestore) {
      try {
        await configRestore();
      } catch {
        // Best effort restore
      }
    }
  }
}
