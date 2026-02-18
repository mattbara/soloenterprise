import { db } from "@/lib/db";
import { projects, tasks } from "@soloenterprise/db/schema";
import { eq, desc, or, isNull, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getWorkerStatus } from "@soloenterprise/core";
import { SummaryCards } from "@/components/SummaryCards";
import { ProjectWorkerTable } from "@/components/ProjectWorkerTable";
import { RecentTasks } from "@/components/RecentTasks";
import { calculateProjectProgress } from "@/lib/utils/project-progress";
import type { WorkerWithTask, SerializedTask } from "@/lib/types/dashboard";

export const dynamic = "force-dynamic";

const AGENT_TYPES = [
  { key: "orchestrator", label: "Orchestrator" },
  { key: "backend", label: "Backend" },
  { key: "frontend", label: "Frontend" },
  { key: "qa", label: "QA" },
  { key: "scoper", label: "Scoper" },
  { key: "client-reporter", label: "Reporter" },
] as const;

type AgentStatus = "running" | "completed" | "pending" | "idle" | "failed";

async function getProjectActivity(projectId: string) {
  const projectTasks = await db.query.tasks.findMany({
    where: eq(tasks.projectId, projectId),
    columns: {
      id: true,
      name: true,
      status: true,
      agentType: true,
      updatedAt: true,
    },
    orderBy: [desc(tasks.updatedAt)],
  });

  const agents: Record<string, {
    status: AgentStatus;
    taskCount: number;
    activeTask: { id: string; name: string; status: string } | null;
  }> = {};

  for (const { key } of AGENT_TYPES) {
    const typeTasks = projectTasks.filter((t) => t.agentType === key);

    if (typeTasks.length === 0) {
      agents[key] = { status: "idle", taskCount: 0, activeTask: null };
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
    if (running || queued) status = "running";
    else if (allCompleted) status = "completed";
    else if (failed && !anyPending) status = "failed";
    else if (anyPending) status = "pending";
    else status = "idle";

    const activeTask = running || queued || null;

    agents[key] = {
      status,
      taskCount: typeTasks.length,
      activeTask: activeTask ? { id: activeTask.id, name: activeTask.name, status: activeTask.status } : null,
    };
  }

  return agents;
}

async function getWorkerStatuses() {
  const results = await Promise.all(
    AGENT_TYPES.map(async ({ key }) => {
      const status = await getWorkerStatus(key === "client-reporter" ? "client-reporter" : key);
      return { key, status };
    })
  );
  return Object.fromEntries(results.map(({ key, status }) => [key, status]));
}

async function getProjectTasks(projectId: string): Promise<SerializedTask[]> {
  const dbTasks = await db.query.tasks.findMany({
    where: and(
      eq(tasks.projectId, projectId),
      or(eq(tasks.archived, false), isNull(tasks.archived))
    ),
    limit: 50,
    orderBy: [desc(tasks.createdAt)],
    with: { project: true },
  });

  return dbTasks.map((task) => ({
    id: task.id,
    name: task.name,
    description: task.description,
    status: task.status,
    agentType: task.agentType,
    attemptCount: task.attemptCount,
    maxAttempts: task.maxAttempts,
    createdAt: task.createdAt.toISOString(),
    processingStartedAt: task.processingStartedAt?.toISOString() ?? null,
    project: task.project ? { id: task.project.id, name: task.project.name } : null,
    warnings: task.warnings ?? null,
    dependsOn: task.dependsOn ?? [],
    context: task.context ?? null,
    imageAttachments: task.imageAttachments ?? null,
    imageRequirements: task.imageRequirements ?? null,
    imageRequirementsTokens: task.imageRequirementsTokens ?? null,
  }));
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, id),
    with: {
      client: true,
      scope: true,
    },
  });

  if (!project) {
    notFound();
  }

  const [activity, workerStatuses, progress, projectTasks] = await Promise.all([
    getProjectActivity(id),
    getWorkerStatuses(),
    calculateProjectProgress(id),
    getProjectTasks(id),
  ]);

  // Merge worker status + task activity into WorkerWithTask[]
  const now = Date.now();
  const workers: WorkerWithTask[] = AGENT_TYPES.map(({ key, label }) => {
    const ws = workerStatuses[key];
    const agent = activity[key];
    const isRunning = ws?.status === "running";

    return {
      agentType: key,
      agentLabel: label,
      workerStatus: isRunning ? "running" : "stopped",
      pid: isRunning ? ws?.pid ?? null : null,
      uptime: isRunning && ws?.startedAt ? Math.round((now - ws.startedAt) / 1000) : null,
      idle: isRunning && ws?.lastTaskTime ? Math.round((now - ws.lastTaskTime) / 1000) : null,
      currentTask: agent?.activeTask ?? null,
      taskStatus: agent?.status ?? "idle",
      taskCount: agent?.taskCount ?? 0,
    };
  });

  const statusColor =
    project.status === "active" ? "bg-green-100 text-green-800" :
    project.status === "planning" ? "bg-blue-100 text-blue-800" :
    project.status === "completed" ? "bg-gray-100 text-gray-800" :
    "bg-yellow-100 text-yellow-800";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/projects" className="hover:text-gray-700">
              Projects
            </Link>
            <span>/</span>
            <span className="text-gray-900">{project.name}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          {project.client && (
            <p className="text-sm text-gray-500 mt-0.5">
              Client: {project.client.name}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${statusColor}`}>
            {project.status}
          </span>
          {project.scope && (
            <Link
              href={`/briefs/${project.scope.briefId}/scope`}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              View Scope
            </Link>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <SummaryCards
        totalTasks={progress.totalTasks}
        completedTasks={progress.completedTasks}
        runningTasks={progress.runningTasks}
        failedTasks={progress.failedTasks}
      />

      {/* Workers + Tasks Table */}
      <ProjectWorkerTable workers={workers} projectId={id} />

      {/* Recent Tasks */}
      <RecentTasks tasks={projectTasks} projectName={project.name} />
    </div>
  );
}
