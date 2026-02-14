/**
 * Tests for worker-registry.ts pure functions.
 *
 * Only tests the pure logic (shouldStopDueToIdleTimeout, getRedisKey pattern).
 * Redis-dependent functions are integration tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  shouldStopDueToIdleTimeout,
  HEARTBEAT_INTERVAL_MS,
  DEFAULT_IDLE_TIMEOUT_MS,
} from '../worker-registry';

describe('shouldStopDueToIdleTimeout', () => {
  it('returns false when last task was recent', () => {
    const now = Date.now();
    expect(shouldStopDueToIdleTimeout(now - 1000)).toBe(false);
  });

  it('returns true when idle time exceeds default timeout', () => {
    const longAgo = Date.now() - DEFAULT_IDLE_TIMEOUT_MS - 1000;
    expect(shouldStopDueToIdleTimeout(longAgo)).toBe(true);
  });

  it('returns false at exactly the timeout boundary', () => {
    // At exactly the boundary, idle time equals timeout — not exceeded
    const atBoundary = Date.now() - DEFAULT_IDLE_TIMEOUT_MS;
    expect(shouldStopDueToIdleTimeout(atBoundary)).toBe(false);
  });

  it('respects custom timeout parameter', () => {
    const customTimeout = 10000; // 10 seconds
    const recentEnough = Date.now() - 5000; // 5 seconds ago
    expect(shouldStopDueToIdleTimeout(recentEnough, customTimeout)).toBe(false);

    const tooOld = Date.now() - 15000; // 15 seconds ago
    expect(shouldStopDueToIdleTimeout(tooOld, customTimeout)).toBe(true);
  });
});

describe('Constants', () => {
  it('HEARTBEAT_INTERVAL_MS is 10 seconds', () => {
    expect(HEARTBEAT_INTERVAL_MS).toBe(10000);
  });

  it('DEFAULT_IDLE_TIMEOUT_MS is 5 minutes', () => {
    expect(DEFAULT_IDLE_TIMEOUT_MS).toBe(5 * 60 * 1000);
  });
});
