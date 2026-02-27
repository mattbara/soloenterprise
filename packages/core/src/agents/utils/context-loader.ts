/**
 * Context Loader
 *
 * Loads relevant codebase files to inject into the agent prompt.
 * This gives the agent awareness of the database schema and existing patterns.
 *
 * Supports context profiles for selective loading to reduce token consumption.
 */

import { readFile } from 'fs/promises';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ContextConfig, ContextProfileName, ProfileSelectionOptions } from './context-profiles';
import { selectContextProfile, getContextConfig } from './context-profiles';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Max lines before truncating a file
const MAX_LINES = 500;

// Approximate token estimation: 4 chars = 1 token
const CHARS_PER_TOKEN = 4;

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
 * Find the schema file using multiple candidate paths.
 * Mirrors the scaffolder's robust resolution approach.
 */
function findSchemaPath(): string | null {
  const repoRoot = getRepoRoot();
  const candidates = [
    resolve(repoRoot, 'packages', 'db', 'src', 'schema.ts'),
    resolve(process.cwd(), 'packages', 'db', 'src', 'schema.ts'),
    resolve(process.cwd(), '..', 'db', 'src', 'schema.ts'),
    resolve(process.cwd(), 'src', 'db', 'schema.ts'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  console.warn(`[ContextLoader] Schema not found. Tried:\n${candidates.map(c => `  - ${c}`).join('\n')}`);
  return null;
}

/**
 * Count table definitions in schema content (export const X = pgTable patterns).
 */
function countTablesInSchema(content: string): number {
  const matches = content.match(/export const \w+\s*=\s*pgTable/g);
  return matches ? matches.length : 0;
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

  // 1. Always load the database schema (multi-candidate resolution)
  const schemaFullPath = findSchemaPath();
  if (schemaFullPath) {
    const schemaContent = await safeReadFile(schemaFullPath);
    // Derive display path relative to repo root
    const schemaPath = schemaFullPath.startsWith(repoRoot)
      ? schemaFullPath.slice(repoRoot.length + 1)
      : schemaFullPath;
    if (schemaContent) {
      context.schema = {
        path: schemaPath,
        content: truncateContent(schemaContent, schemaPath),
      };
    }
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

// ============================================================================
// Profile-Based Context Loading
// ============================================================================

export interface ProfiledContextResult {
  content: string;
  profile: ContextProfileName;
  tokens: number;
  schemaIncluded: boolean;
  tablesLoaded: number;
  routeExamplesLoaded: number;
  serviceExamplesLoaded: number;
}

/**
 * Filters schema content to only include specified tables.
 * Parses Drizzle ORM schema format: export const tableName = pgTable('...')
 */
function filterSchemaToTables(fullSchema: string, tables: string[]): string {
  const lines = fullSchema.split('\n');
  const relevantLines: string[] = [];
  let inRelevantTable = false;
  let braceDepth = 0;

  // Always include imports at the top
  for (const line of lines) {
    if (line.startsWith('import ')) {
      relevantLines.push(line);
    }
  }

  if (relevantLines.length > 0) {
    relevantLines.push('');
    relevantLines.push('// ... filtered to relevant tables ...');
    relevantLines.push('');
  }

  for (const line of lines) {
    // Check if line starts a table definition
    const tableMatch = line.match(/export const (\w+)\s*=\s*pgTable/);
    if (tableMatch) {
      const tableName = tableMatch[1];
      inRelevantTable = tables.some(
        (t) => tableName.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(tableName.toLowerCase())
      );
      if (inRelevantTable) {
        braceDepth = 0;
      }
    }

    if (inRelevantTable) {
      relevantLines.push(line);

      // Track brace depth to know when table definition ends
      for (const char of line) {
        if (char === '(') braceDepth++;
        if (char === ')') braceDepth--;
      }

      // Check for table definition end (closing paren at depth 0)
      if (braceDepth === 0 && line.includes(');')) {
        inRelevantTable = false;
        relevantLines.push(''); // Add spacing
      }
    }
  }

  return relevantLines.join('\n');
}

/**
 * Build context using a profile configuration.
 * Selectively loads schema and examples based on task type.
 */
export async function buildContextWithProfile(
  taskDescription: string,
  overrideProfile?: ContextProfileName,
  selectionOptions?: ProfileSelectionOptions
): Promise<ProfiledContextResult> {
  const profile = overrideProfile ?? selectContextProfile(taskDescription, selectionOptions);
  const config = getContextConfig(profile, taskDescription);

  console.log(`[ContextLoader] Using profile: ${profile}`);

  // Load raw context (uses cache)
  if (!cachedContext) {
    cachedContext = await loadCodebaseContext();
  }

  const sections: string[] = [];
  let tablesLoaded = 0;
  let routeExamplesLoaded = 0;
  let serviceExamplesLoaded = 0;

  sections.push('## Codebase Context\n');
  sections.push('Use the following codebase context to understand existing patterns. Follow these patterns in your implementation.\n');

  // Schema - only if config says so
  if (config.includeSchema && cachedContext.schema) {
    if (config.schemaTablesFilter && config.schemaTablesFilter.length > 0) {
      // Filter to relevant tables only
      const filteredSchema = filterSchemaToTables(cachedContext.schema.content, config.schemaTablesFilter);
      sections.push(`### Database Schema (Relevant Tables: ${config.schemaTablesFilter.join(', ')})\n`);
      sections.push('```typescript');
      sections.push(filteredSchema);
      sections.push('```\n');
      tablesLoaded = config.schemaTablesFilter.length;
      console.log(`[ContextLoader] Loaded ${tablesLoaded} tables: ${config.schemaTablesFilter.join(', ')}`);
    } else {
      // Full schema
      sections.push(`### Database Schema (${cachedContext.schema.path})\n`);
      sections.push('```typescript');
      sections.push(cachedContext.schema.content);
      sections.push('```\n');
      tablesLoaded = countTablesInSchema(cachedContext.schema.content);
      console.log(`[ContextLoader] Loaded full schema (${tablesLoaded} tables)`);
    }
  }

  // Route examples - only if config says so
  if (config.includeRouteExamples && cachedContext.routeExamples.length > 0) {
    const limited = cachedContext.routeExamples.slice(0, config.maxExamples);
    routeExamplesLoaded = limited.length;

    sections.push('### Existing Route Patterns\n');
    sections.push('Follow these patterns when creating new API routes:\n');

    for (const example of limited) {
      sections.push(`#### ${example.path}\n`);
      sections.push('```typescript');
      sections.push(example.content);
      sections.push('```\n');
    }
    console.log(`[ContextLoader] Loaded ${routeExamplesLoaded} route examples`);
  }

  // Service examples - only if config says so
  if (config.includeServiceExamples && cachedContext.serviceExamples.length > 0) {
    const limited = cachedContext.serviceExamples.slice(0, config.maxExamples);
    serviceExamplesLoaded = limited.length;

    sections.push('### Existing Service Patterns\n');
    sections.push('Follow these patterns when creating new services:\n');

    for (const example of limited) {
      sections.push(`#### ${example.path}\n`);
      sections.push('```typescript');
      sections.push(example.content);
      sections.push('```\n');
    }
    console.log(`[ContextLoader] Loaded ${serviceExamplesLoaded} service examples`);
  }

  sections.push('---\n');

  const content = sections.join('\n');
  const tokens = Math.ceil(content.length / CHARS_PER_TOKEN);

  console.log(`[ContextLoader] Profile ${profile}: ~${tokens} tokens`);

  return {
    content,
    profile,
    tokens,
    schemaIncluded: config.includeSchema,
    tablesLoaded,
    routeExamplesLoaded,
    serviceExamplesLoaded,
  };
}

/**
 * Get empty context result for profiles that don't need any context.
 */
export function getEmptyContextResult(profile: ContextProfileName): ProfiledContextResult {
  return {
    content: '',
    profile,
    tokens: 0,
    schemaIncluded: false,
    tablesLoaded: 0,
    routeExamplesLoaded: 0,
    serviceExamplesLoaded: 0,
  };
}
