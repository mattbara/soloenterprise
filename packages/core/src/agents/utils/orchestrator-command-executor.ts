/**
 * Orchestrator Command Executor
 *
 * Executes parsed orchestrator commands:
 * - Creates child tasks in the database and queues them
 * - Applies status updates to existing tasks
 * - Manages file locks (acquire/release)
 *
 * NOTE: Questions are handled in orchestrator-agent.ts, not here.
 */

import { db } from '@soloenterprise/db';
import { tasks, projects } from '@soloenterprise/db/schema';
import { eq, and, inArray, like } from 'drizzle-orm';
import { updateTaskStatus } from '../../services/task-service';
import { acquireLocks, releaseLocks } from '../../locks/file-lock-manager';
import { enqueueTask } from '../../queue/task-queue';
import type {
  OrchestratorParseResult,
  OrchestratorTaskDefinition,
  OrchestratorStatusUpdate,
  OrchestratorFileLock,
} from './orchestrator-output-parser';

// ============================================================================
// Types
// ============================================================================

export interface ExecutionResult {
  success: boolean;
  tasksCreated: string[];
  statusesUpdated: string[];
  locksAcquired: string[];
  locksReleased: string[];
  errors: string[];
}

// ============================================================================
// Task Creation
// ============================================================================

/**
 * Check if task has dependencies that block immediate queuing.
 */
function hasDependencies(dependencies: string[]): boolean {
  return dependencies && dependencies.length > 0;
}

/**
 * Create multiple child tasks from orchestrator output.
 *
 * Uses a two-pass approach to handle placeholder ID → UUID mapping:
 * 1. First pass: Create all tasks WITHOUT dependencies, build ID mapping
 * 2. Second pass: Update tasks with resolved dependency UUIDs
 * 3. Queue tasks that have no (or resolved) dependencies
 *
 * This solves the problem where orchestrator uses placeholder IDs like "TASK-001"
 * but the database expects real UUIDs in the dependsOn column.
 */
