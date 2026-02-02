/**
 * QA Context Loader
 *
 * Loads source files, existing test patterns, and schema for QA agent prompts.
 * QA context is different from backend/frontend - it focuses on the code TO TEST,
 * not on route/service examples.
 */

import { readFile, readdir } from 'fs/promises';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAX_LINES = 500;
const CHARS_PER_TOKEN = 4;

export interface QAContext {
  sourceFiles: Array<{ path: string; content: string }>;
  existingTestPatterns?: string;
  schema?: string;
  testFrameworkConfig?: string;
}

export interface QAContextResult {
  content: string;
  tokens: number;
  sourceFilesLoaded: number;
  hasExistingTests: boolean;
  hasSchema: boolean;
}

function getRepoRoot(): string {
  // From packages/core/src/agents/utils -> repo root
  return resolve(__dirname, '../../../../../');
}

async function safeReadFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function truncateContent(content: string, filePath: string): string {
  const lines = content.split('\n');
  if (lines.length <= MAX_LINES) return content;
  return `${lines.slice(0, MAX_LINES).join('\n')}\n\n// ... truncated (${lines.length - MAX_LINES} more lines), see ${filePath}`;
}

/**
 * Extract source file paths from task description.
 * Looks for patterns like "test UserService" -> "user-service.ts"
 * or explicit file paths in the description.
 */
function extractSourceFilePaths(description: string): string[] {
  const paths: string[] = [];

  // Look for explicit file paths (src/..., packages/...)
  const filePathRegex = /(?:src|packages)\/[\w\-\/]+\.(?:ts|tsx)/gi;
  const explicitPaths = description.match(filePathRegex) || [];
  paths.push(...explicitPaths);

  return [...new Set(paths)];
}

/**
 * Recursively find files in a directory matching a pattern.
 */
async function findFiles(
  dir: string,
  pattern: RegExp,
  maxDepth: number = 4,
  currentDepth: number = 0,
  ignore: string[] = ['node_modules', 'generated', '.next', '.git']
): Promise<string[]> {
  if (currentDepth >= maxDepth) return [];

  const results: string[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip ignored directories
        if (ignore.includes(entry.name)) continue;

        const subResults = await findFiles(fullPath, pattern, maxDepth, currentDepth + 1, ignore);
        results.push(...subResults);
      } else if (entry.isFile() && pattern.test(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch {
    // Ignore errors (permission denied, etc.)
  }

  return results;
}

/**
 * Find existing test files to understand patterns.
 */
async function findExistingTestPatterns(repoRoot: string): Promise<string | null> {
  try {
    // Look for test files
    const testPattern = /\.test\.(ts|tsx)$/;
    const testFiles = await findFiles(repoRoot, testPattern, 5);

    if (testFiles.length === 0) return null;

    // Get relative path and read first test file
    const firstTestPath = testFiles[0];
    const relativePath = firstTestPath.replace(repoRoot + '/', '');
    const content = await safeReadFile(firstTestPath);
    if (!content) return null;

    // Truncate to first 100 lines
    const lines = content.split('\n');
    const truncated = lines.slice(0, 100).join('\n');

    return `Example from ${relativePath}:\n\`\`\`typescript\n${truncated}\n\`\`\``;
  } catch {
    return null;
  }
}

/**
 * Load vitest config if it exists.
 */
async function loadTestConfig(repoRoot: string): Promise<string | null> {
  const configPaths = [
    'vitest.config.ts',
    'vitest.config.js',
    'vite.config.ts', // Vitest can be configured in Vite config
  ];

  for (const configPath of configPaths) {
    const content = await safeReadFile(resolve(repoRoot, configPath));
    if (content) {
      return `${configPath}:\n\`\`\`typescript\n${content}\n\`\`\``;
    }
  }

  return null;
}

/**
 * Load source files for testing.
 */
async function loadSourceFiles(
  repoRoot: string,
  filePaths: string[]
): Promise<Array<{ path: string; content: string }>> {
  const sourceFiles: Array<{ path: string; content: string }> = [];

  for (const filePath of filePaths) {
    const fullPath = resolve(repoRoot, filePath);
    const content = await safeReadFile(fullPath);
    if (content) {
      sourceFiles.push({
        path: filePath,
        content: truncateContent(content, filePath),
      });
    }
  }

  return sourceFiles;
}

/**
 * Load database schema for data shape validation.
 */
async function loadSchema(repoRoot: string): Promise<string | null> {
  const schemaPath = 'packages/db/src/schema.ts';
  const content = await safeReadFile(resolve(repoRoot, schemaPath));
  if (!content) return null;

  return truncateContent(content, schemaPath);
}

/**
 * Build QA context for the agent.
 */
export async function buildQAContext(
  taskDescription: string,
  explicitSourceFiles?: string[]
): Promise<QAContextResult> {
  const repoRoot = getRepoRoot();

  // 1. Determine source files to load
  const inferredFiles = extractSourceFilePaths(taskDescription);
  const filesToLoad = explicitSourceFiles?.length ? explicitSourceFiles : inferredFiles;

  // 2. Load source files
  const sourceFiles = await loadSourceFiles(repoRoot, filesToLoad);

  // 3. Load existing test patterns
  const existingTestPatterns = await findExistingTestPatterns(repoRoot);

  // 4. Load test config
  const testConfig = await loadTestConfig(repoRoot);

  // 5. Load schema if task involves data operations
  const needsSchema = /database|db|schema|model|entity|data|crud/i.test(taskDescription);
  const schema = needsSchema ? await loadSchema(repoRoot) : null;

  // Build context content
  const sections: string[] = [];

  sections.push('## QA Testing Context\n');

  // Source files (most important for QA)
  if (sourceFiles.length > 0) {
    sections.push('### Source Files to Test\n');
    sections.push('These are the files you need to write tests for:\n');

    for (const file of sourceFiles) {
      sections.push(`#### ${file.path}\n`);
      sections.push('```typescript');
      sections.push(file.content);
      sections.push('```\n');
    }
  } else {
    sections.push('### Source Files\n');
    sections.push('**WARNING:** No source files were loaded. You may need to ask for specific file paths.\n');
  }

  // Existing test patterns
  if (existingTestPatterns) {
    sections.push('### Existing Test Patterns\n');
    sections.push('Follow these existing patterns in this project:\n');
    sections.push(existingTestPatterns);
    sections.push('');
  }

  // Test config
  if (testConfig) {
    sections.push('### Test Framework Configuration\n');
    sections.push(testConfig);
    sections.push('');
  }

  // Schema for data shapes
  if (schema) {
    sections.push('### Database Schema (for data shapes)\n');
    sections.push('```typescript');
    sections.push(schema);
    sections.push('```\n');
  }

  sections.push('---\n');

  const content = sections.join('\n');
  const tokens = Math.ceil(content.length / CHARS_PER_TOKEN);

  console.log(`[QAContextLoader] Loaded ${sourceFiles.length} source files, ~${tokens} tokens`);

  return {
    content,
    tokens,
    sourceFilesLoaded: sourceFiles.length,
    hasExistingTests: existingTestPatterns !== null,
    hasSchema: schema !== null,
  };
}

/**
 * Get empty context result.
 */
export function getEmptyQAContextResult(): QAContextResult {
  return {
    content: '',
    tokens: 0,
    sourceFilesLoaded: 0,
    hasExistingTests: false,
    hasSchema: false,
  };
}
