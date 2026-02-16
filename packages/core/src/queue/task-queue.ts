/**
 * Task Queue
 * 
 * Uses BullMQ for reliable task queue management.
 * Handles task assignment, retries, and state transitions.
 * 
 * Key behaviors:
 * - Tasks are queued per agent type
 * - 3-strike rule: escalate to human after 3 failures
 * - Priority-based processing
 */

import { Queue, Worker, Job, QueueEvents, ConnectionOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { db } from '@soloenterprise/db';
import { tasks, questions } from '@soloenterprise/db/schema';
import { eq } from 'drizzle-orm';

// Queue names per agent type
const QUEUE_NAMES = {
  orchestrator: 'orchestrator-tasks',
  backend: 'backend-tasks',
  frontend: 'frontend-tasks',
  qa: 'qa-tasks',
  devops: 'devops-tasks',       // Phase 7 — NO ACTIVE WORKER (guard in CommandExecutor)
  feedback: 'feedback-tasks',   // NO ACTIVE WORKER (guard in CommandExecutor)
  scoper: 'scoper-tasks',
  'client-reporter': 'client-reporter-tasks',
} as const;

type AgentType = keyof typeof QUEUE_NAMES;

// Job data structure
export interface TaskJobData {
  taskId: string;
  projectId: string;
  name: string;
  description: string;
  context: Record<string, unknown>;
  filesToModify: string[];
  requiredGates: string[];
  attemptNumber: number;
}

// Job result structure
export interface TaskJobResult {
  success: boolean;
  summary?: string;
  artifactIds?: string[];
  prUrl?: string;
  error?: string;
}

// Redis connection
let redisConnection: Redis | null = null;

function getRedisConnection(): ConnectionOptions {
  if (!redisConnection) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is required');
    }
    // Upstash requires TLS - detect by rediss:// or upstash.io in URL
    const useTls = redisUrl.startsWith('rediss://') || redisUrl.includes('upstash.io');
    redisConnection = new Redis(redisUrl, {
      maxRetriesPerRequest: null, // Required by BullMQ
      tls: useTls ? {} : undefined,
    });
  }
  // Cast to ConnectionOptions to handle ioredis version mismatch between project and BullMQ
  return redisConnection as unknown as ConnectionOptions;
}

// Queue instances cache
const queues = new Map<AgentType, Queue<TaskJobData, TaskJobResult>>();

/**
 * Get or create a queue for an agent type.
 */
export function getQueue(agentType: AgentType): Queue<TaskJobData, TaskJobResult> {
  const existingQueue = queues.get(agentType);
  if (existingQueue) {
    return existingQueue;
  }

  const newQueue = new Queue<TaskJobData, TaskJobResult, string>(QUEUE_NAMES[agentType], {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 1, // We handle retries at the application level (3-strike rule)
      removeOnComplete: {
        age: 24 * 60 * 60, // Keep completed jobs for 24 hours
        count: 1000,
      },
      removeOnFail: {
        age: 7 * 24 * 60 * 60, // Keep failed jobs for 7 days
      },
    },
  });
  queues.set(agentType, newQueue);

  return newQueue;
}

/**
 * Add a task to the appropriate agent queue.
 */
