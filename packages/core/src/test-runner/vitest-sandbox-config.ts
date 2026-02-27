import { existsSync } from 'node:fs';
import { writeFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export interface SandboxConfigOptions {
  sandboxPath: string;
  monorepoRoot: string;
  aliases: Record<string, string>; // from import-resolver
  testFiles?: string[]; // specific files, or glob all *.test.ts
  timeout?: number; // per-test timeout, default 10000ms
  environment?: 'node' | 'jsdom'; // default 'node', 'jsdom' for frontend components
}

export interface GeneratedConfig {
  configPath: string; // absolute path to the generated vitest.config.ts
  setupPath?: string; // absolute path to generated setup file (if jsdom)
  cleanup: () => Promise<void>; // removes generated temp files
}

const DEFAULT_TIMEOUT = 10000;
const DEFAULT_INCLUDE = ['**/*.test.ts', '**/*.test.tsx'];

function buildAliasBlock(aliases: Record<string, string>): string {
  const entries = Object.entries(aliases);
  if (entries.length === 0) return '{}';

  // Sort by key length descending — more specific aliases must come first.
  // Vite's object alias uses first-match prefix semantics, so "@soloenterprise/db"
  // would incorrectly match "@soloenterprise/db/schema" if it appears first.
  entries.sort((a, b) => b[0].length - a[0].length);

  const lines = entries.map(
    ([specifier, target]) =>
      `      ${JSON.stringify(specifier)}: ${JSON.stringify(target)},`,
  );
  return `{\n${lines.join('\n')}\n    }`;
}

function buildIncludeArray(testFiles?: string[]): string {
  const patterns = testFiles && testFiles.length > 0 ? testFiles : DEFAULT_INCLUDE;
  return JSON.stringify(patterns);
}

function buildConfigSource(options: {
  aliases: Record<string, string>;
  testFiles?: string[];
  timeout: number;
  environment: 'node' | 'jsdom';
  sandboxPath: string;
  setupPath?: string;
}): string {
  const aliasBlock = buildAliasBlock(options.aliases);
  const includeArray = buildIncludeArray(options.testFiles);
  // Use relative path for setup file — absolute paths break Vite's /@fs resolution
  // when the sandbox is in /tmp (macOS /var → /private/var symlink issues)
  const setupLine = options.setupPath
    ? `\n    setupFiles: [${JSON.stringify('./vitest.setup.ts')}],`
    : '';

  return `import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: ${aliasBlock},
  },
  test: {
    root: ${JSON.stringify(options.sandboxPath)},
    include: ${includeArray},
    environment: ${JSON.stringify(options.environment)},
    globals: true,
    testTimeout: ${options.timeout},${setupLine}
  },
});
`;
}

function buildSetupSource(): string {
  return `import '@testing-library/jest-dom';
`;
}

async function safeUnlink(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      'code' in err &&
      (err as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return; // Already deleted — idempotent
    }
    throw err;
  }
}

export async function generateSandboxConfig(
  options: SandboxConfigOptions,
): Promise<GeneratedConfig> {
  const {
    sandboxPath,
    aliases,
    testFiles,
    timeout = DEFAULT_TIMEOUT,
    environment = 'node',
  } = options;

  const configPath = join(sandboxPath, 'vitest.config.ts');
  const filesToClean: string[] = [configPath];

  let setupPath: string | undefined;

  // Merge user aliases with any extra aliases needed for the environment
  const mergedAliases = { ...aliases };

  if (environment === 'jsdom') {
    setupPath = join(sandboxPath, 'vitest.setup.ts');
    await writeFile(setupPath, buildSetupSource(), 'utf-8');
    filesToClean.push(setupPath);

    // The setup file imports @testing-library/jest-dom, which won't be in the
    // user-scanned aliases. Ensure it resolves to the monorepo's node_modules.
    if (!mergedAliases['@testing-library/jest-dom']) {
      // Check workspace-local node_modules first (pnpm hoists devDeps there)
      const corePath = resolve(options.monorepoRoot, 'packages/core/node_modules/@testing-library/jest-dom');
      const rootPath = resolve(options.monorepoRoot, 'node_modules/@testing-library/jest-dom');
      mergedAliases['@testing-library/jest-dom'] = existsSync(corePath) ? corePath : rootPath;
    }
  }

  const configSource = buildConfigSource({
    aliases: mergedAliases,
    testFiles,
    timeout,
    environment,
    sandboxPath,
    setupPath,
  });

  await writeFile(configPath, configSource, 'utf-8');

  return {
    configPath,
    setupPath,
    cleanup: async () => {
      for (const f of filesToClean) {
        await safeUnlink(f);
      }
    },
  };
}
