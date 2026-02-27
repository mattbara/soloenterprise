/**
 * Worker Supervisor
 *
 * On-demand worker startup. Instead of spawning ALL workers when a task
 * is created, this module ensures only the needed worker type is running.
 *
 * Workers are shared across projects — one backend worker processes
 * backend tasks for ALL projects sequentially.
 */

import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getWorkerStatus } from './worker-registry';
import type { WorkerType } from './worker-registry';
import { isProcessAlive, ensureCleanBeforeSpawn } from './process-lifecycle';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve repo root from packages/core/src/services -> repo root
const REPO_ROOT = resolve(__dirname, '../../../../');

// In-process debounce: skip if same type was spawned in last 15s
const recentSpawns = new Map<string, number>();
const DEBOUNCE_MS = 15_000;

// Map agent types to their worker script names
const AGENT_TO_SCRIPT: Record<string, string> = {
  orchestrator: 'worker:orchestrator',
  backend: 'worker:backend',
  frontend: 'worker:frontend',
  qa: 'worker:qa',
  scoper: 'worker:scoper',
  'client-reporter': 'worker:client-reporter',
  echo: 'worker:echo',
};

/**
 * Ensure the worker for the given agent type is running.
 * If already running or recently spawned, does nothing.
 *
 * This function NEVER throws — supervisor failure must not block task creation.
 */
export async function ensureWorkerRunning(
  agentType: string
): Promise<{ started: boolean; pid?: number }> {
  try {
    const scriptName = AGENT_TO_SCRIPT[agentType];
    if (!scriptName) {
      console.log(`[WorkerSupervisor] No worker script for agent type: ${agentType}`);
      return { started: false };
    }

    // Debounce: skip if recently spawned
    const lastSpawn = recentSpawns.get(agentType);
    if (lastSpawn && Date.now() - lastSpawn < DEBOUNCE_MS) {
      console.log(`[WorkerSupervisor] Debounced spawn for ${agentType} (spawned ${Math.round((Date.now() - lastSpawn) / 1000)}s ago)`);
      return { started: false };
    }

    // Check registry status + PID liveness
    const status = await getWorkerStatus(agentType as WorkerType);
    if (status.status === 'running') {
      // Validate the PID is actually alive — Redis may be stale
      if (status.pid && isProcessAlive(status.pid)) {
        return { started: false };
      }
      // PID dead but Redis says running — clean up and proceed to spawn
      console.log(`[WorkerSupervisor] ${agentType} registered as running but PID ${status.pid} is dead, cleaning up`);
      await ensureCleanBeforeSpawn(agentType as WorkerType);
    }

    // Spawn the worker
    console.log(`[WorkerSupervisor] Starting ${agentType} worker...`);
    const child = spawn('pnpm', [scriptName], {
      detached: true,
      stdio: 'ignore',
      cwd: REPO_ROOT,
      env: { ...process.env },
    });
    child.unref();

    recentSpawns.set(agentType, Date.now());

    console.log(`[WorkerSupervisor] Started ${agentType} worker (PID: ${child.pid})`);
    return { started: true, pid: child.pid ?? undefined };
  } catch (err) {
    console.error(`[WorkerSupervisor] Failed to ensure ${agentType} worker:`, err);
    return { started: false };
  }
}
