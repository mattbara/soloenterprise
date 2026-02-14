import { db } from "@/lib/db";
import { projects, tasks, questions, fileLocks } from "@soloenterprise/db/schema";
import { eq, count, desc, or, isNull } from "drizzle-orm";
import Link from "next/link";
import { RecentTasks } from "@/components";
import { WorkerDashboardPanel } from "@/components/WorkerDashboardPanel";
import { DashboardHeader } from "@/components/DashboardHeader";
import { getWorkerStatus } from "@soloenterprise/core";

export const dynamic = "force-dynamic";

async function getStats() {
  const [projectCount] = await db
    .select({ count: count() })
    .from(projects);

  const [pendingTasks] = await db
    .select({ count: count() })
    .from(tasks)
    .where(eq(tasks.status, "pending"));

  const [runningTasks] = await db
    .select({ count: count() })
    .from(tasks)
    .where(eq(tasks.status, "running"));

  const [waitingHumanTasks] = await db
    .select({ count: count() })
    .from(tasks)
    .where(eq(tasks.status, "waiting_human"));

  const [pendingQuestions] = await db
    .select({ count: count() })
    .from(questions)
    .where(eq(questions.status, "pending"));

  const [activeLocksCount] = await db
    .select({ count: count() })
    .from(fileLocks);

  return {
    projects: projectCount.count,
    pendingTasks: pendingTasks.count,
    runningTasks: runningTasks.count,
    waitingHuman: waitingHumanTasks.count,
    pendingQuestions: pendingQuestions.count,
    activeLocks: activeLocksCount.count,
  };
}

async function getPendingQuestions() {
  return db.query.questions.findMany({
    where: eq(questions.status, "pending"),
    limit: 5,
    orderBy: (questions, { asc }) => [asc(questions.createdAt)],
  });
}

async function getRecentTasks() {
  const dbTasks = await db.query.tasks.findMany({
    where: or(eq(tasks.archived, false), isNull(tasks.archived)), // Filter out archived tasks (include null as not archived)
    limit: 50,
    orderBy: [desc(tasks.createdAt)],
    with: {
      project: true,
    },
  });

  // Serialize for client component (Date -> string)
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

interface StaleTaskWarnings {
  stalePendingCount: number;
  stuckRunningCount: number;
}

function calculateStaleTaskWarnings(recentTasks: Awaited<ReturnType<typeof getRecentTasks>>): StaleTaskWarnings {
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;
  const SIX_HOURS = 6 * 60 * 60 * 1000;

  let stalePendingCount = 0;
  let stuckRunningCount = 0;

  for (const task of recentTasks) {
    // Pending tasks with no dependencies, older than 1 hour
    if (task.status === "pending") {
      const age = now - new Date(task.createdAt).getTime();
      const hasDependencies = task.dependsOn && task.dependsOn.length > 0;
      if (age > ONE_HOUR && !hasDependencies) {
        stalePendingCount++;
      }
    }

    // Running tasks older than 6 hours
    if (task.status === "running" && task.processingStartedAt) {
      const runningTime = now - new Date(task.processingStartedAt).getTime();
      if (runningTime > SIX_HOURS) {
        stuckRunningCount++;
      }
    }
  }

  return { stalePendingCount, stuckRunningCount };
}

async function getWorkerStatuses() {
  const [orchestratorStatus, backendStatus, frontendStatus, qaStatus, scoperStatus] = await Promise.all([
    getWorkerStatus("orchestrator"),
    getWorkerStatus("backend"),
    getWorkerStatus("frontend"),
    getWorkerStatus("qa"),
    getWorkerStatus("scoper"),
  ]);
  return { orchestrator: orchestratorStatus, backend: backendStatus, frontend: frontendStatus, qa: qaStatus, scoper: scoperStatus };
}

async function getProjects() {
  return db.query.projects.findMany({
    columns: { id: true, name: true },
    orderBy: (projects, { asc }) => [asc(projects.name)],
  });
}

export default async function DashboardPage() {
  // Fetch ALL data server-side - no client-side API calls needed!
  const [stats, pendingQuestionsList, recentTasks, workerStatuses, projectsList] = await Promise.all([
    getStats(),
    getPendingQuestions(),
    getRecentTasks(),
    getWorkerStatuses(),
    getProjects(),
  ]);

  // Calculate stale task warnings
  const staleWarnings = calculateStaleTaskWarnings(recentTasks);

  return (
    <div className="space-y-6">
      <DashboardHeader projects={projectsList} />

      {/* Workers + Stats Panel */}
      <WorkerDashboardPanel workerStatuses={workerStatuses} stats={stats} />

      {/* Pending Questions Alert */}
      {pendingQuestionsList.length > 0 && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                {pendingQuestionsList.length} question(s) awaiting your response
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <Link href="/questions" className="font-medium underline">
                  View questions →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stale Task Warnings */}
      {staleWarnings.stalePendingCount > 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4">
          <div className="flex">
            <div className="flex-shrink-0 text-amber-500 text-xl">
              ⚠️
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-amber-800">
                {staleWarnings.stalePendingCount} task{staleWarnings.stalePendingCount > 1 ? 's' : ''} pending over 1 hour — workers may be offline
              </p>
            </div>
          </div>
        </div>
      )}

      {staleWarnings.stuckRunningCount > 0 && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4">
          <div className="flex">
            <div className="flex-shrink-0 text-red-500 text-xl">
              🔴
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-red-800">
                {staleWarnings.stuckRunningCount} task{staleWarnings.stuckRunningCount > 1 ? 's' : ''} stuck in 'running' for 6+ hours — possible worker crash
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Recent Tasks - pure server component, no client API calls */}
      <RecentTasks tasks={recentTasks} />
    </div>
  );
}


