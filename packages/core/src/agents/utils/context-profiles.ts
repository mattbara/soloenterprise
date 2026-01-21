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
 * Selects appropriate context profile based on task description.
 */
export function selectContextProfile(taskDescription: string): ContextProfileName {
  const lower = taskDescription.toLowerCase();

  // Bug fix detection - prioritize this check
  if (lower.includes('fix') || lower.includes('bug') || lower.includes('error') || lower.includes('patch')) {
    return 'bug-fix';
  }

  // Full feature detection - needs comprehensive context
  if (
    (lower.includes('feature') && lower.includes('implement')) ||
    (lower.includes('create') && lower.includes('system')) ||
    lower.includes('full feature') ||
    lower.includes('complete feature') ||
    lower.includes('comprehensive')
  ) {
    return 'full-feature';
  }

  // Database task detection - needs schema but not route examples
  if (
    lower.includes('database') ||
    lower.includes('schema') ||
    lower.includes('table') ||
    lower.includes('migration') ||
    lower.includes('query') ||
    lower.includes('drizzle') ||
    lower.includes('orm')
  ) {
    return 'database-task';
  }

  // Check if task mentions specific tables
  const mentionedTables = extractRelevantTables(taskDescription, KNOWN_TABLES);
  if (mentionedTables.length > 0) {
    return 'database-task';
  }

  // Default to simple endpoint for basic API tasks
  return 'simple-endpoint';
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
