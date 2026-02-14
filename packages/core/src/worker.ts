/**
 * Worker Entry Point
 *
 * Starts the agent workers and handles graceful shutdown.
 * Loads environment variables from .env file in repo root.
 * Integrates with worker registry for status tracking and idle timeout.
 *
 * Usage:
 *   pnpm worker        - Start all workers
 *   pnpm worker:echo   - Start echo worker only
 *   pnpm worker:backend - Start backend worker only
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Worker } from 'bullmq';
import type { WorkerType } from './services/worker-registry';

// Get directory of this file
const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables from repo root (packages/core/src -> repo root)
config({ path: resolve(__dirname, '../../../.env') });

// Validate required environment variables
const requiredEnvVars = ['DATABASE_URL', 'REDIS_URL', 'ANTHROPIC_API_KEY'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const workerType = args[0] || 'all';

// Idle timeout configuration (default 5 minutes)
const IDLE_TIMEOUT_MS = parseInt(process.env.WORKER_IDLE_TIMEOUT_MS || '300000', 10);
const HEARTBEAT_INTERVAL_MS = 10000; // 10 seconds
const IDLE_CHECK_INTERVAL_MS = 30000; // 30 seconds

console.log('[Worker] Environment variables loaded');
console.log(`[Worker] Idle timeout: ${IDLE_TIMEOUT_MS / 1000}s`);

// Store workers and shutdown functions for cleanup
const workers: { worker: Worker; shutdown: (w: Worker) => Promise<void>; type: string }[] = [];

// Track last task time for idle timeout
let lastTaskTime = Date.now();

// Track active jobs to prevent shutdown during processing
let activeJobCount = 0;

// Intervals for cleanup
let heartbeatInterval: NodeJS.Timeout | null = null;
let idleCheckInterval: NodeJS.Timeout | null = null;

// Flag to prevent multiple shutdowns
let isShuttingDown = false;

async function start() {
  // Dynamic import after env is loaded
  const {
    createEchoWorker,
    shutdownEchoWorker,
    createBackendWorker,
    shutdownBackendWorker,
    createFrontendWorker,
    shutdownFrontendWorker,
    createQAWorker,
    shutdownQAWorker,
    createOrchestratorWorker,
    shutdownOrchestratorWorker,
    createScoperWorker,
    shutdownScoperWorker,
  } = await import('./agents/index');

  const {
    registerWorker,
    sendHeartbeat,
    updateLastTaskTime,
    isStopRequested,
    clearStopRequest,
  } = await import('./services/worker-registry');

  const { publishTaskEvent } = await import('./services/task-events');
  const { resolveCompletedDependency, handleFailedDependency, unblockDependentTasks } = await import('./services/dependency-resolver');

  // Helper to setup worker event handlers
  function setupWorkerEvents(worker: Worker, type: WorkerType) {
    worker.on('completed', async (job) => {
      activeJobCount = Math.max(0, activeJobCount - 1);
      lastTaskTime = Date.now();
      await updateLastTaskTime(type);
      console.log(`[Worker] Task completed on ${type}, active jobs: ${activeJobCount}`);

      // Publish task completion event for SSE subscribers
      const taskId = job?.data?.taskId;
      if (taskId) {
        await publishTaskEvent({
          type: 'task-completed',
          taskId,
          status: 'completed',
          timestamp: Date.now(),
        });
        console.log(`[Worker] Published task-completed event for ${taskId}`);

        // Check if any blocked tasks can now be queued
        await resolveCompletedDependency(taskId);

        // Also check for previously blocked tasks that can now be unblocked
        await unblockDependentTasks(taskId);
      }
    });

    worker.on('failed', async (job, error) => {
      activeJobCount = Math.max(0, activeJobCount - 1);
      console.log(`[Worker] Task failed on ${type}: ${error?.message}, active jobs: ${activeJobCount}`);

      // Publish task failed event for SSE subscribers
      const taskId = job?.data?.taskId;
      if (taskId) {
        await publishTaskEvent({
          type: 'task-failed',
          taskId,
          status: 'failed',
          timestamp: Date.now(),
        });
        console.log(`[Worker] Published task-failed event for ${taskId}`);

        // Mark dependent tasks as blocked since this task failed
        await handleFailedDependency(taskId);
      }
    });

    worker.on('active', () => {
      activeJobCount++;
      console.log(`[Worker] Task started on ${type}, active jobs: ${activeJobCount}`);
    });
  }

  if (workerType === 'all' || workerType === 'echo') {
    console.log('[Worker] Starting echo agent worker...');
    const echoWorker = createEchoWorker();
    setupWorkerEvents(echoWorker, 'echo');
    workers.push({ worker: echoWorker, shutdown: shutdownEchoWorker, type: 'echo' });
    await registerWorker('echo', process.pid);
    console.log('[Worker] Echo agent worker started and registered');
  }

  if (workerType === 'all' || workerType === 'backend') {
    console.log('[Worker] Starting backend agent worker...');
    const backendWorker = createBackendWorker();
    setupWorkerEvents(backendWorker, 'backend');
    workers.push({ worker: backendWorker, shutdown: shutdownBackendWorker, type: 'backend' });
    await registerWorker('backend', process.pid);
    console.log('[Worker] Backend agent worker started and registered');
  }

  if (workerType === 'all' || workerType === 'frontend') {
    console.log('[Worker] Starting frontend agent worker...');
    const frontendWorker = createFrontendWorker();
    setupWorkerEvents(frontendWorker, 'frontend');
    workers.push({ worker: frontendWorker, shutdown: shutdownFrontendWorker, type: 'frontend' });
    await registerWorker('frontend', process.pid);
    console.log('[Worker] Frontend agent worker started and registered');
  }

  if (workerType === 'all' || workerType === 'qa') {
    console.log('[Worker] Starting QA agent worker...');
    const qaWorker = createQAWorker();
    setupWorkerEvents(qaWorker, 'qa');
    workers.push({ worker: qaWorker, shutdown: shutdownQAWorker, type: 'qa' });
    await registerWorker('qa', process.pid);
    console.log('[Worker] QA agent worker started and registered');
  }

  if (workerType === 'all' || workerType === 'orchestrator') {
    console.log('[Worker] Starting Orchestrator agent worker...');
    const orchestratorWorker = createOrchestratorWorker();
    setupWorkerEvents(orchestratorWorker, 'orchestrator');
    workers.push({ worker: orchestratorWorker, shutdown: shutdownOrchestratorWorker, type: 'orchestrator' });
    await registerWorker('orchestrator', process.pid);
    console.log('[Worker] Orchestrator agent worker started and registered');
  }

  if (workerType === 'all' || workerType === 'scoper') {
    console.log('[Worker] Starting Project Scoper agent worker...');
    const scoperWorker = createScoperWorker();
    setupWorkerEvents(scoperWorker, 'scoper');
    workers.push({ worker: scoperWorker, shutdown: shutdownScoperWorker, type: 'scoper' });
    await registerWorker('scoper', process.pid);
    console.log('[Worker] Project Scoper agent worker started and registered');
  }

  // Start heartbeat interval
  heartbeatInterval = setInterval(async () => {
    for (const { type } of workers) {
      await sendHeartbeat(type as WorkerType);
    }
  }, HEARTBEAT_INTERVAL_MS);

  // Start idle check and stop request check interval
  idleCheckInterval = setInterval(async () => {
    // Check for stop requests
    for (const { type } of workers) {
      const shouldStop = await isStopRequested(type as WorkerType);
      if (shouldStop) {
        console.log(`[Worker] Stop requested for ${type}, shutting down...`);
        await clearStopRequest(type as WorkerType);
        await shutdown();
        return;
      }
    }

    // Check for idle timeout (skip if jobs are running)
    if (activeJobCount > 0) {
      console.log(`[Worker] Skipping idle check, ${activeJobCount} job(s) active`);
      return;
    }

    const idleTime = Date.now() - lastTaskTime;
    if (idleTime > IDLE_TIMEOUT_MS) {
      console.log(`[Worker] Idle timeout reached (${Math.round(idleTime / 1000)}s), shutting down...`);
      await shutdown();
    }
  }, IDLE_CHECK_INTERVAL_MS);

  console.log('[Worker] Waiting for tasks...');
}

async function shutdown() {
  // Prevent multiple shutdowns
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  console.log('\n[Worker] Received shutdown signal');

  // Clear intervals
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval);
    idleCheckInterval = null;
  }

  // Import registry and task events functions for cleanup
  const { deregisterWorker, closeRegistryConnection } = await import('./services/worker-registry');
  const { closePublisher } = await import('./services/task-events');

  // Shutdown workers and deregister
  for (const { worker, shutdown: shutdownFn, type } of workers) {
    await shutdownFn(worker);
    await deregisterWorker(type as 'backend' | 'echo');
    console.log(`[Worker] Deregistered ${type}`);
  }

  // Close registry connection
  await closeRegistryConnection();

  // Close task events publisher
  await closePublisher();

  console.log('[Worker] Shutdown complete');
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[Worker] Uncaught exception:', error);
  shutdown();
});

process.on('unhandledRejection', (reason) => {
  console.error('[Worker] Unhandled rejection:', reason);
  shutdown();
});

// Start the worker
start().catch((error) => {
  console.error('[Worker] Failed to start:', error);
  process.exit(1);
});
