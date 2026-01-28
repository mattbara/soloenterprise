/**
 * Anthropic Prompt Caching Helper
 *
 * Utilities for building cached system prompts and tracking cache metrics.
 * Prompt caching reduces costs by ~90% on repeated SKILL file content.
 *
 * How it works:
 * - First request: Cache write (1.25x price)
 * - Subsequent requests within 5 min: Cache read (0.1x price = 90% savings)
 * - Cached content MUST be at the START of the prompt
 */

import type { MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages';

/**
 * A text content block that can optionally be cached.
 */
export interface CacheableTextBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

/**
 * Options for building a cached system prompt.
 */
export interface CacheOptions {
  /** Cache the codebase context block (default: false - it varies per task) */
  cacheCodebaseContext?: boolean;
}

/**
 * Builds a system prompt array with cache_control markers for Anthropic API.
 *
 * @param skillContent - SKILL files content (always cached, ~1800-2100 tokens)
 * @param codebaseContext - Project-specific context (optional, cached if stable)
 * @param options - Caching options
 * @returns Array of text blocks with cache_control markers
 */
export function buildCachedSystemPrompt(
  skillContent: string,
  codebaseContext?: string,
  options?: CacheOptions
): CacheableTextBlock[] {
  const systemParts: CacheableTextBlock[] = [];

  // SKILL files - always cache (static across tasks, above 1024 token minimum)
  if (skillContent) {
    systemParts.push({
      type: 'text',
      text: skillContent,
      cache_control: { type: 'ephemeral' },
    });
  }

  // Codebase context - optional caching (varies per task)
  if (codebaseContext) {
    const block: CacheableTextBlock = {
      type: 'text',
      text: codebaseContext,
    };

    if (options?.cacheCodebaseContext) {
      block.cache_control = { type: 'ephemeral' };
    }

    systemParts.push(block);
  }

  return systemParts;
}

/**
 * Cache usage metrics from Anthropic API response.
 */
export interface CacheMetrics {
  /** Tokens written to cache (1.25x price) */
  cacheCreationInputTokens: number;
  /** Tokens read from cache (0.1x price) */
  cacheReadInputTokens: number;
  /** Percentage of input tokens served from cache */
  cacheHitPercent: number;
  /** Estimated cost savings percentage (0-90%) */
  estimatedSavingsPercent: number;
}

/**
 * Extended usage type with cache fields from Anthropic API.
 * Note: SDK returns `number | null` for optional cache fields.
 */
interface UsageWithCache {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/**
 * Extracts cache metrics from Anthropic API response usage.
 *
 * @param usage - Usage object from Anthropic API response
 * @returns Cache metrics with hit rate and savings calculations
 */
export function extractCacheMetrics(usage: UsageWithCache): CacheMetrics {
  const cacheCreation = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const totalCacheable = cacheCreation + cacheRead;

  // Calculate cache hit percentage
  const cacheHitPercent = totalCacheable > 0 ? (cacheRead / totalCacheable) * 100 : 0;

  // Estimate savings:
  // - Cache write: 1.25x normal price
  // - Cache read: 0.1x normal price
  // - Without caching: 1.0x price for all tokens
  //
  // Savings = (normal_cost - cached_cost) / normal_cost
  // normal_cost = totalCacheable * 1.0
  // cached_cost = cacheCreation * 1.25 + cacheRead * 0.1
  const normalCost = totalCacheable;
  const cachedCost = cacheCreation * 1.25 + cacheRead * 0.1;
  const estimatedSavingsPercent = normalCost > 0 ? ((normalCost - cachedCost) / normalCost) * 100 : 0;

  return {
    cacheCreationInputTokens: cacheCreation,
    cacheReadInputTokens: cacheRead,
    cacheHitPercent,
    estimatedSavingsPercent: Math.max(0, estimatedSavingsPercent), // Clamp to 0 minimum
  };
}

/**
 * Logs cache metrics in a human-readable format.
 *
 * @param agentName - Name of the agent for log prefix
 * @param metrics - Cache metrics to log
 */
export function logCacheMetrics(agentName: string, metrics: CacheMetrics): void {
  if (metrics.cacheCreationInputTokens > 0 || metrics.cacheReadInputTokens > 0) {
    console.log(
      `[${agentName}] Cache: ${metrics.cacheReadInputTokens} read, ` +
        `${metrics.cacheCreationInputTokens} written ` +
        `(${metrics.cacheHitPercent.toFixed(1)}% hit rate, ` +
        `~${metrics.estimatedSavingsPercent.toFixed(1)}% savings)`
    );
  }
}

/**
 * Type guard to check if system prompt is using cached format.
 */
export function isCachedSystemPrompt(
  system: MessageCreateParamsNonStreaming['system']
): system is CacheableTextBlock[] {
  return Array.isArray(system) && system.length > 0 && system[0].type === 'text';
}