async function createTasks(
  projectId: string,
  parentTaskId: string,
  taskDefs: OrchestratorTaskDefinition[]
): Promise<{ created: string[]; errors: string[]; idMapping: Map<string, string> }> {
  const created: string[] = [];
  const errors: string[] = [];

  // Map placeholder IDs (e.g., "TASK-001") to real UUIDs
  const idMapping = new Map<string, string>();

  // Verify project exists once
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project) {
    errors.push(`Project not found: ${projectId}`);
    return { created, errors, idMapping };
  }

  console.log(`[CommandExecutor] Creating ${taskDefs.length} tasks with two-pass dependency resolution...`);

  // =========================================================================
  // PASS 1: Create all tasks WITHOUT dependencies (empty dependsOn)
  // =========================================================================
  for (const taskDef of taskDefs) {
    try {
      const [task] = await db
        .insert(tasks)
        .values({
          projectId,
          parentTaskId,
          name: taskDef.name,
          description: taskDef.description,
          agentType: taskDef.agent,
          priority: taskDef.priority,
          status: 'pending',
          dependsOn: [], // Empty for now - will be updated in pass 2
          filesToModify: taskDef.fileLocks ?? [],
          context: {},
        })
        .returning();

      created.push(task.id);

      // Build ID mapping: placeholder ID → real UUID
      if (taskDef.id) {
        idMapping.set(taskDef.id, task.id);
        console.log(`[CommandExecutor] Created task ${task.id}: "${task.name}" (placeholder: ${taskDef.id})`);
      } else {
        // If no placeholder ID, use the task name as a fallback mapping key
        idMapping.set(taskDef.name, task.id);
        console.log(`[CommandExecutor] Created task ${task.id}: "${task.name}" (no placeholder ID)`);
      }
    } catch (err) {
      const errorMsg = `Failed to create task "${taskDef.name}": ${err instanceof Error ? err.message : 'Unknown error'}`;
      console.error(`[CommandExecutor] ${errorMsg}`);
      errors.push(errorMsg);
    }
  }

  console.log(`[CommandExecutor] Pass 1 complete: ${created.length} tasks created, ID mapping has ${idMapping.size} entries`);

  // =========================================================================
  // PASS 2: Update tasks with resolved dependency UUIDs
  // =========================================================================
  for (const taskDef of taskDefs) {
    const placeholderId = taskDef.id ?? taskDef.name;
    const realTaskId = idMapping.get(placeholderId);

    if (!realTaskId) {
      // Task wasn't created successfully, skip
      continue;
    }

    const placeholderDeps = taskDef.dependencies ?? [];
    if (placeholderDeps.length === 0) {
      // No dependencies to resolve
      continue;
    }

    // Resolve placeholder dependency IDs to real UUIDs
    const resolvedDeps: string[] = [];
    const unresolvedDeps: string[] = [];

    for (const dep of placeholderDeps) {
      const resolvedId = idMapping.get(dep);
      if (resolvedId) {
        resolvedDeps.push(resolvedId);
        continue;
      }

      // Not in idMapping — check if it's an existing task UUID or UUID prefix
      const uuidFull = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const uuidPrefix = /^[0-9a-f]{7,}$/i;

      if (uuidFull.test(dep)) {
        // Full UUID — verify it exists
        const existing = await db.query.tasks.findFirst({
          where: and(eq(tasks.id, dep), eq(tasks.projectId, projectId)),
          columns: { id: true },
        });
        if (existing) {
          resolvedDeps.push(dep);
          console.log(`[CommandExecutor] Resolved existing task dependency: ${dep}`);
        } else {
          unresolvedDeps.push(dep);
        }
      } else if (uuidPrefix.test(dep)) {
        // Truncated UUID prefix — search by LIKE
        const matches = await db.query.tasks.findMany({
          where: and(like(tasks.id, `${dep}%`), eq(tasks.projectId, projectId)),
          columns: { id: true },
          limit: 2,
        });
        if (matches.length === 1) {
          resolvedDeps.push(matches[0].id);
          console.log(`[CommandExecutor] Resolved truncated UUID "${dep}" → ${matches[0].id}`);
        } else if (matches.length > 1) {
          console.warn(`[CommandExecutor] Ambiguous UUID prefix "${dep}" matches ${matches.length} tasks, skipping`);
          unresolvedDeps.push(dep);
        } else {
          unresolvedDeps.push(dep);
        }
      } else {
        unresolvedDeps.push(dep);
      }
    }

    if (unresolvedDeps.length > 0) {
      console.warn(`[CommandExecutor] Task "${taskDef.name}" has unresolved dependencies: [${unresolvedDeps.join(', ')}]`);
    }

    if (resolvedDeps.length > 0) {
      try {
        await db
          .update(tasks)
          .set({ dependsOn: resolvedDeps })
          .where(eq(tasks.id, realTaskId));

        console.log(`[CommandExecutor] Updated task ${realTaskId} with resolved dependencies: [${resolvedDeps.join(', ')}]`);
      } catch (err) {
        const errorMsg = `Failed to update dependencies for task "${taskDef.name}": ${err instanceof Error ? err.message : 'Unknown error'}`;
        console.error(`[CommandExecutor] ${errorMsg}`);
        errors.push(errorMsg);
      }
    }
  }

  console.log(`[CommandExecutor] Pass 2 complete: dependencies resolved`);

  // =========================================================================
  // PASS 3: Queue tasks that have no dependencies
  // =========================================================================
  for (const taskDef of taskDefs) {
    const placeholderId = taskDef.id ?? taskDef.name;
    const realTaskId = idMapping.get(placeholderId);

    if (!realTaskId) {
      continue;
    }

    const placeholderDeps = taskDef.dependencies ?? [];

    if (hasDependencies(placeholderDeps)) {
      // Resolve deps to show in log
      const resolvedDeps = placeholderDeps
        .map(dep => idMapping.get(dep) ?? dep)
        .join(', ');
      console.log(`[CommandExecutor] Task ${realTaskId} blocked by dependencies: [${resolvedDeps}] - staying 'pending'`);
    } else {
      try {
        await enqueueTask(realTaskId, taskDef.agent, taskDef.priority);
        console.log(`[CommandExecutor] Queued task ${realTaskId} to ${taskDef.agent}-tasks queue (no dependencies)`);
      } catch (err) {
        console.error(`[CommandExecutor] Failed to queue task ${realTaskId}:`, err);
      }
    }
  }

  return { created, errors, idMapping };
}

// ============================================================================
// Status Updates
// ============================================================================

/**
 * Apply status updates to existing tasks.
 *
 * @param parentTaskId - The orchestrator's own task ID (to skip self-referencing updates)
 * @param idMapping - Placeholder ID → real UUID mapping from task creation pass
 */
