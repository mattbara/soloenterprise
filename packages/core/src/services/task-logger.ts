/**
 * Task Logger Service
 *
 * Provides logging functionality for tasks that persists to the database.
 * Each log entry is prefixed with the task ID for easy identification.
 */

import { db } from '@soloenterprise/db';
import { taskLogs } from '@soloenterprise/db/schema';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Create a logger instance for a specific task.
 */
export function createTaskLogger(taskId: string) {
  const shortId = taskId.slice(0, 8);

  async function log(
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    // Log to console with task ID prefix
    const prefix = `[${shortId}]`;
    const consoleMessage = `${prefix} ${message}`;

    switch (level) {
      case 'debug':
        console.debug(consoleMessage);
        break;
      case 'info':
        console.log(consoleMessage);
        break;
      case 'warn':
        console.warn(consoleMessage);
        break;
      case 'error':
        console.error(consoleMessage);
        break;
    }

    // Persist to database
    try {
      await db.insert(taskLogs).values({
        taskId,
        level,
        message,
        metadata,
      });
    } catch (err) {
      // Don't let logging failures break the task
      console.error(`${prefix} Failed to persist log:`, err);
    }
  }

  return {
    debug: (message: string, metadata?: Record<string, unknown>) =>
      log('debug', message, metadata),
    info: (message: string, metadata?: Record<string, unknown>) =>
      log('info', message, metadata),
    warn: (message: string, metadata?: Record<string, unknown>) =>
      log('warn', message, metadata),
    error: (message: string, metadata?: Record<string, unknown>) =>
      log('error', message, metadata),
  };
}

export type TaskLogger = ReturnType<typeof createTaskLogger>;
