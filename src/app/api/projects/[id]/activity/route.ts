import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks, projects } from "@soloenterprise/db/schema";
import { eq, and, count, sql } from "drizzle-orm";

const AGENT_TYPES = [
  "orchestrator",
  "backend",
  "frontend",
  "qa",
  "scoper",
  "client-reporter",
] as const;

type AgentStatus = "running" | "completed" | "pending" | "idle" | "failed";

interface AgentActivity {
  status: AgentStatus;
  taskCount: number;
  activeTask: { id: string; name: string; status: string } | null;
  recentTask: { id: string; name: string; status: string } | null;
}

/**
 * GET /api/projects/:id/activity
 *
 * Returns per-agent activity for a project: task counts, active/recent tasks,
 * and derived agent statuses.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify project exists
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, id),
      columns: { id: true, name: true, status: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Fetch all tasks for this project
    const projectTasks = await db.query.tasks.findMany({
      where: eq(tasks.projectId, id),
      columns: {
        id: true,
        name: true,
        status: true,
        agentType: true,
        updatedAt: true,
      },
      orderBy: (tasks, { desc }) => [desc(tasks.updatedAt)],
    });

    // Group tasks by agent type
    const agents: Record<string, AgentActivity> = {};

    for (const type of AGENT_TYPES) {
      const typeTasks = projectTasks.filter((t) => t.agentType === type);

      if (typeTasks.length === 0) {
        agents[type] = {
          status: "idle",
          taskCount: 0,
          activeTask: null,
          recentTask: null,
        };
        continue;
      }

      const running = typeTasks.find((t) => t.status === "running");
      const queued = typeTasks.find((t) => t.status === "queued");
      const failed = typeTasks.find((t) => t.status === "failed");
      const allCompleted = typeTasks.every((t) => t.status === "completed");
      const anyPending = typeTasks.some(
        (t) => t.status === "pending" || t.status === "queued" || t.status === "blocked"
      );

      let status: AgentStatus;
      if (running || queued) {
        status = "running";
      } else if (allCompleted) {
        status = "completed";
      } else if (failed && !anyPending) {
        status = "failed";
      } else if (anyPending) {
        status = "pending";
      } else {
        status = "idle";
      }

      const activeTask = running || queued || null;
      const recentTask = typeTasks[0]; // Already sorted by updatedAt desc

      agents[type] = {
        status,
        taskCount: typeTasks.length,
        activeTask: activeTask
          ? { id: activeTask.id, name: activeTask.name, status: activeTask.status }
          : null,
        recentTask: recentTask
          ? { id: recentTask.id, name: recentTask.name, status: recentTask.status }
          : null,
      };
    }

    // Aggregate counts
    const totalTasks = projectTasks.length;
    const completedTasks = projectTasks.filter((t) => t.status === "completed").length;
    const runningTasks = projectTasks.filter(
      (t) => t.status === "running" || t.status === "queued"
    ).length;
    const pendingTasks = projectTasks.filter(
      (t) => t.status === "pending" || t.status === "blocked"
    ).length;
    const failedTasks = projectTasks.filter((t) => t.status === "failed").length;

    return NextResponse.json({
      projectId: id,
      projectName: project.name,
      projectStatus: project.status,
      agents,
      totalTasks,
      completedTasks,
      runningTasks,
      pendingTasks,
      failedTasks,
    });
  } catch (error) {
    console.error("Failed to fetch project activity:", error);
    return NextResponse.json(
      { error: "Failed to fetch project activity" },
      { status: 500 }
    );
  }
}
