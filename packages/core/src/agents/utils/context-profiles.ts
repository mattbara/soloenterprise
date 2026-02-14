/**
 * Context Profiles
 *
 * Selectively loads schema and examples based on task type to reduce token consumption.
 * Expected reduction: 25-35% for simple tasks by avoiding full codebase context loading.
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
 * Uses multi-signal collection: gathers evidence for each profile, then picks
 * based on priority with conflict resolution. Database signals override bug-fix
 * signals to prevent starving CRUD tasks of schema context.
 */
export function selectContextProfile(
  taskDescription: string,
  options?: ProfileSelectionOptions
): ContextProfileName {
  const lower = taskDescription.toLowerCase();

  // Collect signals for each profile category
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

  // Weak DB signals — generic web keywords that indicate "this is an API task" but
  // say nothing about needing database context. When these are the ONLY DB signals
  // present, they should NOT override simple-endpoint classification.
  const WEAK_DB_SIGNALS = new Set(['api route', 'route handler', 'api endpoint']);
  const hasOnlyWeakDbSignals = dbSignals.length > 0 && dbSignals.every(s => WEAK_DB_SIGNALS.has(s));

  if (simpleSignals.length > 0 && (dbSignals.length === 0 || hasOnlyWeakDbSignals) && fullSignals.length === 0) {
    // Simple endpoint — wins even if weak DB signals like "api route" are present,
    // since a health/ping endpoint with "api route" in the description doesn't need schema.
    selected = 'simple-endpoint';
    reason = `Simple signals: [${simpleSignals.join(', ')}]${hasOnlyWeakDbSignals ? ` (weak DB signals ignored: [${dbSignals.join(', ')}])` : ''}`;
  } else if (bugSignals.length > 0 && dbSignals.length === 0 && fullSignals.length === 0) {
    // Bug fix ONLY when no database/full-feature signals compete
    selected = 'bug-fix';
    reason = `Bug signals: [${bugSignals.join(', ')}], no competing db/full signals`;
  } else if (dbSignals.length > 0) {
    // Database signals present — always provide schema context
    selected = 'database-task';
    reason = `Database signals: [${dbSignals.join(', ')}]`;
  } else if (fullSignals.length > 0) {
    selected = 'full-feature';
    reason = `Full feature signals: [${fullSignals.join(', ')}]`;
  } else {
    // No clear signals — default to full-feature (safer than starving context)
    selected = 'full-feature';
    reason = 'No clear signals, defaulting to full-feature for safety';
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
