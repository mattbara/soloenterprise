/**
 * Context Profiles
 *
 * Selectively loads schema and examples based on task type to reduce token consumption.
 * Expected reduction: 25-35% for simple tasks by avoiding full codebase context loading.
 *
 * Uses a 3-pass selection system to prevent false positives:
 *   Pass 1: Override keywords — short-circuit to a forced profile (e.g. scaffolding → simple-endpoint)
 *   Pass 2: Positive signal collection — existing keyword matching logic
 *   Pass 3: Negative signal demotion — cancel false-positive matches (e.g. "drizzle" + "setup" ≠ database-task)
 */

export interface ContextConfig {
  includeSchema: boolean;
  schemaTablesFilter?: string[]; // Only include these tables if specified
  includeRouteExamples: boolean;
  includeServiceExamples: boolean;
  includeTestExamples: boolean;
  maxExamples: number;
}

export type ContextProfileName = 'simple-endpoint' | 'database-task' | 'full-feature' | 'bug-fix';

export const CONTEXT_PROFILES: Record<ContextProfileName, ContextConfig> = {
  'simple-endpoint': {
    includeSchema: false,
    includeRouteExamples: true,
    includeServiceExamples: false,
    includeTestExamples: false,
    maxExamples: 1,
  },
  'database-task': {
    includeSchema: true,
    schemaTablesFilter: undefined, // Will be set dynamically based on task
    includeRouteExamples: false,
    includeServiceExamples: true,
    includeTestExamples: false,
    maxExamples: 1,
  },
  'full-feature': {
    includeSchema: true,
    includeRouteExamples: true,
    includeServiceExamples: true,
    includeTestExamples: true,
    maxExamples: 2,
  },
  'bug-fix': {
    includeSchema: false,
    includeRouteExamples: false,
    includeServiceExamples: false,
    includeTestExamples: false,
    maxExamples: 0,
  },
};

// ============================================================
// OVERRIDE KEYWORDS — checked FIRST, short-circuit all other matching
// ============================================================
// If ANY override keyword is found, the profile is forced regardless of other signals.
// Use narrow, multi-word phrases to avoid false positives.

interface ProfileOverride {
  keywords: string[];
  profile: ContextProfileName;
  description: string;
}

export const PROFILE_OVERRIDES: ProfileOverride[] = [
  // === FORCE SIMPLE (scaffolding/setup) ===
  {
    keywords: [
      'scaffolding', 'scaffold', 'project setup', 'base configuration',
      'boilerplate', 'project structure', 'folder structure', 'directory structure',
    ],
    profile: 'simple-endpoint',
    description: 'Scaffolding/setup tasks are always simple regardless of what they mention',
  },
  // === FORCE SIMPLE (config/tooling) ===
  {
    keywords: [
      'eslint config', 'prettier config', 'tsconfig', 'vitest config',
      'tailwind config', 'next config', 'configuration file', 'config setup',
      'linting setup', 'formatter setup',
    ],
    profile: 'simple-endpoint',
    description: 'Config/tooling tasks never need schema or full context',
  },
  // === FORCE BUG-FIX ===
  {
    keywords: ['hotfix', 'regression', 'revert'],
    profile: 'bug-fix',
    description: 'Hotfixes, regressions, and reverts are always bug-fix profile',
  },
];

// ============================================================
// NEGATIVE KEYWORDS — demote signals that would otherwise match
// ============================================================
// These keywords WEAKEN the signal of a candidate profile. They don't force a profile,
// but they cancel false-positive matches and demote to the simplest profile.

export const NEGATIVE_SIGNALS: Partial<Record<ContextProfileName, string[]>> = {
  // These keywords CANCEL database-task when paired with DB keywords.
  // Use narrow terms — "setup" is excluded because "database setup" IS a legit DB task.
  'database-task': [
    'scaffolding', 'scaffold', 'boilerplate', 'skeleton',
  ],
  // These keywords CANCEL full-feature when it would otherwise be selected.
  // Multi-word phrases only — single words like "simple" are too broad.
  'full-feature': [
    'single endpoint', 'simple endpoint', 'utility hook', 'helper function',
  ],
};

/**
 * Word-boundary keyword match. Prevents substring false positives
 * like "orm" matching "forms" or "table" matching "comfortable".
 */
function matchesWord(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
}

// Known table names from the schema for matching
const KNOWN_TABLES = [
  'projects',
  'tasks',
  'questions',
  'file_locks',
  'artifacts',
  'deployments',
  'agent_sessions',
];

/**
 * Optional signals for more accurate profile selection.
 * These supplement keyword matching with task metadata.
 */
export interface ProfileSelectionOptions {
  /** Task context/inputs — checked for database-related keywords */
  taskContext?: Record<string, unknown>;
  /** Agent types of tasks this task depends on */
  dependencyAgentTypes?: string[];
  /** Agent type executing this task — used to filter ambiguous keywords */
  agentType?: string;
}

