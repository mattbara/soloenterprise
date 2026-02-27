import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks } from "@soloenterprise/db/schema";
import { eq } from "drizzle-orm";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { GENERATED_TASKS_DIR } from "@soloenterprise/core";

function getLogFilePath(taskId: string): string {
  return resolve(GENERATED_TASKS_DIR, taskId, "task.log");
}

function readLogSafe(taskId: string): string {
  const logPath = getLogFilePath(taskId);
  if (!existsSync(logPath)) return "";
  try {
    return readFileSync(logPath, "utf-8");
  } catch {
    return "";
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Load the task
    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, id),
      columns: { id: true, agentType: true, status: true, name: true },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const taskIds: string[] = [id];
    let isRunning = ["running", "queued"].includes(task.status);

    // If orchestrator, find child tasks
    if (task.agentType === "orchestrator") {
      const childTasks = await db.query.tasks.findMany({
        where: eq(tasks.parentTaskId, id),
        columns: { id: true, status: true },
      });

      for (const child of childTasks) {
        taskIds.push(child.id);
        if (["running", "queued"].includes(child.status)) {
          isRunning = true;
        }
      }
    }

    // Read and merge log files
    interface LogLine {
      timestamp: string;
      raw: string;
    }

    const allLines: LogLine[] = [];
    const timestampRegex = /^\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\]/;

    for (const tid of taskIds) {
      const logContent = readLogSafe(tid);
      if (!logContent) continue;

      for (const line of logContent.split("\n")) {
        if (!line.trim()) continue;
        const match = line.match(timestampRegex);
        allLines.push({
          timestamp: match ? match[1] : "9999-12-31T23:59:59.999Z",
          raw: line,
        });
      }
    }

    // Sort by timestamp
    allLines.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const logs = allLines.map((l) => l.raw).join("\n");

    return NextResponse.json({
      logs,
      taskIds,
      isRunning,
    });
  } catch (error) {
    console.error("Failed to read task logs:", error);
    return NextResponse.json(
      { error: "Failed to read logs" },
      { status: 500 }
    );
  }
}
