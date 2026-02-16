/**
 * Token-to-USD Pricing
 *
 * Calculates API cost from token usage. Model-aware pricing with
 * cache savings tracking. Also provides a heuristic for converting
 * token counts to approximate billable consulting hours.
 */

export interface TokenUsage {
  model: string;
  tokensInput: number;
  tokensOutput: number;
  cachedTokens: number; // cached input tokens (billed at reduced rate)
}

export interface CostBreakdown {
  inputCostUsd: number;
  outputCostUsd: number;
  cacheSavingsUsd: number; // how much was saved by caching
  totalCostUsd: number;
}

// Per-million-token pricing (Feb 2026)
interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cachedInputPerMillion: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-sonnet-4-5-20250929': {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cachedInputPerMillion: 0.3,
  },
  'claude-opus-4-5-20250929': {
    inputPerMillion: 15.0,
    outputPerMillion: 75.0,
    cachedInputPerMillion: 1.5,
  },
  'claude-haiku-4-5-20251001': {
    inputPerMillion: 0.8,
    outputPerMillion: 4.0,
    cachedInputPerMillion: 0.08,
  },
};

const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

function getPricing(model: string): ModelPricing {
  const pricing = MODEL_PRICING[model];
  if (pricing) return pricing;

  console.warn(`[TokenPricing] Unknown model "${model}", defaulting to Sonnet pricing`);
  return MODEL_PRICING[DEFAULT_MODEL];
}

/**
 * Calculate USD cost from token usage.
 */
export function calculateTokenCost(usage: TokenUsage): CostBreakdown {
  const pricing = getPricing(usage.model);

  const uncachedInputTokens = usage.tokensInput - usage.cachedTokens;
  const uncachedInputCost = (uncachedInputTokens * pricing.inputPerMillion) / 1_000_000;
  const cachedInputCost = (usage.cachedTokens * pricing.cachedInputPerMillion) / 1_000_000;

  const inputCostUsd = uncachedInputCost + cachedInputCost;
  const outputCostUsd = (usage.tokensOutput * pricing.outputPerMillion) / 1_000_000;
  const cacheSavingsUsd =
    (usage.cachedTokens * (pricing.inputPerMillion - pricing.cachedInputPerMillion)) / 1_000_000;
  const totalCostUsd = inputCostUsd + outputCostUsd;

  return { inputCostUsd, outputCostUsd, cacheSavingsUsd, totalCostUsd };
}

/**
 * Estimate billable consulting hours from total token count.
 *
 * Heuristic from SKILL-client-reporter-patterns.md:
 * - Simple (~3K tokens): 0.25 hours
 * - Standard (~10K tokens): 1 hour
 * - Complex (~30K tokens): 2.5 hours
 * Scales linearly within each band.
 */
export function estimateBillableHours(
  totalTokens: number,
  complexity: 'simple' | 'standard' | 'complex'
): number {
  // Band anchors: tokens -> hours
  const bands = {
    simple: { tokens: 3_000, hours: 0.25 },
    standard: { tokens: 10_000, hours: 1.0 },
    complex: { tokens: 30_000, hours: 2.5 },
  };

  const band = bands[complexity];
  const ratio = totalTokens / band.tokens;
  return Math.max(0, parseFloat((ratio * band.hours).toFixed(2)));
}
