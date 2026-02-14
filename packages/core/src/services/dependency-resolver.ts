/**
 * Dependency Resolver
 *
 * Automatically queues blocked tasks when their dependencies complete.
 * Called after any task completes successfully.
 */

import { db } from '@soloenterprise/db';
import { tasks } from '@soloenterprise/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { enqueueTask } from '../queue/task-queue';
import { generateTechSpec } from '../agents/utils/architect-spec-generator';

/**
 * Check and queue tasks that were waiting on the completed task.
 * Called when any task completes successfully.
 *
 * Flow:
 * 1. Find all pending tasks
 * 2. For each pending task, check if it depends on the completed task
 * 3. If yes, check if ALL of its dependencies are now completed
 * 4. If all deps are met, queue the task
 */
export async function resolveCompletedDependency(completedTaskId: string): Promise<void> {
  console.log(`[DependencyResolver] Checking tasks blocked by ${completedTaskId}`);

  try {
    // Find all pending tasks that might be waiting on dependencies
    const pendingTasks = await db.query.tasks.findMany({
      where: eq(tasks.status, 'pending'),
    });

    if (pendingTasks.length === 0) {
      console.log('[DependencyResolver] No pending tasks found');
      return;
    }

    console.log(`[DependencyResolver] Found ${pendingTasks.length} pending task(s) to check`);

    let queuedCount = 0;

    for (const task of pendingTasks) {
      const deps = task.dependsOn as string[] | null;

      // Skip tasks with no dependencies (they should have been queued already)
      if (!deps || deps.length === 0) {
        continue;
      }

      // Check if this task depends on the completed task
      if (!deps.includes(completedTaskId)) {
        continue;
      }

      console.log(`[DependencyResolver] Task ${task.id} ("${task.name}") depends on completed task ${completedTaskId}`);

      // Check if ALL dependencies are now completed
      const depStatuses = await db.query.tasks.findMany({
        where: inArray(tasks.id, deps),
        columns: { id: true, status: true },
      });

      // Count how many dependencies are completed
      const completedDeps = depStatuses.filter(d => d.status === 'completed');
      const allDepsCompleted = completedDeps.length === deps.length;

      if (allDepsCompleted) {
        console.log(`[DependencyResolver] All ${deps.length} dependencies met for task ${task.id}, queuing...`);

        // Generate architect tech spec before queuing (dependencies just resolved)
        try {
          const specResult = await generateTechSpec(task.id);
          if (specResult) {
            console.log(`[DependencyResolver] Tech spec generated for ${task.id}: ~${specResult.tokens} tokens`);
          }
        } catch (err) {
          console.warn(`[DependencyResolver] Tech spec generation failed for ${task.id}:`, err);
        }

        try {
          await enqueueTask(task.id, task.agentType, task.priority);
          queuedCount++;
          console.log(`[DependencyResolver] Queued task ${task.id} to ${task.agentType}-tasks queue`);
        } catch (err) {
          console.error(`[DependencyResolver] Failed to queue task ${task.id}:`, err);
        }
      } else {
        // Show which dependencies are still pending
        const stillPending = deps.filter(depId => {
          const found = depStatuses.find(d => d.id === depId);
          return !found || found.status !== 'completed';
        });
        console.log(
          `[DependencyResolver] Task ${task.id} still waiting on ${stillPending.length} dep(s): [${stillPending.slice(0, 3).join(', ')}${stillPending.length > 3 ? '...' : ''}]`
        );
      }
    }

    if (queuedCount > 0) {
      console.log(`[DependencyResolver] Queued ${queuedCount} task(s) that were waiting on ${completedTaskId}`);
    } else {
      console.log(`[DependencyResolver] No tasks became unblocked by ${completedTaskId}`);
    }
  } catch (error) {
    console.error('[DependencyResolver] Error resolving dependencies:', error);
  }
}

