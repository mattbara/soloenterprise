import { NextResponse } from "next/server";
import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";

interface GeneratedFile {
  path: string;
  content: string;
}

/**
 * GET /api/tasks/[id]/files
 *
 * Returns the list of generated files for a completed task.
 * Files are read from packages/core/generated/tasks/{taskId}/
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;

  if (!taskId) {
    return NextResponse.json(
      { error: "Task ID is required" },
      { status: 400 }
    );
  }

  // Task files are stored in packages/core/generated/tasks/{taskId}
  const taskDir = join(
    process.cwd(),
    "packages",
    "core",
    "generated",
    "tasks",
    taskId
  );

  try {
    // Check if directory exists
    const dirStat = await stat(taskDir);
    if (!dirStat.isDirectory()) {
      return NextResponse.json({
        files: [],
        error: "No generated files found for this task",
      });
    }

    // Recursively read all files in the task directory
    const files = await readFilesRecursively(taskDir, "");

    // Filter out manifest.json and other non-code files
    const codeFiles = files.filter(
      (f) =>
        !f.path.includes("manifest.json") &&
        !f.path.startsWith(".") &&
        !f.path.includes("/.") &&
        !f.path.includes("node_modules")
    );

    return NextResponse.json({ files: codeFiles });
  } catch (error) {
    // Directory doesn't exist or other error
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({
        files: [],
        error: "No generated files found for this task",
      });
    }

    console.error("Error reading task files:", error);
    return NextResponse.json(
      { error: "Failed to read generated files" },
      { status: 500 }
    );
  }
}

/**
 * Recursively read all files in a directory.
 */
async function readFilesRecursively(
  baseDir: string,
  relativePath: string
): Promise<GeneratedFile[]> {
  const files: GeneratedFile[] = [];
  const currentDir = join(baseDir, relativePath);

  const entries = await readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      // Recursively read subdirectories
      const subFiles = await readFilesRecursively(baseDir, entryPath);
      files.push(...subFiles);
    } else if (entry.isFile()) {
      try {
        const content = await readFile(join(baseDir, entryPath), "utf-8");
        files.push({
          path: entryPath,
          content,
        });
      } catch (err) {
        // Skip files that can't be read as text
        console.warn(`Skipping file ${entryPath}:`, err);
      }
    }
  }

  return files;
}
