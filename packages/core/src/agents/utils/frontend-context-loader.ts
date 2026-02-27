/**
 * Frontend Context Loader
 *
 * Loads component examples, hooks, and API patterns for frontend agent prompts.
 * Separate from backend context loader for clean separation.
 */

import { readFile, readdir } from 'fs/promises';
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
  apiPatterns: Array<{ path: string; content: string }>;
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
 * Discover hook files dynamically by scanning src/hooks/ directory.
 * Falls back gracefully if directory doesn't exist.
 */
async function discoverHookFiles(repoRoot: string): Promise<string[]> {
  const hooksDir = resolve(repoRoot, 'src/hooks');
  try {
    const entries = await readdir(hooksDir);
    return entries
      .filter(f => f.endsWith('.ts') || f.endsWith('.tsx'))
      .filter(f => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'))
      .map(f => `src/hooks/${f}`);
  } catch {
    return [];
  }
}

/**
 * Load frontend codebase context.
 */
export async function loadFrontendCodebaseContext(): Promise<FrontendCodebaseContext> {
  const repoRoot = getRepoRoot();

  const context: FrontendCodebaseContext = {
    componentExamples: [],
    hookExamples: [],
    apiPatterns: [],
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

  // Hook examples - dynamically discover from src/hooks/
  const hookFiles = await discoverHookFiles(repoRoot);

  for (const hookPath of hookFiles) {
    const content = await safeReadFile(resolve(repoRoot, hookPath));
    if (content) {
      context.hookExamples.push({
        path: hookPath,
        content: truncateContent(content, hookPath),
      });
    }
  }

  // API pattern files - query client config, API helpers, server actions
  const apiPatternFiles = [
    'src/lib/query-client.ts',
    'src/lib/api.ts',
    'src/lib/actions.ts',
  ];

  for (const apiPath of apiPatternFiles) {
    const content = await safeReadFile(resolve(repoRoot, apiPath));
    if (content) {
      context.apiPatterns.push({
        path: apiPath,
        content: truncateContent(content, apiPath),
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
  apiPatternsLoaded: number;
}

/**
 * Fallback conventions injected when api-consumer or full-feature profile
 * is active but no project API pattern files were found.
 * Ensures agents always get data fetching guidance.
 */
const FALLBACK_API_CONVENTIONS = `### Data Fetching Conventions (Reference: docs/ANTIPATTERNS.md)

**Decision tree (in order of preference):**
1. Server Component — async function, fetch/ORM directly (zero client JS)
2. \`use()\` + Suspense — pass promise from Server Component to Client Component
3. TanStack Query \`useQuery\` — for client-side data needs (cache, refetch, optimistic)
4. useEffect — last resort, document why alternatives don't apply

**Server Component (default):**
\`\`\`typescript
export default async function Page() {
  const data = await db.query.items.findMany();
  return <ItemList items={data} />;
}
\`\`\`

**TanStack Query (client-side):**
\`\`\`typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// queryKey conventions: ['entity'], ['entity', id], ['entity', { filter }]
const { data, isLoading, error } = useQuery({
  queryKey: ['items'],
  queryFn: () => fetch('/api/items').then(r => r.json()),
  staleTime: 5 * 60 * 1000,
});
\`\`\`

**Mutations — prefer Server Actions for forms:**
\`\`\`typescript
'use server';
import { revalidatePath } from 'next/cache';

export async function createItem(formData: FormData) {
  await db.insert(items).values({ name: formData.get('name') });
  revalidatePath('/items');
}
\`\`\`

**React 19 hooks:**
- \`useActionState\` — form submission lifecycle (replaces useState trio)
- \`useOptimistic\` — instant UI feedback during mutations

**Cost rules:**
- No polling (no setInterval, no aggressive refetchInterval)
- No client-side fetch on mount (use Server Components)
- Return data from mutations, don't re-fetch
- Use \`router.refresh()\` for server-side revalidation (free)
`;

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
  let apiPatternsLoaded = 0;

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

  // API patterns — only when config.includeApiPatterns is true
  if (config.includeApiPatterns) {
    if (cachedFrontendContext.apiPatterns.length > 0) {
      const limited = cachedFrontendContext.apiPatterns.slice(0, config.maxExamples);
      apiPatternsLoaded = limited.length;

      sections.push('### Existing API Patterns\n');
      for (const example of limited) {
        sections.push(`#### ${example.path}\n`);
        sections.push('```typescript');
        sections.push(example.content);
        sections.push('```\n');
      }
      console.log(`[FrontendContextLoader] Loaded ${apiPatternsLoaded} API pattern files`);
    } else {
      // Fallback: no project files found, inject conventions
      sections.push(FALLBACK_API_CONVENTIONS);
      apiPatternsLoaded = -1; // Sentinel: conventions injected, not project files
      console.log(`[FrontendContextLoader] No project API files found, injected fallback conventions`);
    }
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
    apiPatternsLoaded,
  };
}

export function getEmptyFrontendContextResult(profile: FrontendContextProfileName): FrontendProfiledContextResult {
  return {
    content: '',
    profile,
    tokens: 0,
    componentExamplesLoaded: 0,
    hookExamplesLoaded: 0,
    apiPatternsLoaded: 0,
  };
}

export function clearFrontendContextCache(): void {
  cachedFrontendContext = null;
}