/**
 * When a task fails, mark all tasks that depend on it as 'blocked'.
 * This prevents them from waiting forever for a task that will never complete.
 */
export async function handleFailedDependency(failedTaskId: string): Promise<void> {
  console.log(`[DependencyResolver] Handling failed task ${failedTaskId}`);

  try {
    // Find all pending tasks that depend on this failed task
    const pendingTasks = await db.query.tasks.findMany({
      where: eq(tasks.status, 'pending'),
    });

    let blockedCount = 0;

    for (const task of pendingTasks) {
      const deps = task.dependsOn as string[] | null;
      if (!deps || !deps.includes(failedTaskId)) {
        continue;
      }

      // This task depends on the failed task - mark as blocked
      await db.update(tasks)
        .set({
          status: 'blocked',
          updatedAt: new Date(),
          context: {
            ...(task.context as object || {}),
            blockedReason: `Dependency task ${failedTaskId.substring(0, 8)} failed`,
            blockedAt: new Date().toISOString(),
            blockedByTaskId: failedTaskId,
          },
        })
        .where(eq(tasks.id, task.id));

      console.log(`[DependencyResolver] Blocked task ${task.id} ("${task.name}") - depends on failed task`);
      blockedCount++;
    }

    if (blockedCount > 0) {
      console.log(`[DependencyResolver] Blocked ${blockedCount} task(s) due to failed dependency ${failedTaskId}`);
    }
  } catch (error) {
    console.error('[DependencyResolver] Error handling failed dependency:', error);
  }
}

/**
 * When a blocked task's dependency is retried and completes,
 * unblock tasks that were waiting on it.
 */
export async function unblockDependentTasks(completedTaskId: string): Promise<void> {
  console.log(`[DependencyResolver] Checking for blocked tasks to unblock after ${completedTaskId} completed`);

  try {
    // Find blocked tasks that were blocked by this specific task
    const blockedTasks = await db.query.tasks.findMany({
      where: eq(tasks.status, 'blocked'),
    });

    if (blockedTasks.length === 0) {
      return;
    }

    let unblockedCount = 0;

    for (const task of blockedTasks) {
      const context = task.context as Record<string, unknown> | null;
      if (context?.blockedByTaskId !== completedTaskId) {
        continue;
      }

      // Check if ALL dependencies are now completed
      const deps = task.dependsOn as string[] | null;
      if (!deps || deps.length === 0) {
        continue;
      }

      const depStatuses = await db.query.tasks.findMany({
        where: inArray(tasks.id, deps),
        columns: { id: true, status: true },
      });

      const allDepsCompleted = depStatuses.every(d => d.status === 'completed');

      if (allDepsCompleted) {
        // Unblock and queue
        await db.update(tasks)
          .set({
            status: 'pending',
            updatedAt: new Date(),
            context: {
              ...(context || {}),
              blockedReason: null,
              blockedAt: null,
              blockedByTaskId: null,
              unblockedAt: new Date().toISOString(),
            },
          })
          .where(eq(tasks.id, task.id));

        // Generate architect tech spec before queuing (dependencies just resolved)
        try {
          const specResult = await generateTechSpec(task.id);
          if (specResult) {
            console.log(`[DependencyResolver] Tech spec generated for ${task.id}: ~${specResult.tokens} tokens`);
          }
        } catch (err) {
          console.warn(`[DependencyResolver] Tech spec generation failed for ${task.id}:`, err);
        }

        await enqueueTask(task.id, task.agentType, task.priority);
        console.log(`[DependencyResolver] Unblocked and queued task ${task.id} ("${task.name}")`);
        unblockedCount++;
      }
    }

    if (unblockedCount > 0) {
      console.log(`[DependencyResolver] Unblocked ${unblockedCount} task(s) after ${completedTaskId} completed`);
    }
  } catch (error) {
    console.error('[DependencyResolver] Error unblocking dependent tasks:', error);
  }
}
