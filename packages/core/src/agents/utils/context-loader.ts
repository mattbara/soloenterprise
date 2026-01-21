/**
 * Context Loader
 *
 * Loads relevant codebase files to inject into the agent prompt.
 * This gives the agent awareness of the database schema and existing patterns.
 */

import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Max lines before truncating a file
const MAX_LINES = 500;

export interface CodebaseContext {
  schema: { path: string; content: string } | null;
  routeExamples: Array<{ path: string; content: string }>;
  serviceExamples: Array<{ path: string; content: string }>;
}

/**
 * Determine the repository root directory.
 */
function getRepoRoot(): string {
  // From packages/core/src/agents/utils -> repo root
  return resolve(__dirname, '../../../../../');
}

/**
 * Safely read a file, returning null if it doesn't exist.
 */
async function safeReadFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Truncate content if it exceeds max lines.
 */
function truncateContent(content: string, filePath: string): string {
  const lines = content.split('\n');
  if (lines.length <= MAX_LINES) {
    return content;
  }

  const truncated = lines.slice(0, MAX_LINES).join('\n');
  return `${truncated}\n\n// ... truncated (${lines.length - MAX_LINES} more lines), see full file at ${filePath}`;
}

/**
 * Load codebase context for injection into agent prompts.
 */
export async function loadCodebaseContext(): Promise<CodebaseContext> {
  const repoRoot = getRepoRoot();

  const context: CodebaseContext = {
    schema: null,
    routeExamples: [],
    serviceExamples: [],
  };

  // 1. Always load the database schema
  const schemaPath = 'packages/db/src/schema.ts';
  const schemaContent = await safeReadFile(resolve(repoRoot, schemaPath));
  if (schemaContent) {
    context.schema = {
      path: schemaPath,
      content: truncateContent(schemaContent, schemaPath),
    };
  }

  // 2. Load route examples (pick 2 representative ones)
  const routeFiles = [
    'src/app/api/projects/route.ts',
    'src/app/api/tasks/route.ts',
  ];

  for (const routePath of routeFiles) {
    const content = await safeReadFile(resolve(repoRoot, routePath));
    if (content) {
      context.routeExamples.push({
        path: routePath,
        content: truncateContent(content, routePath),
      });
    }
  }

  // 3. Load service examples (pick 1-2 representative ones)
  const serviceFiles = [
    'packages/core/src/services/task-service.ts',
  ];

  for (const servicePath of serviceFiles) {
    const content = await safeReadFile(resolve(repoRoot, servicePath));
    if (content) {
      context.serviceExamples.push({
        path: servicePath,
        content: truncateContent(content, servicePath),
      });
    }
  }

  return context;
}

/**
 * Format the codebase context as markdown for injection into prompts.
 */
export function formatContextForPrompt(context: CodebaseContext): string {
  const sections: string[] = [];

  sections.push('## Codebase Context\n');
  sections.push('Use the following codebase context to understand existing patterns and schema. Follow these patterns in your implementation.\n');

  // Database schema (most important)
  if (context.schema) {
    sections.push(`### Database Schema (${context.schema.path})\n`);
    sections.push('```typescript');
    sections.push(context.schema.content);
    sections.push('```\n');
  }

  // Route examples
  if (context.routeExamples.length > 0) {
    sections.push('### Existing Route Patterns\n');
    sections.push('Follow these patterns when creating new API routes:\n');

    for (const example of context.routeExamples) {
      sections.push(`#### ${example.path}\n`);
      sections.push('```typescript');
      sections.push(example.content);
      sections.push('```\n');
    }
  }

  // Service examples
  if (context.serviceExamples.length > 0) {
    sections.push('### Existing Service Patterns\n');
    sections.push('Follow these patterns when creating new services:\n');

    for (const example of context.serviceExamples) {
      sections.push(`#### ${example.path}\n`);
      sections.push('```typescript');
      sections.push(example.content);
      sections.push('```\n');
    }
  }

  sections.push('---\n');

  return sections.join('\n');
}

// Cache the context to avoid re-reading files for every task
let cachedContext: CodebaseContext | null = null;
let cachedContextFormatted: string | null = null;

/**
 * Get formatted codebase context (cached).
 */
export async function getCodebaseContext(): Promise<string> {
  if (cachedContextFormatted) {
    return cachedContextFormatted;
  }

  cachedContext = await loadCodebaseContext();
  cachedContextFormatted = formatContextForPrompt(cachedContext);

  return cachedContextFormatted;
}

/**
 * Clear the cached context (useful for testing or when files change).
 */
export function clearContextCache(): void {
  cachedContext = null;
  cachedContextFormatted = null;
}
