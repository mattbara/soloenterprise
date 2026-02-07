/**
 * QA Context Loader
 *
 * Loads source files, existing test patterns, and schema for QA agent prompts.
 * QA context is different from backend/frontend - it focuses on the code TO TEST,
 * not on route/service examples.
 *
 * Also loads generated files from dependency tasks (e.g., backend/frontend tasks)
 * so QA can see the code it needs to test.
 */

import { readFile, readdir } from 'fs/promises';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readdirSync, statSync, readFileSync } from 'fs';
import { db } from '@soloenterprise/db';
import { tasks } from '@soloenterprise/db/schema';
import { eq, inArray } from 'drizzle-orm';

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
  dependencyArtifactsLoaded: number;
}

interface DependencyArtifact {
  taskId: string;
  taskName: string;
  filePath: string;
  content: string;
}

function getRepoRoot(): string {
  // From packages/core/src/agents/utils -> repo root
  return resolve(__dirname, '../../../../../');
}

/**
 * Get the generated files directory for a task.
 */
function getGeneratedTaskDir(taskId: string): string {
  // From packages/core/src/agents/utils -> packages/core/generated/tasks/{taskId}
  return resolve(__dirname, '../../../generated/tasks', taskId);
}

/**
 * Recursively get all files in a directory (synchronous version).
 */
function getAllFilesSync(dir: string): string[] {
  const files: string[] = [];

  if (!existsSync(dir)) return files;

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...getAllFilesSync(fullPath));
      } else {
        files.push(fullPath);
      }
    }
  } catch {
    // Ignore errors
  }

  return files;
}

/**
 * Load generated files from dependency tasks.
 * This allows QA to see the code it needs to test.
 */
async function loadDependencyArtifacts(taskId: string): Promise<DependencyArtifact[]> {
  // Get the task and its dependencies
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
  });

  if (!task) {
    console.log(`[QAContextLoader] Task ${taskId} not found`);
    return [];
  }

  const deps = task.dependsOn as string[] | null;
  if (!deps || deps.length === 0) {
    console.log('[QAContextLoader] Task has no dependencies');
    return [];
  }

  console.log(`[QAContextLoader] Loading artifacts from ${deps.length} dependency task(s)`);

  const results: DependencyArtifact[] = [];

  // Get dependency task info
  const depTasks = await db.query.tasks.findMany({
    where: inArray(tasks.id, deps),
  });

  for (const depTask of depTasks) {
    // Read files from generated/tasks/{depTaskId}/
    const taskDir = getGeneratedTaskDir(depTask.id);

    if (!existsSync(taskDir)) {
      console.log(`[QAContextLoader] No generated files for dependency ${depTask.id} (${depTask.name})`);
      continue;
    }

    // Read all generated files
    const files = getAllFilesSync(taskDir);

    for (const filePath of files) {
      // Skip manifest.json and other non-source files
      if (filePath.endsWith('manifest.json')) continue;
      // Skip existing test files
      if (filePath.includes('.test.') || filePath.includes('.spec.')) continue;
      // Skip hidden files
      if (filePath.split('/').pop()?.startsWith('.')) continue;

      try {
        const content = readFileSync(filePath, 'utf-8');
        const relativePath = filePath.replace(taskDir + '/', '');

        results.push({
          taskId: depTask.id,
          taskName: depTask.name,
          filePath: relativePath,
          content,
        });

        console.log(`[QAContextLoader] Loaded dependency artifact: ${relativePath} from "${depTask.name}"`);
      } catch (err) {
        console.error(`[QAContextLoader] Failed to read ${filePath}:`, err);
      }
    }
  }

  return results;
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
 *
 * @param taskDescription - The task description
 * @param explicitSourceFiles - Optional explicit source file paths
 * @param taskId - Optional task ID to load dependency artifacts
 */
export async function buildQAContext(
  taskDescription: string,
  explicitSourceFiles?: string[],
  taskId?: string
): Promise<QAContextResult> {
  const repoRoot = getRepoRoot();

  // 1. Determine source files to load
  const inferredFiles = extractSourceFilePaths(taskDescription);
  const filesToLoad = explicitSourceFiles?.length ? explicitSourceFiles : inferredFiles;

  // 2. Load source files from codebase
  const sourceFiles = await loadSourceFiles(repoRoot, filesToLoad);

  // 3. Load artifacts from dependency tasks (CRITICAL for QA to see generated code)
  let dependencyArtifacts: DependencyArtifact[] = [];
  if (taskId) {
    dependencyArtifacts = await loadDependencyArtifacts(taskId);
    console.log(`[QAContextLoader] Loaded ${dependencyArtifacts.length} files from dependencies`);
  }

  // 4. Load existing test patterns
  const existingTestPatterns = await findExistingTestPatterns(repoRoot);

  // 5. Load test config
  const testConfig = await loadTestConfig(repoRoot);

  // 6. Load schema if task involves data operations
  const needsSchema = /database|db|schema|model|entity|data|crud/i.test(taskDescription);
  const schema = needsSchema ? await loadSchema(repoRoot) : null;

  // Build context content
  const sections: string[] = [];

  sections.push('## QA Testing Context\n');

  // Dependency artifacts (MOST IMPORTANT - these are the files QA needs to test)
  if (dependencyArtifacts.length > 0) {
    sections.push('### Source Files From Dependencies\n');
    sections.push('**IMPORTANT:** These are the files you need to write tests for. They were generated by previous tasks.\n\n');

    for (const artifact of dependencyArtifacts) {
      sections.push(`#### ${artifact.filePath}\n`);
      sections.push(`*From task: "${artifact.taskName}"*\n`);
      sections.push('```typescript');
      sections.push(artifact.content);
      sections.push('```\n');
    }
  }

  // Source files from codebase
  if (sourceFiles.length > 0) {
    sections.push('### Source Files from Codebase\n');
    sections.push('Additional files from the existing codebase:\n');

    for (const file of sourceFiles) {
      sections.push(`#### ${file.path}\n`);
      sections.push('```typescript');
      sections.push(file.content);
      sections.push('```\n');
    }
  }

  // Warning if no source files at all
  if (dependencyArtifacts.length === 0 && sourceFiles.length === 0) {
    sections.push('### Source Files\n');
    sections.push('**WARNING:** No source files were loaded from dependencies or codebase. You may need to ask for specific file paths or check if dependency tasks have completed.\n');
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

  // Calculate dependency artifact tokens
  const dependencyTokens = dependencyArtifacts.reduce(
    (sum, a) => sum + Math.ceil(a.content.length / CHARS_PER_TOKEN),
    0
  );

  console.log(`[QAContextLoader] Loaded ${sourceFiles.length} codebase files, ${dependencyArtifacts.length} dependency artifacts (~${dependencyTokens} tokens), total ~${tokens} tokens`);

  return {
    content,
    tokens,
    sourceFilesLoaded: sourceFiles.length,
    hasExistingTests: existingTestPatterns !== null,
    hasSchema: schema !== null,
    dependencyArtifactsLoaded: dependencyArtifacts.length,
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
    dependencyArtifactsLoaded: 0,
  };
}
