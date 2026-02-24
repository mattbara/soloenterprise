/**
 * Generated Directory Paths
 *
 * All agent-generated files (code, reports, logs, uploads) are written
 * to a temp directory OUTSIDE the project workspace tree. This prevents
 * Turbopack's file watcher from detecting changes and triggering
 * repeated HMR recompilations while agents are running.
 */

import { resolve } from 'path';
import { tmpdir } from 'os';

/** Root directory for all generated output */
export const GENERATED_ROOT = resolve(tmpdir(), 'soloenterprise', 'generated');

/** Directory for agent-generated task files (code, manifests) */
export const GENERATED_TASKS_DIR = resolve(GENERATED_ROOT, 'tasks');

/** Directory for business reports (scoper, client-reporter) */
export const GENERATED_REPORTS_DIR = resolve(GENERATED_ROOT, 'reports');

/** Directory for uploaded images */
export const GENERATED_UPLOADS_DIR = resolve(GENERATED_ROOT, 'uploads');

/** Get the task-specific generated directory */
export function getGeneratedTaskDir(taskId: string): string {
  return resolve(GENERATED_TASKS_DIR, taskId);
}

/** Get the report directory for a brief or project */
export function getGeneratedReportDir(id: string): string {
  return resolve(GENERATED_REPORTS_DIR, id);
}

/** Get the uploads directory for a task */
export function getGeneratedUploadsDir(taskId: string): string {
  return resolve(GENERATED_UPLOADS_DIR, taskId);
}
