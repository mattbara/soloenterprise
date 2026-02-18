import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  computeContextHash,
  getSnapshot,
  setSnapshot,
  computeContextDiff,
  clearAllSnapshots,
  type ContextSnapshotMetrics,
} from '../context-snapshot';

describe('context-snapshot', () => {
  beforeEach(() => {
    clearAllSnapshots();
  });

  describe('computeContextHash', () => {
    it('returns consistent hash for same content', () => {
      const hash1 = computeContextHash('hello world');
      const hash2 = computeContextHash('hello world');
      expect(hash1).toBe(hash2);
    });

    it('returns different hash for different content', () => {
      const hash1 = computeContextHash('hello world');
      const hash2 = computeContextHash('hello world!');
      expect(hash1).not.toBe(hash2);
    });

    it('returns 32-char hex string (MD5)', () => {
      const hash = computeContextHash('test');
      expect(hash).toMatch(/^[a-f0-9]{32}$/);
    });
  });

  describe('getSnapshot / setSnapshot', () => {
    const metrics: ContextSnapshotMetrics = {
      activeTaskCount: 5,
      blockedTaskCount: 2,
      pendingQuestionCount: 1,
      lockedFileCount: 3,
    };

    it('returns null for missing project', () => {
      expect(getSnapshot('nonexistent')).toBeNull();
    });

    it('stores and retrieves snapshot', () => {
      setSnapshot('proj-1', 'context content', metrics);
      const snapshot = getSnapshot('proj-1');
      expect(snapshot).not.toBeNull();
      expect(snapshot!.content).toBe('context content');
      expect(snapshot!.metrics).toEqual(metrics);
      expect(snapshot!.hash).toBe(computeContextHash('context content'));
    });

    it('returns null after TTL expires', () => {
      setSnapshot('proj-1', 'content', metrics);

      // Fast-forward time past TTL (30 min)
      const snapshot = getSnapshot('proj-1');
      expect(snapshot).not.toBeNull();

      // Manually set createdAt to 31 minutes ago
      const stored = getSnapshot('proj-1');
      if (stored) {
        stored.createdAt = Date.now() - 31 * 60 * 1000;
      }
      // Need to set it again since we're reading from the cache
      // Actually, the map stores by reference, so the mutation above worked
      expect(getSnapshot('proj-1')).toBeNull();
    });

    it('overwrites previous snapshot for same project', () => {
      setSnapshot('proj-1', 'old content', metrics);
      setSnapshot('proj-1', 'new content', { ...metrics, activeTaskCount: 10 });

      const snapshot = getSnapshot('proj-1');
      expect(snapshot!.content).toBe('new content');
      expect(snapshot!.metrics.activeTaskCount).toBe(10);
    });
  });

  describe('computeContextDiff', () => {
    const base: ContextSnapshotMetrics = {
      activeTaskCount: 5,
      blockedTaskCount: 2,
      pendingQuestionCount: 1,
      lockedFileCount: 3,
    };

    it('reports unchanged when metrics are identical', () => {
      const diff = computeContextDiff(base, { ...base });
      expect(diff.changed).toBe(false);
      expect(diff.summary).toContain('unchanged');
      expect(diff.summary).toContain('5 active');
    });

    it('reports changes in active tasks', () => {
      const diff = computeContextDiff(base, { ...base, activeTaskCount: 8 });
      expect(diff.changed).toBe(true);
      expect(diff.summary).toContain('Active tasks: 5 → 8 (+3)');
    });

    it('reports decreases with negative sign', () => {
      const diff = computeContextDiff(base, { ...base, blockedTaskCount: 0 });
      expect(diff.changed).toBe(true);
      expect(diff.summary).toContain('Blocked tasks: 2 → 0 (-2)');
    });

    it('reports multiple changes', () => {
      const diff = computeContextDiff(base, {
        activeTaskCount: 3,
        blockedTaskCount: 4,
        pendingQuestionCount: 1, // unchanged
        lockedFileCount: 0,
      });
      expect(diff.changed).toBe(true);
      expect(diff.summary).toContain('Active tasks');
      expect(diff.summary).toContain('Blocked tasks');
      expect(diff.summary).toContain('File locks');
      expect(diff.summary).not.toContain('Pending questions');
    });
  });

  describe('clearAllSnapshots', () => {
    it('clears all stored snapshots', () => {
      setSnapshot('proj-1', 'a', { activeTaskCount: 1, blockedTaskCount: 0, pendingQuestionCount: 0, lockedFileCount: 0 });
      setSnapshot('proj-2', 'b', { activeTaskCount: 2, blockedTaskCount: 0, pendingQuestionCount: 0, lockedFileCount: 0 });

      clearAllSnapshots();

      expect(getSnapshot('proj-1')).toBeNull();
      expect(getSnapshot('proj-2')).toBeNull();
    });
  });
});
