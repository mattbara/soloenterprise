import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projectScopes, projects } from "@soloenterprise/db/schema";
import { and, eq } from "drizzle-orm";
import { spawn } from "child_process";

/**
 * POST /api/scopes/:id/approve — Approve or reject a scope
 *
 * Body: { action: 'approve' | 'reject', approvedBy?: string, additionalContext?: string }
 *
 * On approve: links scope to project, starts workers if stopped, creates orchestrator task.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action, approvedBy, additionalContext } = body;

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json(
        { error: "action must be 'approve' or 'reject'" },
        { status: 400 }
      );
    }

    if (action === "approve" && (!approvedBy || typeof approvedBy !== "string" || !approvedBy.trim())) {
      return NextResponse.json(
        { error: "approvedBy is required for approval" },
        { status: 400 }
      );
    }

    // Fetch the scope with brief
    const scope = await db.query.projectScopes.findFirst({
      where: eq(projectScopes.id, id),
      with: {
        brief: true,
      },
    });

    if (!scope) {
      return NextResponse.json(
        { error: "Scope not found" },
        { status: 404 }
      );
    }

    if (scope.status === "approved" || scope.status === "rejected") {
      return NextResponse.json(
        { error: `Scope is already ${scope.status}` },
        { status: 409 }
      );
    }

    const newStatus = action === "approve" ? "approved" : "rejected";

    const [updated] = await db
      .update(projectScopes)
      .set({
        status: newStatus,
        ...(action === "approve"
          ? { approvedBy: approvedBy.trim(), approvedAt: new Date() }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(projectScopes.id, id))
      .returning();

    if (action === "reject") {
      // Link scope to project so the UI can resolve "rejected" status (prevents orphan "scoping" state)
      let rejectedProjectId: string | null = null;
      try {
        let project = scope.projectId
          ? await db.query.projects.findFirst({ where: eq(projects.id, scope.projectId) })
          : null;

        if (!project && scope.brief?.clientId) {
          project = await db.query.projects.findFirst({
            where: and(
              eq(projects.clientId, scope.brief.clientId),
              eq(projects.name, scope.brief.title)
            ),
          });
        }

        if (project) {
          rejectedProjectId = project.id;
          // Bidirectional link so scope is always discoverable
          await db.update(projectScopes).set({ projectId: project.id, updatedAt: new Date() }).where(eq(projectScopes.id, id));
          await db.update(projects).set({ scopeId: scope.id, updatedAt: new Date() }).where(eq(projects.id, project.id));
        }
      } catch (err) {
        console.error("[Reject] Failed to link scope to project:", err);
      }

      return NextResponse.json({ ...updated, projectId: rejectedProjectId });
    }

    // ========== PIPELINE WIRING (approve only) ==========

    // 1. Find the project linked to this scope — prefer direct projectId, fallback to brief matching
    let project = scope.projectId
      ? await db.query.projects.findFirst({
          where: eq(projects.id, scope.projectId),
        })
      : null;

    if (!project && scope.brief?.clientId) {
      project = await db.query.projects.findFirst({
        where: and(
          eq(projects.clientId, scope.brief.clientId),
          eq(projects.name, scope.brief.title)
        ),
      });
    }

    let orchestratorTaskId: string | null = null;
    let workersStarted = false;

    if (project) {
      // 2. Bidirectional link: project ↔ scope, set project to active
      await db
        .update(projects)
        .set({
          scopeId: scope.id,
          status: "active",
          updatedAt: new Date(),
        })
        .where(eq(projects.id, project.id));

      await db
        .update(projectScopes)
        .set({ projectId: project.id, updatedAt: new Date() })
        .where(eq(projectScopes.id, scope.id));

      // 3. Check worker statuses and start if needed
      try {
        const { ensureCleanBeforeSpawn, getAllWorkerStatuses } = await import("@soloenterprise/core/services");
        const { isProcessAlive } = await import("@soloenterprise/core/services");
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
          console.log(`[Approve] Started all workers (PID: ${child.pid}), logs: ${resolve(GENERATED_ROOT, "worker-spawn.log")}`);
        }
      } catch (err) {
        console.error("[Approve] Failed to check/start workers:", err);
      }

      // 4. Create orchestrator task
      try {
        const { createTask } = await import("@soloenterprise/core/services");

        const scopeData = scope.scopeData as any;
        const taskName = `Orchestrate: ${project.name}`;
        const taskDescription = scopeData?.summary
          ? `Execute project scope: ${scopeData.summary}`
          : `Execute approved scope for project ${project.name}`;

        const result = await createTask(project.id, {
          name: taskName,
          description: taskDescription,
          agentType: "orchestrator",
          priority: "high",
          context: {
            scopeId: scope.id,
            scopeData: scope.scopeData,
            clientDocument: scope.clientDocument,
            ...(additionalContext ? { additionalContext } : {}),
          },
        });

        orchestratorTaskId = result.taskId;
        console.log(`[Approve] Created orchestrator task ${orchestratorTaskId} for project ${project.id}`);
      } catch (err) {
        console.error("[Approve] Failed to create orchestrator task:", err);
      }
    } else {
      console.warn(`[Approve] No project found for scope ${id} — scope approved but no orchestrator task created`);
    }

    return NextResponse.json({
      ...updated,
      orchestratorTaskId,
      workersStarted,
      projectId: project?.id ?? null,
    });
  } catch (error) {
    console.error("Failed to update scope:", error);
    return NextResponse.json(
      { error: "Failed to update scope" },
      { status: 500 }
    );
  }
}
