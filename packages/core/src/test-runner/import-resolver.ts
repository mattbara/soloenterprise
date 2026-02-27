import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export interface ResolveAliasMap {
  [importPattern: string]: string; // import specifier → absolute file path
}

/**
 * Extract import specifiers from TypeScript source code.
 * Handles: import { x } from '...', import x from '...', import '...',
 * import type { x } from '...', export { x } from '...'
 */
function extractImportSpecifiers(source: string): Set<string> {
  const specifiers = new Set<string>();

  // Match import/export ... from 'specifier' and import 'specifier'
  const importRegex = /(?:import|export)\s+(?:type\s+)?(?:(?:[^'"]*?\s+from\s+)|)['"]([^'"]+)['"]/g;

  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(source)) !== null) {
    specifiers.add(match[1]!);
  }

  return specifiers;
}

/**
 * Recursively collect all .ts/.tsx files from a directory tree.
 */
async function collectSourceFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      files.push(fullPath);
    } else if (entry.isDirectory() && entry.name !== 'node_modules') {
      const subFiles = await collectSourceFiles(fullPath);
      files.push(...subFiles);
    }
  }

  return files;
}

/** Specifiers to always skip — Vitest provides its own or they resolve naturally. */
const SKIP_SPECIFIERS = new Set(['vitest']);

/** Check if specifier is a relative import. */
function isRelative(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

/**
 * Known node_modules packages that should resolve to the real monorepo install.
 * Maps package prefix → whether it supports deep imports (e.g. drizzle-orm/pg-core).
 */
const REAL_PACKAGES: Array<{ prefix: string; deep: boolean }> = [
  { prefix: 'drizzle-orm', deep: true },
  { prefix: 'zod', deep: false },
  { prefix: 'hono', deep: true },
  { prefix: 'react-dom', deep: true },
  { prefix: 'react', deep: false },
  { prefix: '@testing-library/', deep: true },
];

function mockHarnessPath(monorepoRoot: string, file: string): string {
  return resolve(monorepoRoot, 'packages/core/src/test-runner/mock-harness', file);
}

/**
 * Resolve a package specifier from node_modules, checking workspace-local
 * (packages/core/node_modules) first, then root node_modules.
 * pnpm hoists workspace-declared deps under the workspace package's node_modules.
 */
function resolveFromNodeModules(monorepoRoot: string, specifier: string): string {
  const candidates = [
    resolve(monorepoRoot, 'packages/core/node_modules', specifier),
    resolve(monorepoRoot, 'node_modules', specifier),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  // Fallback to root — Vitest will surface the resolution error at runtime
  return resolve(monorepoRoot, 'node_modules', specifier);
}

function resolveSpecifier(
  specifier: string,
  monorepoRoot: string,
  warnings: string[],
): string | null {
  // Skip relative imports
  if (isRelative(specifier)) return null;

  // Skip vitest globals
  if (SKIP_SPECIFIERS.has(specifier)) return null;

  // @soloenterprise/db/schema → real schema
  if (specifier === '@soloenterprise/db/schema') {
    return resolve(monorepoRoot, 'packages/db/src/schema.ts');
  }

  // @soloenterprise/db → mock harness
  if (specifier === '@soloenterprise/db') {
    return mockHarnessPath(monorepoRoot, 'db.ts');
  }

  // @soloenterprise/core or @soloenterprise/core/* → mock harness
  if (specifier === '@soloenterprise/core' || specifier.startsWith('@soloenterprise/core/')) {
    return mockHarnessPath(monorepoRoot, 'core-services.ts');
  }

  // next/* mocks
  if (specifier === 'next/navigation') {
    return mockHarnessPath(monorepoRoot, 'next-navigation.ts');
  }
  if (specifier === 'next/image') {
    return mockHarnessPath(monorepoRoot, 'next-image.ts');
  }
  if (specifier === 'next/headers') {
    return mockHarnessPath(monorepoRoot, 'next-headers.ts');
  }

  // @/ catch-all — stub to next-navigation as generic mock
  if (specifier.startsWith('@/')) {
    warnings.push(
      `[import-resolver] WARNING: @/ import found: "${specifier}". ` +
        'This references app code that cannot resolve in sandbox. Stubbing with generic mock.',
    );
    return mockHarnessPath(monorepoRoot, 'next-navigation.ts');
  }

  // Real node_modules packages — check multiple locations because pnpm
  // may hoist deps to packages/core/node_modules or root node_modules
  for (const pkg of REAL_PACKAGES) {
    const matches =
      (pkg.deep && (specifier === pkg.prefix.replace(/\/$/, '') || specifier.startsWith(pkg.prefix))) ||
      (!pkg.deep && specifier === pkg.prefix);
    if (matches) {
      return resolveFromNodeModules(monorepoRoot, specifier);
    }
  }

  // Unknown package — warn and skip
  warnings.push(
    `[import-resolver] WARNING: Unknown import "${specifier}" — skipping. ` +
      'Vitest will surface the actual resolution error at runtime.',
  );
  return null;
}

/**
 * Scans sandbox .ts/.tsx files, extracts imports, and generates a Vitest
 * resolve.alias map pointing sandbox imports to monorepo packages or mock stubs.
 *
 * @param sandboxPath - Absolute path to the sandbox directory (project-files/tasks/{id}/)
 * @param monorepoRoot - Absolute path to the SoloEnterprise monorepo root
 * @returns Alias map for Vitest config resolve.alias
 */
export async function resolveImportsForSandbox(
  sandboxPath: string,
  monorepoRoot: string,
): Promise<ResolveAliasMap> {
  const absMonorepo = resolve(monorepoRoot);
  const absSandbox = resolve(sandboxPath);

  const sourceFiles = await collectSourceFiles(absSandbox);

  // Collect all unique specifiers
  const allSpecifiers = new Set<string>();
  for (const filePath of sourceFiles) {
    try {
      const content = await readFile(filePath, 'utf-8');
      for (const spec of extractImportSpecifiers(content)) {
        allSpecifiers.add(spec);
      }
    } catch {
      // Skip unreadable files
    }
  }

  // Resolve each specifier
  const aliasMap: ResolveAliasMap = {};
  const warnings: string[] = [];

  for (const specifier of allSpecifiers) {
    const resolved = resolveSpecifier(specifier, absMonorepo, warnings);
    if (resolved !== null) {
      aliasMap[specifier] = resolved;
    }
  }

  // Log collected warnings
  for (const w of warnings) {
    console.warn(w);
  }

  return aliasMap;
}

// Exported for testing
export { extractImportSpecifiers, resolveSpecifier };