async function applyStatusUpdates(
  statusUpdates: OrchestratorStatusUpdate[],
  parentTaskId: string,
  idMapping: Map<string, string>
): Promise<{ updated: string[]; errors: string[] }> {
  const updated: string[] = [];
  const errors: string[] = [];

  for (const update of statusUpdates) {
    // Resolve placeholder IDs (e.g., "TASK-001") to real UUIDs via idMapping
    const resolvedId = idMapping.get(update.taskId) || update.taskId;
    if (resolvedId !== update.taskId) {
      console.log(`[CommandExecutor] Resolved status update target: ${update.taskId} → ${resolvedId}`);
    }

    // Skip self-referencing status updates — the orchestrator agent code already
    // handles its own task status (completed/failed/waiting_human).
    // Also handle truncated UUIDs (e.g., "b5819951" matching "b5819951-e9d9-4792-...")
    if (resolvedId === parentTaskId || parentTaskId.startsWith(resolvedId)) {
      console.log(`[CommandExecutor] Skipping self-referencing status update for orchestrator task ${update.taskId}`);
      continue;
    }

    try {
      // Verify task exists
      const task = await db.query.tasks.findFirst({
        where: eq(tasks.id, resolvedId),
      });

      if (!task) {
        errors.push(`Task not found: ${update.taskId} (resolved: ${resolvedId})`);
        continue;
      }

      // Map status to valid updateTaskStatus status
      // Note: OrchestratorStatusUpdate has different statuses than what updateTaskStatus accepts
      const validStatuses = ['pending', 'queued', 'running', 'waiting_human', 'blocked', 'completed', 'failed'] as const;
      if (!validStatuses.includes(update.status as any)) {
        errors.push(`Invalid status for task ${resolvedId}: ${update.status}`);
        continue;
      }

      await updateTaskStatus(
        resolvedId,
        update.status as typeof validStatuses[number],
        update.reason ? { success: update.status === 'completed', summary: update.reason } : undefined
      );

      updated.push(resolvedId);
      console.log(`[CommandExecutor] Updated task ${resolvedId} status to ${update.status}`);
    } catch (err) {
      const errorMsg = `Failed to update task ${resolvedId}: ${err instanceof Error ? err.message : 'Unknown error'}`;
      console.error(`[CommandExecutor] ${errorMsg}`);
      errors.push(errorMsg);
    }
  }

  return { updated, errors };
}

// ============================================================================
// File Lock Management
// ============================================================================

/**
 * Process file lock operations (acquire/release).
 *
 * Uses idMapping to resolve placeholder task IDs (e.g., "TASK-001") to real UUIDs.
 */
async function processFileLocks(
  fileLockOps: OrchestratorFileLock[],
  idMapping: Map<string, string>,
  defaultBranch: string = 'main'
): Promise<{ acquired: string[]; released: string[]; errors: string[] }> {
  const acquired: string[] = [];
  const released: string[] = [];
  const errors: string[] = [];

  // Group by action
  const acquireOps = fileLockOps.filter(op => op.action === 'acquire');
  const releaseOps = fileLockOps.filter(op => op.action === 'release');

  // Helper to resolve task ID (placeholder → UUID, or return as-is if already UUID)
  const resolveTaskId = (placeholderId: string): string | null => {
    // Try to resolve from mapping first
    const resolved = idMapping.get(placeholderId);
    if (resolved) {
      return resolved;
    }
    // If not in mapping, assume it's already a UUID (for existing tasks)
    // Basic UUID format check (8-4-4-4-12)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidPattern.test(placeholderId)) {
      return placeholderId;
    }
    return null;
  };

  // Process releases first (to free up locks before acquiring new ones)
  for (const op of releaseOps) {
    const realTaskId = resolveTaskId(op.taskId);
    if (!realTaskId) {
      errors.push(`Cannot release lock for ${op.path}: could not resolve task ID "${op.taskId}"`);
      continue;
    }

    try {
      const count = await releaseLocks(realTaskId);
      if (count > 0) {
        released.push(op.path);
        console.log(`[CommandExecutor] Released lock on ${op.path} for task ${realTaskId}`);
      } else {
        // Not an error - lock may have already been released or expired
        console.log(`[CommandExecutor] No lock found to release for ${op.path} (task ${realTaskId})`);
      }
    } catch (err) {
      const errorMsg = `Failed to release lock ${op.path}: ${err instanceof Error ? err.message : 'Unknown error'}`;
      console.error(`[CommandExecutor] ${errorMsg}`);
      errors.push(errorMsg);
    }
  }

  // Process acquires
  for (const op of acquireOps) {
    const realTaskId = resolveTaskId(op.taskId);
    if (!realTaskId) {
      errors.push(`Cannot acquire lock for ${op.path}: could not resolve task ID "${op.taskId}"`);
      continue;
    }

    try {
      // Get task to determine agent type
      const task = await db.query.tasks.findFirst({
        where: eq(tasks.id, realTaskId),
      });

      if (!task) {
        errors.push(`Cannot acquire lock for ${op.path}: task ${realTaskId} not found`);
        continue;
      }

      const result = await acquireLocks(
        [op.path],
        realTaskId,
        task.agentType,
        defaultBranch
      );

      if (result.success) {
        acquired.push(op.path);
        console.log(`[CommandExecutor] Acquired lock on ${op.path} for task ${realTaskId}`);
      } else {
        // Lock conflict
        const conflictInfo = result.conflicts
          .map(c => `${c.filePath} (held by ${c.heldByTaskId})`)
          .join(', ');
        errors.push(`Lock conflict for ${op.path}: ${conflictInfo}`);
        console.warn(`[CommandExecutor] Lock conflict: ${conflictInfo}`);
      }
    } catch (err) {
      const errorMsg = `Failed to acquire lock ${op.path}: ${err instanceof Error ? err.message : 'Unknown error'}`;
      console.error(`[CommandExecutor] ${errorMsg}`);
      errors.push(errorMsg);
    }
  }

  return { acquired, released, errors };
}

