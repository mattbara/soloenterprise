import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects, tasks, projectScopes } from "@soloenterprise/db/schema";
import { eq, and } from "drizzle-orm";
import { spawn } from "child_process";

/**
 * POST /api/projects/:id/orchestrate
 *
 * Re-pushes an approved project to the orchestrator.
 * Creates an orchestrator task if none exists (or all previous ones failed/completed).
 * Also starts workers if they're all stopped.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, id),
      with: { scope: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Find scope — direct link or via scopeId
    let scope = project.scope;
    if (!scope && project.scopeId) {
      scope = (await db.query.projectScopes.findFirst({
        where: eq(projectScopes.id, project.scopeId),
      })) ?? null;
    }

    if (!scope || scope.status !== "approved") {
      return NextResponse.json(
        { error: "Project scope must be approved before orchestrating" },
        { status: 400 }
      );
    }

    // Check if there's already an active orchestrator task
    const existingOrchestratorTask = await db.query.tasks.findFirst({
      where: and(
        eq(tasks.projectId, id),
        eq(tasks.agentType, "orchestrator"),
      ),
      orderBy: (tasks, { desc }) => [desc(tasks.createdAt)],
    });

    if (
      existingOrchestratorTask &&
      ["pending", "queued", "running", "blocked"].includes(existingOrchestratorTask.status)
    ) {
      return NextResponse.json(
        {
          error: "Orchestrator task already active",
          taskId: existingOrchestratorTask.id,
          status: existingOrchestratorTask.status,
        },
        { status: 409 }
      );
    }

    // Start workers if needed
    let workersStarted = false;
    try {
      const { ensureCleanBeforeSpawn, getAllWorkerStatuses, isProcessAlive } = await import("@soloenterprise/core/services");
      const statuses = await getAllWorkerStatuses();

      // A worker is truly running only if Redis says so AND PID is alive
      const STARTUP_GRACE_MS = 30_000;
      const now = Date.now();
      const anyTrulyRunning = Object.values(statuses).some(
        (s: any) =>
          s.status === "running" &&
          s.pid &&
          isProcessAlive(s.pid) &&
          s.startedAt && now - s.startedAt > STARTUP_GRACE_MS
      );

      if (!anyTrulyRunning) {
        // Kill stale workers before spawning new ones
        await ensureCleanBeforeSpawn("all");

        const { openSync } = await import("fs");
        const { resolve } = await import("path");
        const { GENERATED_ROOT } = await import("@soloenterprise/core");
        const logFd = openSync(resolve(GENERATED_ROOT, "worker-spawn.log"), "a");
        const child = spawn("pnpm", ["worker"], {
          detached: true,
          stdio: ["ignore", logFd, logFd],
          cwd: process.cwd(),
          env: { ...process.env },
        });
        child.unref();
        workersStarted = true;
        console.log(`[Orchestrate] Started all workers (PID: ${child.pid}), logs: ${resolve(GENERATED_ROOT, "worker-spawn.log")}`);
      }
    } catch (err) {
      console.error("[Orchestrate] Failed to check/start workers:", err);
    }

    // Create orchestrator task
    const { createTask } = await import("@soloenterprise/core/services");

    const scopeData = scope.scopeData as any;
    const taskName = `Orchestrate: ${project.name}`;
    const taskDescription = scopeData?.summary
      ? `Execute project scope: ${scopeData.summary}`
      : `Execute approved scope for project ${project.name}`;

    const result = await createTask(id, {
      name: taskName,
      description: taskDescription,
      agentType: "orchestrator",
      priority: "high",
      context: {
        scopeId: scope.id,
        scopeData: scope.scopeData,
        clientDocument: scope.clientDocument,
      },
    });

    console.log(`[Orchestrate] Created orchestrator task ${result.taskId} for project ${id}`);

    // Set project to active if it isn't already
    if (project.status !== "active") {
      await db
        .update(projects)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(projects.id, id));
    }

    return NextResponse.json({
      orchestratorTaskId: result.taskId,
      jobId: result.jobId,
      workersStarted,
    }, { status: 201 });
  } catch (error) {
    console.error("[Orchestrate] Failed:", error);
    return NextResponse.json(
      { error: "Failed to create orchestrator task" },
      { status: 500 }
    );
  }
}
