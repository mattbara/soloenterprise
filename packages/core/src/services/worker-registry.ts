/**
 * Worker Registry Service
 *
 * Tracks worker status using Redis. Workers register themselves
 * and send periodic heartbeats. The API can query worker status.
 */

import { createRedisConnection } from '../utils/redis';

// Worker types supported
export type WorkerType = 'backend' | 'echo' | 'orchestrator' | 'frontend' | 'qa' | 'devops' | 'feedback' | 'scoper' | 'client-reporter';

// Worker status
export interface WorkerStatus {
  type: WorkerType;
  status: 'running' | 'stopped';
  pid: number | null;
  lastHeartbeat: number | null;
  lastTaskTime: number | null;
  startedAt: number | null;
}

// Heartbeat TTL in seconds (worker considered dead if no heartbeat within this time)
const HEARTBEAT_TTL_SECONDS = 30;

// Heartbeat interval in milliseconds
export const HEARTBEAT_INTERVAL_MS = 10000;

// Default idle timeout in milliseconds (5 minutes)
export const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

// Redis key prefixes
const KEY_PREFIX = 'worker:';

function getRedisKey(type: WorkerType, suffix: string): string {
  return `${KEY_PREFIX}${type}:${suffix}`;
}

// Lazy Redis connection for registry operations
let registryRedis: ReturnType<typeof createRedisConnection> | null = null;

function getRegistryRedis() {
  if (!registryRedis) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is required');
    }
    registryRedis = createRedisConnection(redisUrl);
  }
  return registryRedis;
}

/**
 * Register a worker as running.
 * Sets status to running, stores PID, and sets initial heartbeat.
 */
export async function registerWorker(type: WorkerType, pid: number): Promise<void> {
  const redis = getRegistryRedis();
  const now = Date.now();

  // Use pipeline for atomic operations
  const pipeline = redis.pipeline();
  pipeline.set(getRedisKey(type, 'status'), 'running');
  pipeline.set(getRedisKey(type, 'pid'), pid.toString());
  pipeline.set(getRedisKey(type, 'startedAt'), now.toString());
  pipeline.set(getRedisKey(type, 'lastTaskTime'), now.toString());
  pipeline.setex(getRedisKey(type, 'heartbeat'), HEARTBEAT_TTL_SECONDS, now.toString());

  await pipeline.exec();

  console.log(`[WorkerRegistry] Registered worker ${type} with PID ${pid}`);
}

/**
 * Deregister a worker (mark as stopped).
 * Clears all worker keys.
 */
export async function deregisterWorker(type: WorkerType): Promise<void> {
  const redis = getRegistryRedis();

  const pipeline = redis.pipeline();
  pipeline.set(getRedisKey(type, 'status'), 'stopped');
  pipeline.del(getRedisKey(type, 'pid'));
  pipeline.del(getRedisKey(type, 'heartbeat'));
  pipeline.del(getRedisKey(type, 'startedAt'));
  // Keep lastTaskTime for reference

  await pipeline.exec();

  console.log(`[WorkerRegistry] Deregistered worker ${type}`);
}

/**
 * Send a heartbeat to indicate worker is alive.
 */
export async function sendHeartbeat(type: WorkerType): Promise<void> {
  const redis = getRegistryRedis();
  const now = Date.now();

  await redis.setex(getRedisKey(type, 'heartbeat'), HEARTBEAT_TTL_SECONDS, now.toString());
}

/**
 * Update the last task time (called when a task completes).
 */
export async function updateLastTaskTime(type: WorkerType): Promise<void> {
  const redis = getRegistryRedis();
  const now = Date.now();

  await redis.set(getRedisKey(type, 'lastTaskTime'), now.toString());
}

/**
 * Get the status of a specific worker.
 */
export async function getWorkerStatus(type: WorkerType): Promise<WorkerStatus> {
  const redis = getRegistryRedis();

  const [status, pid, heartbeat, lastTaskTime, startedAt] = await Promise.all([
    redis.get(getRedisKey(type, 'status')),
    redis.get(getRedisKey(type, 'pid')),
    redis.get(getRedisKey(type, 'heartbeat')),
    redis.get(getRedisKey(type, 'lastTaskTime')),
    redis.get(getRedisKey(type, 'startedAt')),
  ]);

  // If no heartbeat or heartbeat expired, worker is stopped
  const isRunning = status === 'running' && heartbeat !== null;

  return {
    type,
    status: isRunning ? 'running' : 'stopped',
    pid: pid ? parseInt(pid, 10) : null,
    lastHeartbeat: heartbeat ? parseInt(heartbeat, 10) : null,
    lastTaskTime: lastTaskTime ? parseInt(lastTaskTime, 10) : null,
    startedAt: startedAt ? parseInt(startedAt, 10) : null,
  };
}

/**
 * Get status of all known worker types.
 */
export async function getAllWorkerStatuses(): Promise<Record<WorkerType, WorkerStatus>> {
  const types: WorkerType[] = ['backend', 'echo', 'orchestrator', 'frontend', 'qa', 'devops', 'feedback', 'scoper', 'client-reporter'];

  const statuses = await Promise.all(types.map(getWorkerStatus));

  return Object.fromEntries(
    statuses.map((status) => [status.type, status])
  ) as Record<WorkerType, WorkerStatus>;
}

/**
 * Check if a worker should stop due to idle timeout.
 */
export function shouldStopDueToIdleTimeout(
  lastTaskTime: number,
  idleTimeoutMs: number = DEFAULT_IDLE_TIMEOUT_MS
): boolean {
  const idleTime = Date.now() - lastTaskTime;
  return idleTime > idleTimeoutMs;
}

/**
 * Set a stop signal for a worker (used by API to request graceful shutdown).
 */
export async function requestWorkerStop(type: WorkerType): Promise<void> {
  const redis = getRegistryRedis();
  // Set a stop signal that expires after 60 seconds
  await redis.setex(getRedisKey(type, 'stopRequested'), 60, '1');
  console.log(`[WorkerRegistry] Stop requested for worker ${type}`);
}

/**
 * Check if a stop has been requested for this worker.
 */
export async function isStopRequested(type: WorkerType): Promise<boolean> {
  const redis = getRegistryRedis();
  const stopRequested = await redis.get(getRedisKey(type, 'stopRequested'));
  return stopRequested === '1';
}

/**
 * Clear the stop request (called when worker acknowledges and shuts down).
 */
export async function clearStopRequest(type: WorkerType): Promise<void> {
  const redis = getRegistryRedis();
  await redis.del(getRedisKey(type, 'stopRequested'));
}

/**
 * Close the registry Redis connection.
 */
export async function closeRegistryConnection(): Promise<void> {
  if (registryRedis) {
    await registryRedis.quit();
    registryRedis = null;
  }
}