/**
 * Selects appropriate context profile based on task description and optional signals.
 *
 * Uses a 3-pass selection system:
 *   Pass 1: Override keywords — short-circuit to a forced profile
 *   Pass 2: Positive signal collection — existing keyword matching logic
 *   Pass 3: Negative signal demotion — cancel false-positive matches
 */
export function selectContextProfile(
  taskDescription: string,
  options?: ProfileSelectionOptions
): ContextProfileName {
  const lower = taskDescription.toLowerCase();

  // ==============================
  // PASS 1: Check overrides (short-circuit)
  // ==============================
  for (const override of PROFILE_OVERRIDES) {
    const matchedKeyword = override.keywords.find(kw => matchesWord(lower, kw));
    if (matchedKeyword) {
      console.log(
        `[ContextProfiles] Override: "${override.description}" → ${override.profile} ` +
        `(keyword: "${matchedKeyword}") for: "${taskDescription.substring(0, 80)}"`
      );
      return override.profile;
    }
  }

  // ==============================
  // PASS 2: Positive signal collection (existing logic)
  // ==============================
  const bugSignals: string[] = [];
  const dbSignals: string[] = [];
  const simpleSignals: string[] = [];
  const fullSignals: string[] = [];

  // --- Bug fix signals (strict: multi-word phrases or clear intent) ---
  const BUG_PHRASES = [
    'fix bug', 'bug fix', 'bugfix', 'hotfix', 'broken',
    'regression', 'not working', "doesn't work", 'does not work',
  ];
  for (const phrase of BUG_PHRASES) {
    if (matchesWord(lower, phrase)) bugSignals.push(phrase);
  }
  // "fix the/this/a" implies fixing something broken, not building something new
  if (/\bfix (the|this|a|an)\b/.test(lower)) bugSignals.push('fix the/this/a');
  // Standalone "patch" only when not part of "dispatch" etc.
  if (/\bpatch\b/.test(lower)) bugSignals.push('patch');

  // --- Database/API signals (tasks needing schema + service patterns) ---
  // Keywords that are ambiguous for frontend agents (e.g. "table" = HTML table, "filter" = UI filter)
  const FRONTEND_AMBIGUOUS_KEYWORDS = new Set(['table', 'filter', 'query', 'paginate']);
  const isFrontend = options?.agentType === 'frontend';

  const DB_KEYWORDS = [
    'database', 'schema', 'drizzle', 'table', 'query', 'migration',
    'crud', 'orm', 'sql', 'paginate', 'filter', 'api route',
    'route handler', 'api endpoint', 'status enum',
  ];
  for (const kw of DB_KEYWORDS) {
    if (isFrontend && FRONTEND_AMBIGUOUS_KEYWORDS.has(kw)) continue;
    if (matchesWord(lower, kw)) dbSignals.push(kw);
  }
  // "REST" combined with API/endpoint/route implies CRUD
  if (/\brest\b/.test(lower) && /\b(api|endpoint|route)\b/.test(lower)) {
    dbSignals.push('rest+api/endpoint/route');
  }
  // Check known table names
  const mentionedTables = extractRelevantTables(taskDescription, KNOWN_TABLES);
  if (mentionedTables.length > 0) dbSignals.push(`tables:${mentionedTables.join(',')}`);

  // Check task context for database signals
  if (options?.taskContext) {
    const contextStr = JSON.stringify(options.taskContext).toLowerCase();
    const CONTEXT_DB_HINTS = ['drizzle', 'schema', 'database', 'table', 'orm', 'sql'];
    for (const hint of CONTEXT_DB_HINTS) {
      if (matchesWord(contextStr, hint)) dbSignals.push(`context:${hint}`);
    }
  }

  // Dependency signals: if task depends on backend tasks, likely needs schema
  if (options?.dependencyAgentTypes?.includes('backend')) {
    dbSignals.push('dep:backend');
  }

  // --- Simple endpoint signals ---
  const SIMPLE_KEYWORDS = [
    'health check', 'healthcheck', 'health endpoint', 'simple endpoint',
    'utility endpoint', 'helper endpoint', 'ping endpoint', 'ping',
    'readiness', 'liveness', 'status endpoint',
  ];
  for (const kw of SIMPLE_KEYWORDS) {
    if (matchesWord(lower, kw)) simpleSignals.push(kw);
  }

  // --- Full feature signals ---
  const FULL_KEYWORDS = [
    'full feature', 'complete feature', 'comprehensive',
    'admin panel', 'dashboard',
  ];
  for (const kw of FULL_KEYWORDS) {
    if (matchesWord(lower, kw)) fullSignals.push(kw);
  }
  if (
    (lower.includes('feature') && lower.includes('implement')) ||
    (lower.includes('create') && lower.includes('system'))
  ) {
    fullSignals.push('feature+implement or create+system');
  }

  // --- Selection with priority and conflict resolution ---
  let selected: ContextProfileName;
  let reason: string;
  let positiveKeyword = '';

  // Weak DB signals — generic web keywords that indicate "this is an API task" but
  // say nothing about needing database context. When these are the ONLY DB signals
  // present, they should NOT override simple-endpoint classification.
  const WEAK_DB_SIGNALS = new Set(['api route', 'route handler', 'api endpoint']);
  const hasOnlyWeakDbSignals = dbSignals.length > 0 && dbSignals.every(s => WEAK_DB_SIGNALS.has(s));

  if (simpleSignals.length > 0 && (dbSignals.length === 0 || hasOnlyWeakDbSignals) && fullSignals.length === 0) {
    selected = 'simple-endpoint';
    positiveKeyword = simpleSignals[0];
    reason = `Simple signals: [${simpleSignals.join(', ')}]${hasOnlyWeakDbSignals ? ` (weak DB signals ignored: [${dbSignals.join(', ')}])` : ''}`;
  } else if (bugSignals.length > 0 && dbSignals.length === 0 && fullSignals.length === 0) {
    selected = 'bug-fix';
    positiveKeyword = bugSignals[0];
    reason = `Bug signals: [${bugSignals.join(', ')}], no competing db/full signals`;
  } else if (dbSignals.length > 0) {
    selected = 'database-task';
    positiveKeyword = dbSignals[0];
    reason = `Database signals: [${dbSignals.join(', ')}]`;
  } else if (fullSignals.length > 0) {
    selected = 'full-feature';
    positiveKeyword = fullSignals[0];
    reason = `Full feature signals: [${fullSignals.join(', ')}]`;
  } else {
    selected = 'full-feature';
    reason = 'No clear signals, defaulting to full-feature for safety';
  }

  // ==============================
  // PASS 3: Check negative signals (demotion)
  // ==============================
  const negatives = NEGATIVE_SIGNALS[selected];
  if (negatives) {
    const matchedNeg = negatives.find(neg => matchesWord(lower, neg));
    if (matchedNeg) {
      const demotedFrom = selected;
      selected = 'simple-endpoint';
      console.log(
        `[ContextProfiles] Negative signal demoted "${demotedFrom}" → "simple-endpoint" ` +
        `(positive: "${positiveKeyword}", negative: "${matchedNeg}") ` +
        `for: "${taskDescription.substring(0, 80)}"`
      );
      return selected;
    }
  }

  console.log(
    `[ContextProfiles] Selected "${selected}". Reason: ${reason}. ` +
    `Signals: bug=[${bugSignals.join(',')}], db=[${dbSignals.join(',')}], ` +
    `simple=[${simpleSignals.join(',')}], full=[${fullSignals.join(',')}]`
  );

  return selected;
}

