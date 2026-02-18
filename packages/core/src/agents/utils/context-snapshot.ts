/**
 * Context Snapshot Cache
 *
 * In-memory snapshot of orchestrator context per project.
 * Compares current context against cached snapshot to detect changes.
 * When context is unchanged, returns a minimal summary (~50 tokens)
 * instead of the full state (~2000 tokens).
 *
 * Why in-memory (not Redis/DB):
 * - Orchestrator worker is single-process with concurrency: 1
 * - In-memory Map has zero latency, zero cost
 * - Naturally clears on worker restart (first call pays full cost)
 */

import { createHash } from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface ContextSnapshot {
  hash: string;
  content: string;
  metrics: ContextSnapshotMetrics;
  createdAt: number; // Date.now()
}

export interface ContextSnapshotMetrics {
  activeTaskCount: number;
  blockedTaskCount: number;
  pendingQuestionCount: number;
  lockedFileCount: number;
}

export interface ContextDiff {
  changed: boolean;
  summary: string; // Human-readable diff or "unchanged" message
}

// ============================================================================
// Cache
// ============================================================================

const SNAPSHOT_TTL_MS = 30 * 60 * 1000; // 30 minutes

const snapshotCache = new Map<string, ContextSnapshot>();

/**
 * Compute MD5 hash of context content.
 */
export function computeContextHash(content: string): string {
  return createHash('md5').update(content).digest('hex');
}

/**
 * Get cached snapshot for a project, or null if expired/missing.
 */
export function getSnapshot(projectId: string): ContextSnapshot | null {
  const snapshot = snapshotCache.get(projectId);
  if (!snapshot) return null;

  // Check TTL
  if (Date.now() - snapshot.createdAt > SNAPSHOT_TTL_MS) {
    snapshotCache.delete(projectId);
    return null;
  }

  return snapshot;
}

/**
 * Store a new snapshot for a project.
 */
export function setSnapshot(
  projectId: string,
  content: string,
  metrics: ContextSnapshotMetrics
): void {
  snapshotCache.set(projectId, {
    hash: computeContextHash(content),
    content,
    metrics,
    createdAt: Date.now(),
  });
}

/**
 * Compute a human-readable diff between previous and current context metrics.
 */
export function computeContextDiff(
  previous: ContextSnapshotMetrics,
  current: ContextSnapshotMetrics
): ContextDiff {
  const changes: string[] = [];

  const activeChange = current.activeTaskCount - previous.activeTaskCount;
  if (activeChange !== 0) {
    changes.push(`Active tasks: ${previous.activeTaskCount} → ${current.activeTaskCount} (${activeChange > 0 ? '+' : ''}${activeChange})`);
  }

  const blockedChange = current.blockedTaskCount - previous.blockedTaskCount;
  if (blockedChange !== 0) {
    changes.push(`Blocked tasks: ${previous.blockedTaskCount} → ${current.blockedTaskCount} (${blockedChange > 0 ? '+' : ''}${blockedChange})`);
  }

  const questionChange = current.pendingQuestionCount - previous.pendingQuestionCount;
  if (questionChange !== 0) {
    changes.push(`Pending questions: ${previous.pendingQuestionCount} → ${current.pendingQuestionCount} (${questionChange > 0 ? '+' : ''}${questionChange})`);
  }

  const lockChange = current.lockedFileCount - previous.lockedFileCount;
  if (lockChange !== 0) {
    changes.push(`File locks: ${previous.lockedFileCount} → ${current.lockedFileCount} (${lockChange > 0 ? '+' : ''}${lockChange})`);
  }

  if (changes.length === 0) {
    return {
      changed: false,
      summary: `Project state unchanged since last run. ${current.activeTaskCount} active, ${current.blockedTaskCount} blocked, ${current.pendingQuestionCount} questions.`,
    };
  }

  return {
    changed: true,
    summary: `## Changes Since Last Run\n${changes.map(c => `- ${c}`).join('\n')}`,
  };
}

/**
 * Clear all snapshots. Useful for testing.
 */
export function clearAllSnapshots(): void {
  snapshotCache.clear();
}
