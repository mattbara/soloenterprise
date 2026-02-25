/**
 * Generated Directory Paths
 *
 * All agent-generated files (code, reports, logs, uploads) are written
 * to a persistent directory OUTSIDE the project workspace tree. This prevents
 * Turbopack's file watcher from detecting changes and triggering
 * repeated HMR recompilations while agents are running.
 *
 * Default: ../project-files (sibling to the soloenterprise monorepo)
 * Override: set SOLOENTERPRISE_PROJECT_FILES env var to an absolute path
 *
 * IMPORTANT: Do NOT use tmpdir() — macOS clears /tmp on reboot, causing data loss.
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

function getProjectFilesRoot(): string {
  if (process.env.SOLOENTERPRISE_PROJECT_FILES) {
    return resolve(process.env.SOLOENTERPRISE_PROJECT_FILES);
  }
  // Stable anchor: this file lives at packages/core/src/utils/generated-dir.ts
  // Resolve to monorepo root (5 levels up), then sibling project-files/
  let selfDir: string;
  try {
    selfDir = dirname(fileURLToPath(import.meta.url));
  } catch {
    selfDir = __dirname ?? process.cwd();
  }
  const monorepoRoot = resolve(selfDir, '..', '..', '..', '..');
  return resolve(monorepoRoot, '..', 'project-files');
}

/** Root directory for all generated output */
export const GENERATED_ROOT = getProjectFilesRoot();

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