/**
 * Extracts relevant table names from task description.
 */
export function extractRelevantTables(taskDescription: string, availableTables: string[]): string[] {
  const lower = taskDescription.toLowerCase();
  return availableTables.filter(
    (table) => lower.includes(table.toLowerCase()) || lower.includes(table.replace(/_/g, ' ').toLowerCase())
  );
}

/**
 * Gets the context config for a profile, with optional table filtering.
 */
export function getContextConfig(
  profile: ContextProfileName,
  taskDescription?: string,
  availableTables?: string[]
): ContextConfig {
  const baseConfig = CONTEXT_PROFILES[profile];
  if (!baseConfig) {
    console.warn(`[ContextProfiles] Unknown profile: ${profile}, falling back to simple-endpoint`);
    return { ...CONTEXT_PROFILES['simple-endpoint'] };
  }

  const config = { ...baseConfig };

  // Dynamic table filtering for database tasks
  if (config.includeSchema && taskDescription) {
    const tables = availableTables ?? KNOWN_TABLES;
    const relevant = extractRelevantTables(taskDescription, tables);
    if (relevant.length > 0) {
      config.schemaTablesFilter = relevant;
    }
  }

  return config;
}

/**
 * Estimates token savings from using a profile vs full context.
 * Returns a percentage estimate (e.g., 0.35 = 35% savings).
 */
export function estimateTokenSavings(profile: ContextProfileName): number {
  switch (profile) {
    case 'bug-fix':
      return 0.6; // 60% savings - no context loaded
    case 'simple-endpoint':
      return 0.35; // 35% savings - only 1 route example
    case 'database-task':
      return 0.25; // 25% savings - schema but filtered, fewer examples
    case 'full-feature':
      return 0; // No savings - full context needed
    default:
      return 0;
  }
}
