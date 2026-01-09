/**
 * Task Events Pub/Sub
 *
 * Redis-based pub/sub for task status changes.
 * Used to notify the frontend when tasks complete without polling.
 */

import { Redis } from 'ioredis';
import { createRedisConnection } from '../utils/redis';

const TASK_EVENTS_CHANNEL = 'soloenterprise:task-events';

export interface TaskEvent {
  type: 'task-updated' | 'task-completed' | 'task-failed' | 'task-waiting-human';
  taskId: string;
  status: string;
  timestamp: number;
}

// Publisher singleton
let publisher: Redis | null = null;

/**
 * Get or create the publisher Redis connection.
 */
function getPublisher(): Redis {
  if (!publisher) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is required');
    }
    publisher = createRedisConnection(redisUrl);
  }
  return publisher!;
}

/**
 * Publish a task event.
 * Call this from the worker when a task status changes.
 */
export async function publishTaskEvent(event: TaskEvent): Promise<void> {
  const redis = getPublisher();
  await redis.publish(TASK_EVENTS_CHANNEL, JSON.stringify(event));
}

/**
 * Create a subscriber for task events.
 * Returns a new Redis connection configured for pub/sub.
 */
export function createTaskEventSubscriber(): Redis {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL environment variable is required');
  }
  const subscriber = createRedisConnection(redisUrl);
  subscriber.subscribe(TASK_EVENTS_CHANNEL);
  return subscriber;
}

/**
 * Get the task events channel name.
 */
export function getTaskEventsChannel(): string {
  return TASK_EVENTS_CHANNEL;
}

/**
 * Close the publisher connection.
 */
export async function closePublisher(): Promise<void> {
  if (publisher) {
    await publisher.quit();
    publisher = null;
  }
}
