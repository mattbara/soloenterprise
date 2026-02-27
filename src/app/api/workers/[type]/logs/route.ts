import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks } from "@soloenterprise/db/schema";
import { eq, desc } from "drizzle-orm";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { getWorkerStatus } from "@soloenterprise/core/services";
import { GENERATED_TASKS_DIR } from "@soloenterprise/core";

const VALID_AGENT_TYPES = [
  "backend",
  "orchestrator",
  "frontend",
  "qa",
  "scoper",
  "client-reporter",
  "devops",
  "feedback",
];

type AgentType = "orchestrator" | "backend" | "frontend" | "qa" | "devops" | "feedback" | "scoper";

/**
 * Send SIGUSR1 to the worker process to flush buffered logs to disk.
 * Waits a short moment for the flush to complete before returning.
 */
async function signalWorkerFlush(agentType: string): Promise<void> {
  try {
    const status = await getWorkerStatus(agentType as AgentType);
    if (status.status === "running" && status.pid) {
      process.kill(status.pid, "SIGUSR1");
      // Give the worker a moment to flush its buffers
      await new Promise((r) => setTimeout(r, 100));
    }
  } catch {
    // Worker may have exited — ignore signal errors
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
 * GET /api/workers/:type/logs
 * Returns logs from the most recent task for this worker/agent type.
 * Sends SIGUSR1 to the worker to flush buffered logs before reading.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    const { type } = await params;

    if (!VALID_AGENT_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Invalid agent type: ${type}` },
        { status: 400 }
      );
    }

    // Signal the worker to flush its log buffer to disk
    await signalWorkerFlush(type);

    // Find the most recent running or recently completed task for this agent type
    const recentTask = await db.query.tasks.findFirst({
      where: eq(tasks.agentType, type as AgentType),
      orderBy: [desc(tasks.updatedAt)],
      columns: { id: true, name: true, status: true, agentType: true },
    });

    if (!recentTask) {
      return NextResponse.json({
        logs: "",
        taskId: null,
        taskName: null,
        isRunning: false,
      });
    }

    const logs = readLogSafe(recentTask.id);
    const isRunning = ["running", "queued"].includes(recentTask.status);

    return NextResponse.json({
      logs,
      taskId: recentTask.id,
      taskName: recentTask.name,
      taskStatus: recentTask.status,
      isRunning,
    });
  } catch (error) {
    console.error("Failed to read worker logs:", error);
    return NextResponse.json(
      { error: "Failed to read logs" },
      { status: 500 }
    );
  }
}
