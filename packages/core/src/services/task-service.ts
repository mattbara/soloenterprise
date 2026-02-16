/**
 * Task Service
 *
 * Bridges the database and queue systems.
 * Provides high-level operations for task management.
 */

import { db } from '@soloenterprise/db';
import { tasks, projects } from '@soloenterprise/db/schema';
import { eq } from 'drizzle-orm';
import { Queue } from 'bullmq';
import { getSharedRedisConnection, closeSharedRedisConnection } from '../utils/index';
import { publishTaskEvent, type TaskEvent } from './task-events';

// Task creation input
export interface CreateTaskInput {
  name: string;
  description: string;
  agentType: 'orchestrator' | 'backend' | 'frontend' | 'qa' | 'devops' | 'feedback' | 'echo' | 'scoper' | 'client-reporter';
  priority?: 'critical' | 'high' | 'medium' | 'low';
  context?: Record<string, unknown>;
  filesToModify?: string[];
  requiredGates?: string[];
  dependsOn?: string[];
}

// Task job data for queue
export interface TaskJobData {
  taskId: string;
  projectId: string;
  name: string;
  description: string;
  context: Record<string, unknown>;
  attemptNumber: number;
}

// Queue cache
const queues = new Map<string, Queue>();

function getQueue(queueName: string): Queue {
  const existing = queues.get(queueName);
  if (existing) return existing;

  const queue = new Queue(queueName, {
    connection: getSharedRedisConnection(),
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
      removeOnFail: { age: 7 * 24 * 60 * 60 },
    },
  });
  queues.set(queueName, queue);
  return queue;
}

/**
 * Create a task in the database and enqueue it for processing.
 */
export async function createTask(
  projectId: string,
  input: CreateTaskInput
): Promise<{ taskId: string; jobId: string }> {
  // Verify project exists
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });

  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  // Insert task into database
  const [task] = await db
    .insert(tasks)
    .values({
      projectId,
      name: input.name,
      description: input.description,
      agentType: input.agentType === 'echo' ? 'backend' : input.agentType, // Map echo to backend for schema
      priority: input.priority ?? 'medium',
      context: input.context ?? {},
      filesToModify: input.filesToModify ?? [],
      requiredGates: input.requiredGates ?? [],
      dependsOn: input.dependsOn ?? [],
      status: 'queued',
    })
    .returning();

  // Determine queue name
  const queueName = input.agentType === 'echo' ? 'echo-tasks' : `${input.agentType}-tasks`;
  const queue = getQueue(queueName);

  // Add job to queue
  const job = await queue.add(
    task.name,
    {
      taskId: task.id,
      projectId: task.projectId,
      name: task.name,
      description: task.description,
      context: task.context ?? {},
      attemptNumber: 1,
    } satisfies TaskJobData,
    {
      jobId: `task-${task.id}-attempt-1`,
    }
  );

  console.log(`[TaskService] Created task ${task.id} and enqueued to ${queueName}`);

  return { taskId: task.id, jobId: job.id! };
}

/**
 * Update a task's status and optionally its result/outputs.
 */
export async function updateTaskStatus(
  taskId: string,
  status: 'pending' | 'queued' | 'running' | 'waiting_human' | 'blocked' | 'completed' | 'failed',
  result?: {
    success: boolean;
    summary?: string;
    error?: string;
    outputs?: Record<string, unknown>;
  }
): Promise<void> {
  const updateData: Record<string, unknown> = {
    status,
    updatedAt: new Date(),
  };

  if (status === 'running') {
    updateData.startedAt = new Date();
  }

  if (status === 'completed' || status === 'failed') {
    updateData.completedAt = new Date();
    if (result) {
      updateData.result = result;
    }
  }

  if (status === 'failed') {
    // Increment attempt count
    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, taskId),
    });
    if (task) {
      updateData.attemptCount = task.attemptCount + 1;
    }
  }

  await db.update(tasks).set(updateData).where(eq(tasks.id, taskId));

  console.log(`[TaskService] Updated task ${taskId} status to ${status}`);

  // Publish task event for SSE subscribers
  const eventType: TaskEvent['type'] =
    status === 'completed' ? 'task-completed' :
    status === 'failed' ? 'task-failed' :
    status === 'waiting_human' ? 'task-waiting-human' :
    'task-updated';

  await publishTaskEvent({
    type: eventType,
    taskId,
    status,
    timestamp: Date.now(),
  });
}

/**
 * Get a task by ID.
 */
export async function getTask(taskId: string) {
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    with: {
      project: true,
    },
  });

  return task;
}

/**
 * Shutdown and cleanup.
 */
export async function shutdown(): Promise<void> {
  for (const queue of queues.values()) {
    await queue.close();
  }
  queues.clear();
  await closeSharedRedisConnection();
}
