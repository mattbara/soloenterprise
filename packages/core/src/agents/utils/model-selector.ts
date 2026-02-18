/**
 * Model Selector — Dynamic Opus/Sonnet Tiering
 *
 * Selects the cheapest model that can handle the task complexity.
 * Opus (~$15/M input) is 5x more expensive than Sonnet (~$3/M input).
 *
 * Environment overrides:
 * - ORCHESTRATOR_MODEL_TIER=opus|sonnet|auto (default: auto)
 * - ARCHITECT_MODEL_TIER=opus|sonnet|auto (default: auto)
 */

const OPUS = 'claude-opus-4-6';
const SONNET = 'claude-sonnet-4-5-20250929';

type ModelTier = 'opus' | 'sonnet' | 'auto';

function parseTier(envValue: string | undefined): ModelTier {
  if (envValue === 'opus' || envValue === 'sonnet') return envValue;
  return 'auto';
}

// ============================================================================
// Orchestrator Model Selection
// ============================================================================

export interface OrchestratorModelContext {
  /** Whether the task has answered questions from a previous run */
  hasAnsweredQuestions: boolean;
  /** Whether this is the first run (no session summary) */
  isFirstRun: boolean;
  /** Estimated number of tasks the orchestrator will produce */
  estimatedTaskCount?: number;
}

/**
 * Select model for orchestrator agent.
 *
 * | Condition | Model | Rationale |
 * |-----------|-------|-----------|
 * | Env override | Opus/Sonnet | Manual override |
 * | Re-run after answered questions (not first run) | Sonnet | Just incorporating answers |
 * | Simple scope (estimated tasks <= 5) | Sonnet | Low complexity |
 * | Default (first run, complex project) | Opus | Needs careful reasoning |
 */
export function selectOrchestratorModel(context: OrchestratorModelContext): string {
  const tier = parseTier(process.env.ORCHESTRATOR_MODEL_TIER);

  if (tier === 'opus') return OPUS;
  if (tier === 'sonnet') return SONNET;

  // Auto-tiering logic
  if (context.hasAnsweredQuestions && !context.isFirstRun) {
    return SONNET; // Re-run: just incorporating human answers
  }

  if (context.estimatedTaskCount !== undefined && context.estimatedTaskCount <= 5) {
    return SONNET; // Simple scope
  }

  return OPUS; // Default: first run or complex project
}

// ============================================================================
// Architect Model Selection
// ============================================================================

/**
 * Select model for architect spec generation.
 *
 * | Condition | Model | Rationale |
 * |-----------|-------|-----------|
 * | Env override | Opus/Sonnet | Manual override |
 * | full-feature profile with 3+ deps | Opus | Complex cross-task reasoning |
 * | Everything else | Sonnet | Sonnet handles most specs well |
 */
export function selectArchitectModel(
  profile: string,
  depCount: number
): string {
  const tier = parseTier(process.env.ARCHITECT_MODEL_TIER);

  if (tier === 'opus') return OPUS;
  if (tier === 'sonnet') return SONNET;

  // Auto-tiering logic
  if (profile === 'full-feature' && depCount >= 3) {
    return OPUS; // Complex cross-task reasoning
  }

  return SONNET; // Everything else
}
