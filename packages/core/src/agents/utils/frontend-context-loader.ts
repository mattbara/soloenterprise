/**
 * Frontend Context Loader
 *
 * Loads component examples and patterns for frontend agent prompts.
 * Separate from backend context loader for clean separation.
 */

import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { FrontendContextConfig, FrontendContextProfileName } from './frontend-context-profiles';
import { selectFrontendContextProfile, getFrontendContextConfig } from './frontend-context-profiles';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAX_LINES = 300;
const CHARS_PER_TOKEN = 4;

export interface FrontendCodebaseContext {
  componentExamples: Array<{ path: string; content: string }>;
  hookExamples: Array<{ path: string; content: string }>;
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
  return `${lines.slice(0, MAX_LINES).join('\n')}\n\n// ... truncated, see ${filePath}`;
}

/**
 * Load frontend codebase context.
 */
export async function loadFrontendCodebaseContext(): Promise<FrontendCodebaseContext> {
  const repoRoot = getRepoRoot();

  const context: FrontendCodebaseContext = {
    componentExamples: [],
    hookExamples: [],
  };

  // Component examples - look for existing components in the codebase
  const componentFiles = [
    'src/components/StatusBadge.tsx',
    'src/components/Modal.tsx',
    'src/components/Button.tsx',
  ];

  for (const compPath of componentFiles) {
    const content = await safeReadFile(resolve(repoRoot, compPath));
    if (content) {
      context.componentExamples.push({
        path: compPath,
        content: truncateContent(content, compPath),
      });
    }
  }

  // Hook examples - look for existing hooks
  const hookFiles = [
    'src/hooks/use-tasks.ts',
    'src/hooks/use-projects.ts',
  ];

  for (const hookPath of hookFiles) {
    const content = await safeReadFile(resolve(repoRoot, hookPath));
    if (content) {
      context.hookExamples.push({
        path: hookPath,
        content: truncateContent(content, hookPath),
      });
    }
  }

  return context;
}

// Cache
let cachedFrontendContext: FrontendCodebaseContext | null = null;

export interface FrontendProfiledContextResult {
  content: string;
  profile: FrontendContextProfileName;
  tokens: number;
  componentExamplesLoaded: number;
  hookExamplesLoaded: number;
}

/**
 * Build frontend context using a profile configuration.
 */
export async function buildFrontendContextWithProfile(
  taskDescription: string,
  overrideProfile?: FrontendContextProfileName
): Promise<FrontendProfiledContextResult> {
  const profile = overrideProfile ?? selectFrontendContextProfile(taskDescription);
  const config = getFrontendContextConfig(profile);

  console.log(`[FrontendContextLoader] Using profile: ${profile}`);

  if (!cachedFrontendContext) {
    cachedFrontendContext = await loadFrontendCodebaseContext();
  }

  const sections: string[] = [];
  let componentExamplesLoaded = 0;
  let hookExamplesLoaded = 0;

  sections.push('## Frontend Codebase Context\n');
  sections.push('Follow these existing patterns in your implementation.\n');

  // Component examples
  if (config.includeComponentExamples && cachedFrontendContext.componentExamples.length > 0) {
    const limited = cachedFrontendContext.componentExamples.slice(0, config.maxExamples);
    componentExamplesLoaded = limited.length;

    sections.push('### Existing Component Patterns\n');
    for (const example of limited) {
      sections.push(`#### ${example.path}\n`);
      sections.push('```typescript');
      sections.push(example.content);
      sections.push('```\n');
    }
    console.log(`[FrontendContextLoader] Loaded ${componentExamplesLoaded} component examples`);
  }

  // Hook examples
  if (config.includeHookExamples && cachedFrontendContext.hookExamples.length > 0) {
    const limited = cachedFrontendContext.hookExamples.slice(0, config.maxExamples);
    hookExamplesLoaded = limited.length;

    sections.push('### Existing Hook Patterns\n');
    for (const example of limited) {
      sections.push(`#### ${example.path}\n`);
      sections.push('```typescript');
      sections.push(example.content);
      sections.push('```\n');
    }
    console.log(`[FrontendContextLoader] Loaded ${hookExamplesLoaded} hook examples`);
  }

  sections.push('---\n');

  const content = sections.join('\n');
  const tokens = Math.ceil(content.length / CHARS_PER_TOKEN);

  console.log(`[FrontendContextLoader] Profile ${profile}: ~${tokens} tokens`);

  return {
    content,
    profile,
    tokens,
    componentExamplesLoaded,
    hookExamplesLoaded,
  };
}

export function getEmptyFrontendContextResult(profile: FrontendContextProfileName): FrontendProfiledContextResult {
  return {
    content: '',
    profile,
    tokens: 0,
    componentExamplesLoaded: 0,
    hookExamplesLoaded: 0,
  };
}

export function clearFrontendContextCache(): void {
  cachedFrontendContext = null;
}
