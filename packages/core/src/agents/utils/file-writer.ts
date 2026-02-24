/**
 * File Writer
 *
 * Writes generated files from agent output to the filesystem.
 * Creates a structured directory under generated/tasks/{task-id}/.
 */

import { mkdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import type { ParsedFile } from './output-parser';
import { GENERATED_TASKS_DIR } from '../../utils/generated-dir';

export interface FileWriteResult {
  taskDir: string;
  files: string[];
  manifest: ManifestData;
}

export interface ManifestData {
  taskId: string;
  generatedAt: string;
  agentType: string;
  files: string[];
}

/**
 * Writes parsed files to the generated directory.
 *
 * @param taskId - The task ID for directory naming
 * @param files - Array of parsed files to write
 * @param agentType - The agent type (for manifest)
 * @param baseDir - Base directory for output (defaults to repo root's generated/)
 * @returns Result with paths of created files
 */
export async function writeGeneratedFiles(
  taskId: string,
  files: ParsedFile[],
  agentType: string,
  baseDir?: string
): Promise<FileWriteResult> {
  const taskDir = baseDir ? join(baseDir, 'tasks', taskId) : join(GENERATED_TASKS_DIR, taskId);

  // Create task directory
  await mkdir(taskDir, { recursive: true });

  const writtenFiles: string[] = [];

  // Write each file
  for (const file of files) {
    const filePath = join(taskDir, file.path);
    const fileDir = dirname(filePath);

    // Ensure directory exists
    await mkdir(fileDir, { recursive: true });

    // Write file content
    await writeFile(filePath, file.content, 'utf-8');

    writtenFiles.push(file.path);
    console.log(`[FileWriter] Written: ${file.path}`);
  }

  // Create manifest
  const manifest: ManifestData = {
    taskId,
    generatedAt: new Date().toISOString(),
    agentType,
    files: writtenFiles,
  };

  const manifestPath = join(taskDir, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`[FileWriter] Written: manifest.json`);

  return {
    taskDir,
    files: writtenFiles,
    manifest,
  };
}

/**
 * Cleans up generated files for a task.
 * Useful for retrying tasks or cleanup after completion.
 */
export async function cleanupGeneratedFiles(taskId: string, baseDir?: string): Promise<void> {
  const { rm } = await import('fs/promises');

  const taskDir = baseDir ? join(baseDir, 'tasks', taskId) : join(GENERATED_TASKS_DIR, taskId);

  try {
    await rm(taskDir, { recursive: true, force: true });
    console.log(`[FileWriter] Cleaned up: ${taskDir}`);
  } catch (error) {
    // Directory might not exist, which is fine
    console.log(`[FileWriter] Nothing to clean up for task: ${taskId}`);
  }
}

/**
 * Gets the path to the task's generated directory.
 */
export function getTaskGeneratedDir(taskId: string, baseDir?: string): string {
  return baseDir ? join(baseDir, 'tasks', taskId) : join(GENERATED_TASKS_DIR, taskId);
}
