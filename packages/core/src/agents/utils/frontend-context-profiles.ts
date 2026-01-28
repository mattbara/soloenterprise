/**
 * Frontend Context Profiles
 *
 * Selectively loads component examples and patterns based on task type.
 * Separate from backend context profiles for clean separation of concerns.
 */

export interface FrontendContextConfig {
  includeComponentExamples: boolean;
  includeHookExamples: boolean;
  includeFormPatterns: boolean;
  includeApiPatterns: boolean;
  maxExamples: number;
}

export type FrontendContextProfileName =
  | 'simple-component'
  | 'stateful-component'
  | 'form-component'
  | 'api-consumer'
  | 'full-feature'
  | 'bug-fix';

export const FRONTEND_CONTEXT_PROFILES: Record<FrontendContextProfileName, FrontendContextConfig> = {
  'simple-component': {
    includeComponentExamples: true,
    includeHookExamples: false,
    includeFormPatterns: false,
    includeApiPatterns: false,
    maxExamples: 1,
  },
  'stateful-component': {
    includeComponentExamples: true,
    includeHookExamples: true,
    includeFormPatterns: false,
    includeApiPatterns: false,
    maxExamples: 1,
  },
  'form-component': {
    includeComponentExamples: true,
    includeHookExamples: false,
    includeFormPatterns: true,
    includeApiPatterns: false,
    maxExamples: 2,
  },
  'api-consumer': {
    includeComponentExamples: true,
    includeHookExamples: true,
    includeFormPatterns: false,
    includeApiPatterns: true,
    maxExamples: 2,
  },
  'full-feature': {
    includeComponentExamples: true,
    includeHookExamples: true,
    includeFormPatterns: true,
    includeApiPatterns: true,
    maxExamples: 2,
  },
  'bug-fix': {
    includeComponentExamples: false,
    includeHookExamples: false,
    includeFormPatterns: false,
    includeApiPatterns: false,
    maxExamples: 0,
  },
};

/**
 * Selects appropriate frontend context profile based on task description.
 *
 * Order matters! More specific patterns are checked first:
 * 1. API consumer - tasks mentioning fetch/api/query are almost never bug fixes
 * 2. Form component - explicit form/validation work
 * 3. Bug fix - requires explicit bug-fix language (not just "error")
 * 4. Full feature - complete page/feature implementations
 * 5. Stateful component - interactive UI elements
 * 6. Simple component - default fallback
 */
export function selectFrontendContextProfile(taskDescription: string): FrontendContextProfileName {
  const lower = taskDescription.toLowerCase();

  // API consumer detection - check FIRST (high priority)
  // Tasks mentioning fetch/api/query need data fetching patterns, not bug-fix context
  if (
    lower.includes('fetch') ||
    lower.includes('tanstack') ||
    lower.includes('react-query') ||
    lower.includes('usequery') ||
    lower.includes('usemutation') ||
    (lower.includes('api') && (lower.includes('call') || lower.includes('endpoint') || lower.includes('request') || lower.includes('from')))
  ) {
    return 'api-consumer';
  }

  // Form detection - check before bug-fix
  if (
    lower.includes('form') ||
    lower.includes('validation') ||
    lower.includes('submit') ||
    lower.includes('input field')
  ) {
    return 'form-component';
  }

  // Bug fix detection - be MORE SPECIFIC
  // Require explicit bug-fix language, not just "error" (which appears in "error state", "error handling")
  if (
    lower.includes('fix bug') ||
    lower.includes('bug fix') ||
    lower.includes('bugfix') ||
    lower.includes('fix issue') ||
    lower.includes('fix the') ||
    lower.includes('broken') ||
    lower.includes('not working') ||
    lower.includes("doesn't work") ||
    lower.includes('patch') ||
    (lower.includes('bug') && !lower.includes('debug'))
  ) {
    return 'bug-fix';
  }

  // Full feature detection
  if (
    (lower.includes('feature') && lower.includes('implement')) ||
    lower.includes('full feature') ||
    lower.includes('complete feature') ||
    (lower.includes('page') && lower.includes('create')) ||
    (lower.includes('screen') && lower.includes('create'))
  ) {
    return 'full-feature';
  }

  // Stateful component detection
  // Note: "state" alone is too broad (matches "error state"), require more specific patterns
  if (
    lower.includes('usestate') ||
    lower.includes('useeffect') ||
    lower.includes('interactive') ||
    lower.includes('toggle') ||
    lower.includes('modal') ||
    lower.includes('dropdown') ||
    lower.includes('accordion') ||
    lower.includes('expand') ||
    lower.includes('collapse')
  ) {
    return 'stateful-component';
  }

  // Check for general data loading patterns (fallback to api-consumer)
  if (
    lower.includes('loading') ||
    lower.includes('data') ||
    lower.includes('query') ||
    lower.includes('mutation')
  ) {
    return 'api-consumer';
  }

  // Default to simple component
  return 'simple-component';
}

export function getFrontendContextConfig(profile: FrontendContextProfileName): FrontendContextConfig {
  return { ...FRONTEND_CONTEXT_PROFILES[profile] };
}

/**
 * Estimates token savings from using a profile vs full context.
 * Returns a percentage estimate (e.g., 0.35 = 35% savings).
 */
export function estimateFrontendTokenSavings(profile: FrontendContextProfileName): number {
  switch (profile) {
    case 'bug-fix':
      return 0.6; // 60% savings - no context loaded
    case 'simple-component':
      return 0.35; // 35% savings - only 1 component example
    case 'stateful-component':
      return 0.25; // 25% savings - component + hook examples
    case 'form-component':
      return 0.2; // 20% savings - component + form patterns
    case 'api-consumer':
      return 0.15; // 15% savings - component + hook + api patterns
    case 'full-feature':
      return 0; // No savings - full context needed
    default:
      return 0;
  }
}
