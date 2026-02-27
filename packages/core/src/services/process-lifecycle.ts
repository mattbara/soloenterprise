/**
 * Process Lifecycle Management
 *
 * Centralized module for killing stale worker processes before spawning new ones.
 * Every spawn path must call ensureCleanBeforeSpawn() before creating workers.
 *
 * Uses kill(-pid, signal) for process group kills — catches vitest children
 * spawned by workers since workers run with detached: true (group leaders).
 */

import { getWorkerStatus, deregisterWorker, type WorkerType } from './worker-registry';

const ALL_WORKER_TYPES: WorkerType[] = [
  'backend', 'echo', 'orchestrator', 'frontend', 'qa',
  'devops', 'feedback', 'scoper', 'client-reporter',
];

const SIGTERM_WAIT_MS = 3000;

/**
 * Check if a process with the given PID is still alive.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Kill a stale worker by type. Reads PID from Redis, validates liveness,
 * sends SIGTERM to process group, waits, escalates to SIGKILL if needed,
 * then deregisters from Redis.
 */
export async function killStaleWorker(
  type: WorkerType
): Promise<{ killed: boolean; pid?: number }> {
  const status = await getWorkerStatus(type);

  if (!status.pid) {
    return { killed: false };
  }

  const pid = status.pid;

  if (!isProcessAlive(pid)) {
    // PID in Redis but process is dead — clean up stale keys
    await deregisterWorker(type);
    console.log(`[ProcessLifecycle] Cleaned stale registry for ${type} (PID ${pid} already dead)`);
    return { killed: false, pid };
  }

  // Kill entire process group (catches vitest children)
  try {
    process.kill(-pid, 'SIGTERM');
    console.log(`[ProcessLifecycle] Sent SIGTERM to process group -${pid} (${type})`);
  } catch {
    // Process may have died between check and kill
    await deregisterWorker(type);
    return { killed: false, pid };
  }

  // Wait for graceful shutdown
  await new Promise((resolve) => setTimeout(resolve, SIGTERM_WAIT_MS));

  // Escalate to SIGKILL if still alive
  if (isProcessAlive(pid)) {
    try {
      process.kill(-pid, 'SIGKILL');
      console.log(`[ProcessLifecycle] Escalated to SIGKILL for process group -${pid} (${type})`);
    } catch {
      // Already dead — fine
    }
  }

  await deregisterWorker(type);
  console.log(`[ProcessLifecycle] Killed stale ${type} worker (PID ${pid})`);
  return { killed: true, pid };
}

/**
 * Kill all stale workers across all types.
 */
export async function killAllStaleWorkers(): Promise<{ killed: WorkerType[] }> {
  const killed: WorkerType[] = [];

  for (const type of ALL_WORKER_TYPES) {
    const result = await killStaleWorker(type);
    if (result.killed) {
      killed.push(type);
    }
  }

  if (killed.length > 0) {
    console.log(`[ProcessLifecycle] Killed ${killed.length} stale worker(s): ${killed.join(', ')}`);
  }

  return { killed };
}

/**
 * Single entry point for all spawn paths. Call before creating new workers.
 */
export async function ensureCleanBeforeSpawn(
  type: WorkerType | 'all'
): Promise<void> {
  if (type === 'all') {
    await killAllStaleWorkers();
  } else {
    await killStaleWorker(type);
  }
}
