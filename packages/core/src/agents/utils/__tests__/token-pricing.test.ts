/**
 * Tests for token-pricing.ts
 *
 * Validates calculateTokenCost() pricing math and estimateBillableHours() heuristic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateTokenCost, estimateBillableHours } from '../token-pricing';

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('calculateTokenCost', () => {
  it('calculates Sonnet pricing correctly', () => {
    const cost = calculateTokenCost({
      model: 'claude-sonnet-4-5-20250929',
      tokensInput: 10_000,
      tokensOutput: 5_000,
      cachedTokens: 0,
    });

    // Input: 10,000 × $3.00 / 1M = $0.03
    expect(cost.inputCostUsd).toBeCloseTo(0.03, 6);
    // Output: 5,000 × $15.00 / 1M = $0.075
    expect(cost.outputCostUsd).toBeCloseTo(0.075, 6);
    expect(cost.cacheSavingsUsd).toBe(0);
    expect(cost.totalCostUsd).toBeCloseTo(0.105, 6);
  });

  it('calculates Opus pricing correctly', () => {
    const cost = calculateTokenCost({
      model: 'claude-opus-4-5-20250929',
      tokensInput: 10_000,
      tokensOutput: 5_000,
      cachedTokens: 0,
    });

    // Input: 10,000 × $15.00 / 1M = $0.15
    expect(cost.inputCostUsd).toBeCloseTo(0.15, 6);
    // Output: 5,000 × $75.00 / 1M = $0.375
    expect(cost.outputCostUsd).toBeCloseTo(0.375, 6);
    expect(cost.cacheSavingsUsd).toBe(0);
    expect(cost.totalCostUsd).toBeCloseTo(0.525, 6);
  });

  it('calculates Haiku pricing correctly', () => {
    const cost = calculateTokenCost({
      model: 'claude-haiku-4-5-20251001',
      tokensInput: 10_000,
      tokensOutput: 5_000,
      cachedTokens: 0,
    });

    // Input: 10,000 × $0.80 / 1M = $0.008
    expect(cost.inputCostUsd).toBeCloseTo(0.008, 6);
    // Output: 5,000 × $4.00 / 1M = $0.02
    expect(cost.outputCostUsd).toBeCloseTo(0.02, 6);
    expect(cost.cacheSavingsUsd).toBe(0);
    expect(cost.totalCostUsd).toBeCloseTo(0.028, 6);
  });

  it('calculates cache savings correctly for Sonnet', () => {
    const cost = calculateTokenCost({
      model: 'claude-sonnet-4-5-20250929',
      tokensInput: 10_000,
      tokensOutput: 5_000,
      cachedTokens: 8_000,
    });

    // Uncached input: 2,000 × $3.00 / 1M = $0.006
    // Cached input: 8,000 × $0.30 / 1M = $0.0024
    expect(cost.inputCostUsd).toBeCloseTo(0.006 + 0.0024, 6);
    // Output: 5,000 × $15.00 / 1M = $0.075
    expect(cost.outputCostUsd).toBeCloseTo(0.075, 6);
    // Cache savings: 8,000 × ($3.00 - $0.30) / 1M = $0.0216
    expect(cost.cacheSavingsUsd).toBeCloseTo(0.0216, 6);
    // Total = input + output (savings are informational, not subtracted)
    expect(cost.totalCostUsd).toBeCloseTo(0.0084 + 0.075, 6);
  });

  it('falls back to Sonnet pricing for unknown models', () => {
    const unknown = calculateTokenCost({
      model: 'claude-unknown-model',
      tokensInput: 10_000,
      tokensOutput: 5_000,
      cachedTokens: 0,
    });

    const sonnet = calculateTokenCost({
      model: 'claude-sonnet-4-5-20250929',
      tokensInput: 10_000,
      tokensOutput: 5_000,
      cachedTokens: 0,
    });

    expect(unknown.totalCostUsd).toBe(sonnet.totalCostUsd);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Unknown model')
    );
  });

  it('returns zero cost for zero tokens', () => {
    const cost = calculateTokenCost({
      model: 'claude-sonnet-4-5-20250929',
      tokensInput: 0,
      tokensOutput: 0,
      cachedTokens: 0,
    });

    expect(cost.inputCostUsd).toBe(0);
    expect(cost.outputCostUsd).toBe(0);
    expect(cost.cacheSavingsUsd).toBe(0);
    expect(cost.totalCostUsd).toBe(0);
  });

  it('handles large token counts without overflow', () => {
    const cost = calculateTokenCost({
      model: 'claude-sonnet-4-5-20250929',
      tokensInput: 1_000_000,
      tokensOutput: 500_000,
      cachedTokens: 0,
    });

    // Input: 1M × $3.00 / 1M = $3.00
    expect(cost.inputCostUsd).toBeCloseTo(3.0, 6);
    // Output: 500K × $15.00 / 1M = $7.50
    expect(cost.outputCostUsd).toBeCloseTo(7.5, 6);
    expect(cost.totalCostUsd).toBeCloseTo(10.5, 6);
    expect(Number.isFinite(cost.totalCostUsd)).toBe(true);
  });
});

describe('estimateBillableHours', () => {
  it('returns 0.25 hours for a simple 3K-token task', () => {
    expect(estimateBillableHours(3_000, 'simple')).toBe(0.25);
  });

  it('returns 1.0 hours for a standard 10K-token task', () => {
    expect(estimateBillableHours(10_000, 'standard')).toBe(1.0);
  });

  it('returns 2.5 hours for a complex 30K-token task', () => {
    expect(estimateBillableHours(30_000, 'complex')).toBe(2.5);
  });

  it('scales linearly — 6K simple tokens = 0.5 hours', () => {
    expect(estimateBillableHours(6_000, 'simple')).toBe(0.5);
  });
});
