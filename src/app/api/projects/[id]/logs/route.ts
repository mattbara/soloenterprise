import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks } from "@soloenterprise/db/schema";
import { eq, and, desc, isNull, ne, sql } from "drizzle-orm";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { getWorkerStatus, getAllWorkerStatuses } from "@soloenterprise/core/services";
import { GENERATED_TASKS_DIR } from "@soloenterprise/core";

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
 * Signal workers to flush buffered logs before reading.
 */
async function signalWorkersFlush(agentType?: string): Promise<void> {
  try {
    const pidsSignaled = new Set<number>();

    if (agentType) {
      const status = await getWorkerStatus(agentType as any);
      if (status.status === "running" && status.pid) {
        try {
          process.kill(status.pid, "SIGUSR1");
          pidsSignaled.add(status.pid);
        } catch {
          // Worker may have exited
        }
      }
    } else {
      const statuses = await getAllWorkerStatuses();
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
    }

    if (pidsSignaled.size > 0) {
      await new Promise((r) => setTimeout(r, 100));
    }
  } catch {
    // Ignore signal errors
  }
}

const STANDALONE_RUN_ID = "__standalone__";

interface Run {
  id: string;
  name: string;
  createdAt: string;
  status: string;
  taskCount: number;
}

/**
 * Build the list of runs for a project.
 * Each orchestrator task = one run. Orphan tasks = synthetic "Standalone Tasks" run.
 */
async function buildRunsList(projectId: string): Promise<Run[]> {
  // Get orchestrator tasks (each is a "run")
  const orchestratorTasks = await db.query.tasks.findMany({
    where: and(
      eq(tasks.projectId, projectId),
      eq(tasks.agentType, "orchestrator")
    ),
    orderBy: [desc(tasks.createdAt)],
    columns: { id: true, name: true, status: true, createdAt: true },
  });

  const runs: Run[] = [];

  for (const ot of orchestratorTasks) {
    // Count children for this orchestrator task
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(eq(tasks.parentTaskId, ot.id));

    runs.push({
      id: ot.id,
      name: ot.name,
      createdAt: ot.createdAt.toISOString(),
      status: ot.status,
      taskCount: (countResult?.count ?? 0) + 1, // +1 for the orchestrator itself
    });
  }

  // Check for orphan tasks (no parentTaskId, not orchestrator type)
  const [orphanCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tasks)
    .where(
      and(
        eq(tasks.projectId, projectId),
        isNull(tasks.parentTaskId),
        ne(tasks.agentType, "orchestrator")
      )
    );

  if ((orphanCount?.count ?? 0) > 0) {
    runs.push({
      id: STANDALONE_RUN_ID,
      name: "Standalone Tasks",
      createdAt: new Date().toISOString(),
      status: "completed",
      taskCount: orphanCount?.count ?? 0,
    });
  }

  return runs;
}

/**
 * GET /api/projects/:id/logs?agentType=backend&runId=xxx
 *
 * Returns combined logs for all tasks in a project, optionally filtered by agent type and run.
 * Also returns available runs for the run picker.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const agentType = searchParams.get("agentType");
    const runId = searchParams.get("runId");

    // Signal workers to flush log buffers
    await signalWorkersFlush(agentType || undefined);

    // Build runs list
    const runs = await buildRunsList(id);

    // Determine effective runId: explicit param > most recent run > null
    const effectiveRunId = runId || (runs.length > 0 ? runs[0].id : null);

    // Build query conditions
    const conditions = [eq(tasks.projectId, id)];
    if (agentType) {
      conditions.push(eq(tasks.agentType, agentType as any));
    }

    // Filter by run
    if (effectiveRunId && effectiveRunId !== STANDALONE_RUN_ID) {
      // Show the orchestrator task itself + all its children
      // But if agentType filter is set, the orchestrator task only shows if agentType=orchestrator
      conditions.push(
        sql`(${tasks.id} = ${effectiveRunId} OR ${tasks.parentTaskId} = ${effectiveRunId})`
      );
    } else if (effectiveRunId === STANDALONE_RUN_ID) {
      // Show orphan tasks only
      conditions.push(isNull(tasks.parentTaskId));
      conditions.push(ne(tasks.agentType, "orchestrator"));
    }

    // Fetch tasks for this project
    const projectTasks = await db.query.tasks.findMany({
      where: and(...conditions),
      orderBy: [desc(tasks.updatedAt)],
      columns: { id: true, name: true, status: true, agentType: true },
    });

    if (projectTasks.length === 0) {
      return NextResponse.json({
        logs: "",
        taskCount: 0,
        isRunning: false,
        runs,
        selectedRunId: effectiveRunId,
      });
    }

    const sections: string[] = [];
    let anyRunning = false;

    for (const task of projectTasks) {
      const logs = readLogSafe(task.id);
      if (!logs) continue;

      const isRunning = ["running", "queued"].includes(task.status);
      if (isRunning) anyRunning = true;

      sections.push(
        `${"=".repeat(80)}\n` +
        `[${task.agentType.toUpperCase()}] ${task.name} (${task.status})\n` +
        `Task: ${task.id}\n` +
        `${"=".repeat(80)}\n` +
        logs
      );
    }

    return NextResponse.json({
      logs: sections.join("\n\n"),
      taskCount: projectTasks.length,
      isRunning: anyRunning,
      taskName: agentType
        ? `${agentType} logs for project`
        : "All agent logs for project",
      taskStatus: anyRunning ? "running" : null,
      runs,
      selectedRunId: effectiveRunId,
    });
  } catch (error) {
    console.error("Failed to read project logs:", error);
    return NextResponse.json(
      { error: "Failed to read logs" },
      { status: 500 }
    );
  }
}
