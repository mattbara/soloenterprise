/**
 * Task Logger
 *
 * Writes timestamped log lines to a temp directory outside the project tree.
 * This prevents Turbopack HMR from detecting file changes and triggering
 * repeated page recompilations while agents are running.
 *
 * Logs are buffered in memory and flushed to disk every FLUSH_INTERVAL_MS.
 * Active loggers register in a global set so SIGUSR1 can flush all at once.
 */

import { mkdirSync, appendFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { GENERATED_TASKS_DIR } from './generated-dir';

const FLUSH_INTERVAL_MS = 5000;

/** Global registry of active loggers for signal-driven flushing. */
const activeLoggers = new Set<TaskLogger>();

/**
 * Flush all active TaskLogger instances immediately.
 * Called by the SIGUSR1 handler in worker.ts so log API routes
 * can read up-to-date log files.
 */
export function flushAllLoggers(): void {
  for (const logger of activeLoggers) {
    logger.flush();
  }
}

export class TaskLogger {
  private taskId: string;
  private logFilePath: string;
  private initialized: boolean = false;
  private buffer: string[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(taskId: string) {
    this.taskId = taskId;
    this.logFilePath = TaskLogger.getLogFilePath(taskId);
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
    activeLoggers.add(this);
  }

  private ensureDir(): void {
    if (this.initialized) return;
    try {
      mkdirSync(dirname(this.logFilePath), { recursive: true });
      this.initialized = true;
    } catch {
      // Directory may already exist
      this.initialized = true;
    }
  }

  /** Flush buffered lines to disk. */
  flush(): void {
    if (this.buffer.length === 0) return;
    const chunk = this.buffer.join('');
    this.buffer = [];

    this.ensureDir();
    try {
      appendFileSync(this.logFilePath, chunk);
    } catch (err) {
      // Don't let logging failures crash agents
      console.error(`[TaskLogger] Failed to write log for task ${this.taskId}:`, err);
    }
  }

  /** Stop the flush timer and write remaining buffered lines. */
  close(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
    activeLoggers.delete(this);
  }

  private write(level: string, source: string, message: string): void {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${level}] [${source}] ${message}\n`;

    // Buffer for periodic disk write
    this.buffer.push(line);

    // Still write to console for terminal visibility
    console.log(`[${source}] ${message}`);
  }

  log(source: string, message: string): void {
    this.write('INFO', source, message);
  }

  error(source: string, message: string): void {
    this.write('ERROR', source, message);
  }

  warn(source: string, message: string): void {
    this.write('WARN', source, message);
  }

  static getLogFilePath(taskId: string): string {
    return resolve(GENERATED_TASKS_DIR, taskId, 'task.log');
  }
}