// ============================================================================
// Main Executor
// ============================================================================

/**
 * Execute all orchestrator commands from a parse result.
 *
 * NOTE: Questions are NOT handled here - they're processed in orchestrator-agent.ts
 */
export async function executeOrchestratorCommands(
  projectId: string,
  parentTaskId: string,
  parseResult: OrchestratorParseResult
): Promise<ExecutionResult> {
  const result: ExecutionResult = {
    success: true,
    tasksCreated: [],
    statusesUpdated: [],
    locksAcquired: [],
    locksReleased: [],
    errors: [],
  };

  // Skip if parse failed
  if (!parseResult.success) {
    console.warn('[CommandExecutor] Skipping execution - parse was not successful');
    result.success = false;
    result.errors.push('Parse result was not successful');
    return result;
  }

  console.log(`[CommandExecutor] Executing commands: ${parseResult.tasks.length} tasks, ${parseResult.statusUpdates.length} status updates, ${parseResult.fileLocks.length} file locks`);

  // ID mapping from placeholder IDs (e.g., "TASK-001") to real UUIDs
  let idMapping = new Map<string, string>();

  // 1. Create child tasks (with two-pass dependency resolution)
  if (parseResult.tasks.length > 0) {
    const taskResult = await createTasks(projectId, parentTaskId, parseResult.tasks);
    result.tasksCreated = taskResult.created;
    result.errors.push(...taskResult.errors);
    idMapping = taskResult.idMapping;
  }

  // 2. Apply status updates (pass parentTaskId to skip self-referencing updates)
  if (parseResult.statusUpdates.length > 0) {
    const statusResult = await applyStatusUpdates(parseResult.statusUpdates, parentTaskId, idMapping);
    result.statusesUpdated = statusResult.updated;
    result.errors.push(...statusResult.errors);
  }

  // 3. Process file locks (using ID mapping to resolve placeholder task IDs)
  if (parseResult.fileLocks.length > 0) {
    const lockResult = await processFileLocks(parseResult.fileLocks, idMapping);
    result.locksAcquired = lockResult.acquired;
    result.locksReleased = lockResult.released;
    result.errors.push(...lockResult.errors);
  }

  // Determine overall success (allow partial success)
  result.success = result.errors.length === 0;

  console.log(`[CommandExecutor] Execution complete: ${result.tasksCreated.length} tasks created, ${result.statusesUpdated.length} statuses updated, ${result.locksAcquired.length} locks acquired, ${result.locksReleased.length} locks released, ${result.errors.length} errors`);

  return result;
}

/**
 * Get empty execution result for error cases.
 */
export function getEmptyExecutionResult(): ExecutionResult {
  return {
    success: false,
    tasksCreated: [],
    statusesUpdated: [],
    locksAcquired: [],
    locksReleased: [],
    errors: [],
  };
}
