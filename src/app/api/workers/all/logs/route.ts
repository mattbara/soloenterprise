import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks } from "@soloenterprise/db/schema";
import { eq, desc } from "drizzle-orm";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { getWorkerStatus, getAllWorkerStatuses } from "@soloenterprise/core/services";
import { GENERATED_TASKS_DIR } from "@soloenterprise/core";

const AGENT_TYPES = [
  "orchestrator",
  "backend",
  "frontend",
  "qa",
  "scoper",
  "client-reporter",
] as const;

type AgentType = (typeof AGENT_TYPES)[number];

/**
 * Send SIGUSR1 to all running worker processes to flush buffered logs.
 */
async function signalAllWorkersFlush(): Promise<void> {
  try {
    const statuses = await getAllWorkerStatuses();
    const pidsSignaled = new Set<number>();

    for (const status of Object.values(statuses)) {
      if (status.status === "running" && status.pid && !pidsSignaled.has(status.pid)) {
        try {
          process.kill(status.pid, "SIGUSR1");
          pidsSignaled.add(status.pid);
        } catch {
          // Worker may have exited
        }
      }
    }

    if (pidsSignaled.size > 0) {
      await new Promise((r) => setTimeout(r, 100));
    }
  } catch {
    // Ignore signal errors
  }
}

function readLogSafe(taskId: string): string {
  const logPath = resolve(GENERATED_TASKS_DIR, taskId, "task.log");
  if (!existsSync(logPath)) return "";
  try {
    return readFileSync(logPath, "utf-8");
  } catch {
    return "";
  }
}

/**
 * GET /api/workers/all/logs
 * Returns combined logs from the most recent task of each worker type.
 * Sends SIGUSR1 to all running workers to flush buffered logs before reading.
 */
export async function GET() {
  try {
    // Signal all workers to flush their log buffers
    await signalAllWorkersFlush();

    const sections: string[] = [];
    let anyRunning = false;

    for (const type of AGENT_TYPES) {
      const recentTask = await db.query.tasks.findFirst({
        where: eq(tasks.agentType, type as AgentType),
        orderBy: [desc(tasks.updatedAt)],
        columns: { id: true, name: true, status: true, agentType: true },
      });

      if (!recentTask) continue;

      const logs = readLogSafe(recentTask.id);
      if (!logs) continue;

      const isRunning = ["running", "queued"].includes(recentTask.status);
      if (isRunning) anyRunning = true;

      sections.push(
        `${"=".repeat(80)}\n` +
        `[${type.toUpperCase()}] ${recentTask.name} (${recentTask.status})\n` +
        `Task: ${recentTask.id}\n` +
        `${"=".repeat(80)}\n` +
        logs
      );
    }

    return NextResponse.json({
      logs: sections.join("\n\n"),
      taskId: null,
      taskName: "All Workers — Combined Logs",
      taskStatus: anyRunning ? "running" : null,
      isRunning: anyRunning,
    });
  } catch (error) {
    console.error("Failed to read combined worker logs:", error);
    return NextResponse.json(
      { error: "Failed to read logs" },
      { status: 500 }
    );
  }
}