export async function enqueueTask(
  taskId: string,
  agentType: AgentType,
  priority: 'critical' | 'high' | 'medium' | 'low' = 'medium'
): Promise<Job<TaskJobData, TaskJobResult>> {
  // Fetch task from database
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
  });

  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  // Map priority to BullMQ priority (lower number = higher priority)
  const priorityMap = {
    critical: 1,
    high: 2,
    medium: 3,
    low: 4,
  };

  const queue = getQueue(agentType);

  // Use timestamp in job ID to ensure uniqueness when re-queuing after human answers
  // Without this, re-queuing the same task (e.g., after answering a question) would
  // silently fail because BullMQ ignores duplicate job IDs
  const jobId = `task-${taskId}-attempt-${task.attemptCount + 1}-${Date.now()}`;

  console.log(`[TaskQueue] Adding job ${jobId} to ${agentType} queue...`);

  const job = await queue.add(
    task.name,
    {
      taskId: task.id,
      projectId: task.projectId,
      name: task.name,
      description: task.description,
      context: task.context ?? {},
      filesToModify: task.filesToModify ?? [],
      requiredGates: task.requiredGates ?? [],
      attemptNumber: task.attemptCount + 1,
    },
    {
      priority: priorityMap[priority],
      jobId,
    }
  );

  // Update task status to queued
  await db
    .update(tasks)
    .set({
      status: 'queued',
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  console.log(`[TaskQueue] Enqueued task ${taskId} to ${agentType} queue (job: ${job.id})`);

  return job;
}

/**
 * Mark a task as started.
 */
export async function markTaskStarted(taskId: string, agentInstanceId: string): Promise<void> {
  await db
    .update(tasks)
    .set({
      status: 'running',
      assignedAgentId: agentInstanceId,
      startedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));
}

/**
 * Mark a task as completed.
 */
export async function markTaskCompleted(
  taskId: string,
  result: TaskJobResult
): Promise<void> {
  await db
    .update(tasks)
    .set({
      status: 'completed',
      result,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  console.log(`[TaskQueue] Task ${taskId} completed`);
}

/**
 * Mark a task as failed and handle retry logic.
 * Implements the 3-strike rule.
 */
export async function markTaskFailed(
  taskId: string,
  error: string
): Promise<{ shouldRetry: boolean; escalateToHuman: boolean }> {
  // Get current task state
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
  });

  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const newAttemptCount = task.attemptCount + 1;
  const maxAttempts = task.maxAttempts ?? 3;

  // Record the failure in context
  const previousAttempts = (task.context as any)?.previousAttempts ?? [];
  previousAttempts.push({
    attemptNumber: newAttemptCount,
    error,
    timestamp: new Date().toISOString(),
  });

  const shouldRetry = newAttemptCount < maxAttempts;
  const escalateToHuman = newAttemptCount >= maxAttempts;

  if (escalateToHuman) {
    // 3-strike rule: escalate to human
    await db
      .update(tasks)
      .set({
        status: 'waiting_human',
        attemptCount: newAttemptCount,
        context: {
          ...(task.context as object),
          previousAttempts,
        },
        result: { success: false, error },
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));

    // Create a question for human
    await db.insert(questions).values({
      projectId: task.projectId,
      taskId: task.id,
      question: `Task "${task.name}" has failed ${maxAttempts} times. Please review and decide how to proceed.`,
      context: `Last error: ${error}\n\nPrevious attempts:\n${previousAttempts.map((a: any) => `- Attempt ${a.attemptNumber}: ${a.error}`).join('\n')}`,
      askedByAgent: task.agentType,
      priority: 'blocking',
      isBlocking: true,
      suggestedAnswers: [
        'Retry with modified approach',
        'Reassign to different agent',
        'Cancel task',
        'Provide additional context',
      ],
    });

    console.log(`[TaskQueue] Task ${taskId} escalated to human after ${maxAttempts} failures`);
  } else {
    // Update for retry
    await db
      .update(tasks)
      .set({
        status: 'pending', // Will be re-queued
        attemptCount: newAttemptCount,
        context: {
          ...(task.context as object),
          previousAttempts,
        },
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));

    console.log(`[TaskQueue] Task ${taskId} failed (attempt ${newAttemptCount}/${maxAttempts}), will retry`);
  }

  return { shouldRetry, escalateToHuman };
}

/**
 * Create a worker for an agent type.
 * The processor function is where agent logic runs.
 */
export function createWorker(
  agentType: AgentType,
  processor: (job: Job<TaskJobData, TaskJobResult>) => Promise<TaskJobResult>
): Worker<TaskJobData, TaskJobResult> {
  const worker = new Worker<TaskJobData, TaskJobResult>(
    QUEUE_NAMES[agentType],
    processor,
    {
      connection: getRedisConnection(),
      concurrency: 1, // One task at a time per worker
    }
  );

  worker.on('completed', async (job, result) => {
    console.log(`[Worker:${agentType}] Job ${job.id} completed`);
    await markTaskCompleted(job.data.taskId, result);
  });

  worker.on('failed', async (job, error) => {
    console.error(`[Worker:${agentType}] Job ${job?.id} failed:`, error);
    if (job) {
      await markTaskFailed(job.data.taskId, error.message);
    }
  });

  worker.on('active', async (job) => {
    console.log(`[Worker:${agentType}] Starting job ${job.id}`);
    await markTaskStarted(job.data.taskId, `${agentType}-worker-${process.pid}`);
  });

  return worker;
}

/**
 * Get queue events for monitoring.
 */
export function getQueueEvents(agentType: AgentType): QueueEvents {
  return new QueueEvents(QUEUE_NAMES[agentType], {
    connection: getRedisConnection(),
  });
}

/**
 * Get queue statistics.
 */
export async function getQueueStats(agentType: AgentType): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const queue = getQueue(agentType);
  
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
}

