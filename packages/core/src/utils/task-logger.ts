/**
 * Task Logger
 *
 * Writes timestamped log lines to generated/tasks/{taskId}/task.log.
 * Used by all agents to persist execution logs for the dashboard log viewer.
 */

import { mkdirSync, appendFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class TaskLogger {
  private taskId: string;
  private logFilePath: string;
  private initialized: boolean = false;

  constructor(taskId: string) {
    this.taskId = taskId;
    this.logFilePath = TaskLogger.getLogFilePath(taskId);
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

  private write(level: string, source: string, message: string): void {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${level}] [${source}] ${message}\n`;

    // Write to file
    this.ensureDir();
    try {
      appendFileSync(this.logFilePath, line);
    } catch (err) {
      // Don't let logging failures crash agents
      console.error(`[TaskLogger] Failed to write log for task ${this.taskId}:`, err);
    }

    // Also write to console for terminal visibility
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
    return resolve(__dirname, '../../generated/tasks', taskId, 'task.log');
  }
}
