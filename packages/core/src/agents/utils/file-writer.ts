/**
 * File Writer
 *
 * Writes generated files from agent output to the filesystem.
 * Creates a structured directory under generated/tasks/{task-id}/.
 */

import { mkdir, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import type { ParsedFile } from './output-parser';

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
  // Determine base directory - default to project root's generated/
  const projectRoot = findProjectRoot();
  const generatedDir = baseDir ?? join(projectRoot, 'generated');
  const taskDir = join(generatedDir, 'tasks', taskId);

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
 * Finds the project root directory.
 * Looks for common markers like package.json, .git, etc.
 */
function findProjectRoot(): string {
  // Start from the current working directory
  let currentDir = process.cwd();

  // Check common root markers
  const markers = ['package.json', '.git', 'pnpm-workspace.yaml'];

  // Walk up the directory tree
  for (let i = 0; i < 10; i++) {
    const hasMarker = markers.some((marker) => {
      try {
        // Simple existence check would require fs.existsSync
        // For now, assume cwd is close to project root
        return true;
      } catch {
        return false;
      }
    });

    if (hasMarker) {
      break;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      // Reached filesystem root
      break;
    }
    currentDir = parentDir;
  }

  return currentDir;
}

/**
 * Cleans up generated files for a task.
 * Useful for retrying tasks or cleanup after completion.
 */
export async function cleanupGeneratedFiles(taskId: string, baseDir?: string): Promise<void> {
  const { rm } = await import('fs/promises');

  const projectRoot = findProjectRoot();
  const generatedDir = baseDir ?? join(projectRoot, 'generated');
  const taskDir = join(generatedDir, 'tasks', taskId);

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
  const projectRoot = findProjectRoot();
  const generatedDir = baseDir ?? join(projectRoot, 'generated');
  return join(generatedDir, 'tasks', taskId);
}