/**
 * Remove a task from the queue.
 * Called when a task is cancelled to prevent it from being processed.
 */
export async function removeTaskFromQueue(taskId: string, agentType: AgentType): Promise<number> {
  const queue = getQueue(agentType);
  let removedCount = 0;

  // Get all jobs and remove those matching this taskId
  const waitingJobs = await queue.getWaiting();
  const delayedJobs = await queue.getDelayed();

  for (const job of [...waitingJobs, ...delayedJobs]) {
    if (job.data.taskId === taskId) {
      await job.remove();
      removedCount++;
      console.log(`[TaskQueue] Removed job ${job.id} for task ${taskId} from ${agentType} queue`);
    }
  }

  return removedCount;
}

/**
 * Remove multiple tasks from their queues.
 * Looks up each task's agentType and removes matching jobs from the correct queue.
 * Used by bulk-delete and bulk-cancel to keep Redis in sync with the database.
 */
export async function removeTaskJobsFromQueues(
  taskEntries: Array<{ taskId: string; agentType: string }>
): Promise<number> {
  // Group by agent type to minimize queue lookups
  const byAgentType = new Map<string, Set<string>>();
  for (const entry of taskEntries) {
    const existing = byAgentType.get(entry.agentType);
    if (existing) {
      existing.add(entry.taskId);
    } else {
      byAgentType.set(entry.agentType, new Set([entry.taskId]));
    }
  }

  let removedCount = 0;

  for (const [agentType, taskIds] of byAgentType) {
    if (!(agentType in QUEUE_NAMES)) continue;

    const queue = getQueue(agentType as AgentType);
    const waitingJobs = await queue.getWaiting();
    const delayedJobs = await queue.getDelayed();

    for (const job of [...waitingJobs, ...delayedJobs]) {
      if (taskIds.has(job.data.taskId)) {
        await job.remove();
        removedCount++;
        console.log(`[TaskQueue] Removed job ${job.id} for task ${job.data.taskId} from ${agentType} queue`);
      }
    }
  }

  return removedCount;
}

/**
 * Drain all queues — removes all waiting and delayed jobs from every queue.
 * Also cleans completed and failed jobs.
 * Use this for a full reset (e.g., admin cleanup).
 */
export async function drainAllQueues(): Promise<void> {
  const agentTypes = Object.keys(QUEUE_NAMES) as AgentType[];

  for (const agentType of agentTypes) {
    const queue = getQueue(agentType);
    const waiting = await queue.getWaitingCount();
    const delayed = await queue.getDelayedCount();

    await queue.drain();
    await queue.clean(0, 1000, 'completed');
    await queue.clean(0, 1000, 'failed');

    console.log(`[TaskQueue] Drained ${QUEUE_NAMES[agentType]}: removed ${waiting} waiting, ${delayed} delayed`);
  }
}

/**
 * Shutdown queues gracefully.
 */
export async function shutdown(): Promise<void> {
  console.log('[TaskQueue] Shutting down...');
  
  const closePromises = Array.from(queues.values()).map(q => q.close());
  await Promise.all(closePromises);
  
  if (redisConnection) {
    await redisConnection.quit();
    redisConnection = null;
  }
  
  queues.clear();
  console.log('[TaskQueue] Shutdown complete');
}
