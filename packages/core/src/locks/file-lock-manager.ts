/**
 * File Lock Manager
 * 
 * Prevents multiple agents from modifying the same files simultaneously.
 * Implements the locking protocol defined in MASTER_ARCHITECTURE.md.
 * 
 * Key behaviors:
 * - Locks are acquired before a task starts
 * - Locks are held until the task's PR is merged
 * - Conflicts between non-dependent tasks escalate to human
 * - Locks have TTL to prevent zombie locks
 */

import { db } from '@soloenterprise/db';
import { fileLocks, tasks } from '@soloenterprise/db/schema';
import { eq, and, lt, inArray } from 'drizzle-orm';

// Default lock TTL: 2 hours (agent should heartbeat or release before this)
const DEFAULT_LOCK_TTL_MS = 2 * 60 * 60 * 1000;

export interface LockResult {
  success: boolean;
  acquired: string[];
  conflicts: LockConflict[];
}

export interface LockConflict {
  filePath: string;
  heldByTaskId: string;
  heldByAgent: string;
  isDependency: boolean;
}

export interface LockStatus {
  filePath: string;
  isLocked: boolean;
  taskId?: string;
  agentType?: string;
  expiresAt?: Date;
}

/**
 * Acquire locks for a set of files.
 * 
 * @param filePaths - Files the task will modify
 * @param taskId - Task requesting the locks
 * @param agentType - Type of agent (backend, frontend, etc.)
 * @param branch - Git branch for the work
 * @param ttlMs - Lock TTL in milliseconds (optional)
 */
export async function acquireLocks(
  filePaths: string[],
  taskId: string,
  agentType: 'orchestrator' | 'backend' | 'frontend' | 'qa' | 'devops' | 'feedback' | 'scoper' | 'client-reporter',
  branch: string,
  ttlMs: number = DEFAULT_LOCK_TTL_MS
): Promise<LockResult> {
  if (filePaths.length === 0) {
    return { success: true, acquired: [], conflicts: [] };
  }

  // Get task's dependencies
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
  });

  const dependencies = task?.dependsOn ?? [];

  // Check for existing locks
  const existingLocks = await db
    .select()
    .from(fileLocks)
    .where(inArray(fileLocks.filePath, filePaths));

  // Filter out expired locks
  const now = new Date();
  const activeLocks = existingLocks.filter(lock => lock.expiresAt > now);

  // Check for conflicts
  const conflicts: LockConflict[] = [];
  const alreadyLockedPaths = new Set<string>();

  for (const lock of activeLocks) {
    // Skip if this task already holds the lock
    if (lock.taskId === taskId) {
      alreadyLockedPaths.add(lock.filePath);
      continue;
    }

    const isDependency = dependencies.includes(lock.taskId);
    
    conflicts.push({
      filePath: lock.filePath,
      heldByTaskId: lock.taskId,
      heldByAgent: lock.agentType,
      isDependency,
    });
  }

  // If any conflicts with non-dependencies, fail
  const blockingConflicts = conflicts.filter(c => !c.isDependency);
  if (blockingConflicts.length > 0) {
    return {
      success: false,
      acquired: [],
      conflicts,
    };
  }

  // If conflicts only with dependencies, task should be blocked (not acquire locks)
  if (conflicts.length > 0) {
    return {
      success: false,
      acquired: [],
      conflicts,
    };
  }

  // Acquire locks for files we don't already have
  const pathsToLock = filePaths.filter(p => !alreadyLockedPaths.has(p));
  const expiresAt = new Date(Date.now() + ttlMs);

  if (pathsToLock.length > 0) {
    // Clean up any expired locks for these paths first
    await db
      .delete(fileLocks)
      .where(
        and(
          inArray(fileLocks.filePath, pathsToLock),
          lt(fileLocks.expiresAt, now)
        )
      );

    // Insert new locks
    await db.insert(fileLocks).values(
      pathsToLock.map(filePath => ({
        filePath,
        taskId,
        agentType,
        branch,
        expiresAt,
        reason: `Acquired by task ${taskId}`,
      }))
    );
  }

  return {
    success: true,
    acquired: pathsToLock,
    conflicts: [],
  };
}

/**
 * Release all locks held by a task.
 * Called when a task completes or fails.
 */
export async function releaseLocks(taskId: string): Promise<number> {
  const result = await db
    .delete(fileLocks)
    .where(eq(fileLocks.taskId, taskId))
    .returning();

  return result.length;
}

/**
 * Check lock status for a set of files.
 */
export async function checkLocks(filePaths: string[]): Promise<LockStatus[]> {
  if (filePaths.length === 0) {
    return [];
  }

  const now = new Date();
  
  const locks = await db
    .select()
    .from(fileLocks)
    .where(inArray(fileLocks.filePath, filePaths));

  // Build map of locked files
  const lockMap = new Map<string, typeof locks[number]>();
  for (const lock of locks) {
    if (lock.expiresAt > now) {
      lockMap.set(lock.filePath, lock);
    }
  }

  // Return status for each requested path
  return filePaths.map(filePath => {
    const lock = lockMap.get(filePath);
    if (lock) {
      return {
        filePath,
        isLocked: true,
        taskId: lock.taskId,
        agentType: lock.agentType,
        expiresAt: lock.expiresAt,
      };
    }
    return {
      filePath,
      isLocked: false,
    };
  });
}

/**
 * Extend lock TTL (heartbeat).
 * Agents should call this periodically for long-running tasks.
 */
export async function extendLocks(
  taskId: string,
  ttlMs: number = DEFAULT_LOCK_TTL_MS
): Promise<number> {
  const expiresAt = new Date(Date.now() + ttlMs);
  
  const result = await db
    .update(fileLocks)
    .set({ expiresAt })
    .where(eq(fileLocks.taskId, taskId))
    .returning();

  return result.length;
}

/**
 * Force release locks (human only).
 * Used when a task is stuck and human needs to intervene.
 */
export async function forceReleaseLocks(
  filePaths: string[],
  reason: string
): Promise<number> {
  console.warn(`[FileLockManager] Force releasing locks: ${filePaths.join(', ')} - Reason: ${reason}`);
  
  const result = await db
    .delete(fileLocks)
    .where(inArray(fileLocks.filePath, filePaths))
    .returning();

  return result.length;
}

/**
 * Get all locks for a task.
 */
export async function getTaskLocks(taskId: string): Promise<LockStatus[]> {
  const locks = await db
    .select()
    .from(fileLocks)
    .where(eq(fileLocks.taskId, taskId));

  return locks.map(lock => ({
    filePath: lock.filePath,
    isLocked: true,
    taskId: lock.taskId,
    agentType: lock.agentType,
    expiresAt: lock.expiresAt,
  }));
}

/**
 * Clean up expired locks.
 * Should be run periodically (e.g., every 5 minutes).
 */
export async function cleanupExpiredLocks(): Promise<number> {
  const now = new Date();
  
  const result = await db
    .delete(fileLocks)
    .where(lt(fileLocks.expiresAt, now))
    .returning();

  if (result.length > 0) {
    console.log(`[FileLockManager] Cleaned up ${result.length} expired locks`);
  }

  return result.length;
}
