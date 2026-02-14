/**
 * Frontend Context Profiles
 *
 * Selectively loads component examples and patterns based on task type.
 * Separate from backend context profiles for clean separation of concerns.
 *
 * Uses a 3-pass selection system (same as backend context-profiles.ts):
 *   Pass 1: Override keywords — short-circuit to a forced profile
 *   Pass 2: Positive keyword matching — existing sequential check logic
 *   Pass 3: Negative signal demotion — cancel false-positive matches
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

// ============================================================
// OVERRIDE KEYWORDS — checked FIRST, short-circuit all other matching
// ============================================================

interface FrontendProfileOverride {
  keywords: string[];
  profile: FrontendContextProfileName;
  description: string;
}

export const FRONTEND_PROFILE_OVERRIDES: FrontendProfileOverride[] = [
  // === FORCE SIMPLE-COMPONENT (component libraries / design systems) ===
  {
    keywords: [
      'component library', 'design system', 'shared components',
      'ui library', 'ui kit', 'reusable components', 'base components',
      'primitive components', 'common components',
    ],
    profile: 'simple-component',
    description: 'Component libraries build primitives, not stateful features',
  },
  // === FORCE SIMPLE-COMPONENT (config/tooling) ===
  {
    keywords: [
      'tailwind config', 'theme config', 'storybook',
      'configuration file', 'config setup',
    ],
    profile: 'simple-component',
    description: 'Config/tooling tasks never need full component context',
  },
  // === FORCE SIMPLE-COMPONENT (scaffolding) ===
  {
    keywords: [
      'scaffolding', 'scaffold', 'project setup', 'base configuration',
      'boilerplate', 'project structure', 'folder structure', 'directory structure',
    ],
    profile: 'simple-component',
    description: 'Scaffolding tasks are always simple',
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

export const FRONTEND_NEGATIVE_SIGNALS: Partial<Record<FrontendContextProfileName, string[]>> = {
  'stateful-component': [
    'library', 'design system', 'reusable', 'shared', 'primitive',
    'kit', 'base component',
  ],
  'api-consumer': [
    'library', 'design system', 'reusable', 'shared', 'primitive',
    'kit', 'base component',
  ],
  'full-feature': [
    'single', 'simple', 'utility', 'helper', 'hook',
    'library', 'design system',
  ],
};

/**
 * Word-boundary keyword match for frontend profiles.
 */
function matchesFrontendWord(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
}

/**
 * Selects appropriate frontend context profile based on task description.
 *
 * Uses a 3-pass system:
 *   Pass 1: Override keywords — short-circuit (e.g. "component library" → simple-component)
 *   Pass 2: Positive keyword matching — sequential priority checks
 *   Pass 3: Negative signal demotion — cancel false-positive matches
 */
export function selectFrontendContextProfile(taskDescription: string): FrontendContextProfileName {
  const lower = taskDescription.toLowerCase();

  // ==============================
  // PASS 1: Check overrides (short-circuit)
  // ==============================
  for (const override of FRONTEND_PROFILE_OVERRIDES) {
    const matchedKeyword = override.keywords.find(kw => matchesFrontendWord(lower, kw));
    if (matchedKeyword) {
      console.log(
        `[FrontendProfiles] Override: "${override.description}" → ${override.profile} ` +
        `(keyword: "${matchedKeyword}") for: "${taskDescription.substring(0, 80)}"`
      );
      return override.profile;
    }
  }

  // ==============================
  // PASS 2: Positive keyword matching (existing priority logic)
  // ==============================
  let selected: FrontendContextProfileName;
  let positiveKeyword = '';

  // API consumer detection - check FIRST (high priority)
  if (
    lower.includes('fetch') ||
    lower.includes('tanstack') ||
    lower.includes('react-query') ||
    lower.includes('usequery') ||
    lower.includes('usemutation') ||
    (lower.includes('api') && (lower.includes('call') || lower.includes('endpoint') || lower.includes('request') || lower.includes('from')))
  ) {
    selected = 'api-consumer';
    positiveKeyword = 'fetch/tanstack/api';
  }
  // Form detection - check before bug-fix
  else if (
    lower.includes('form') ||
    lower.includes('validation') ||
    lower.includes('submit') ||
    lower.includes('input field')
  ) {
    selected = 'form-component';
    positiveKeyword = 'form/validation/submit';
  }
  // Bug fix detection
  else if (
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
    selected = 'bug-fix';
    positiveKeyword = 'fix/bug/broken';
  }
  // Full feature detection
  else if (
    (lower.includes('feature') && lower.includes('implement')) ||
    lower.includes('full feature') ||
    lower.includes('complete feature') ||
    (lower.includes('page') && lower.includes('create')) ||
    (lower.includes('screen') && lower.includes('create'))
  ) {
    selected = 'full-feature';
    positiveKeyword = 'feature+implement/page+create';
  }
  // Stateful component detection
  else if (
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
    selected = 'stateful-component';
    positiveKeyword = 'useState/interactive/modal';
  }
  // General data loading patterns (fallback to api-consumer)
  else if (
    lower.includes('loading') ||
    lower.includes('data') ||
    lower.includes('query') ||
    lower.includes('mutation')
  ) {
    selected = 'api-consumer';
    positiveKeyword = 'loading/data/query';
  }
  // Default to simple component
  else {
    selected = 'simple-component';
  }

  // ==============================
  // PASS 3: Check negative signals (demotion)
  // ==============================
  const negatives = FRONTEND_NEGATIVE_SIGNALS[selected];
  if (negatives) {
    const matchedNeg = negatives.find(neg => matchesFrontendWord(lower, neg));
    if (matchedNeg) {
      const demotedFrom = selected;
      selected = 'simple-component';
      console.log(
        `[FrontendProfiles] Negative signal demoted "${demotedFrom}" → "simple-component" ` +
        `(positive: "${positiveKeyword}", negative: "${matchedNeg}") ` +
        `for: "${taskDescription.substring(0, 80)}"`
      );
      return selected;
    }
  }

  console.log(
    `[FrontendProfiles] Selected "${selected}" ` +
    `(keyword: "${positiveKeyword || 'none (default)'}") for: "${taskDescription.substring(0, 80)}"`
  );
  return selected;
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
