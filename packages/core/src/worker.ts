/**
 * Worker Entry Point
 *
 * Starts the echo agent worker and handles graceful shutdown.
 * Loads environment variables from .env file in repo root.
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Worker } from 'bullmq';

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

console.log('[Worker] Environment variables loaded');
console.log('[Worker] Starting echo agent worker...');

// Store worker and shutdown function for cleanup
let echoWorker: Worker | null = null;
let shutdownEchoWorkerFn: ((worker: Worker) => Promise<void>) | null = null;

async function start() {
  // Dynamic import after env is loaded
  const { createEchoWorker, shutdownEchoWorker } = await import('./agents/index.js');
  shutdownEchoWorkerFn = shutdownEchoWorker;

  echoWorker = createEchoWorker();
  console.log('[Worker] Echo agent worker started');
  console.log('[Worker] Waiting for tasks...');
}

async function shutdown() {
  console.log('\n[Worker] Received shutdown signal');

  if (echoWorker && shutdownEchoWorkerFn) {
    await shutdownEchoWorkerFn(echoWorker);
  }

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
