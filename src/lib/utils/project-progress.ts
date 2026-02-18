import { db } from "@/lib/db";
import { projects, tasks, clients } from "@soloenterprise/db/schema";
import { eq, count, and, inArray, sql } from "drizzle-orm";
import type { ProjectWithProgress } from "@/lib/types/dashboard";

/**
 * Calculate task progress counts for a single project.
 */
export async function calculateProjectProgress(projectId: string) {
  const [total, completed, running, failed] = await Promise.all([
    db.select({ count: count() }).from(tasks).where(eq(tasks.projectId, projectId)),
    db.select({ count: count() }).from(tasks).where(and(eq(tasks.projectId, projectId), eq(tasks.status, "completed"))),
    db.select({ count: count() }).from(tasks).where(and(eq(tasks.projectId, projectId), inArray(tasks.status, ["running", "queued"]))),
    db.select({ count: count() }).from(tasks).where(and(eq(tasks.projectId, projectId), eq(tasks.status, "failed"))),
  ]);

  const totalCount = total[0].count;
  const completedCount = completed[0].count;
  const runningCount = running[0].count;
  const failedCount = failed[0].count;

  return {
    totalTasks: totalCount,
    completedTasks: completedCount,
    runningTasks: runningCount,
    failedTasks: failedCount,
    progressPercent: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0,
  };
}

/**
 * Fetch all projects with their progress stats in a single efficient query.
 */
export async function getAllProjectsWithProgress(): Promise<ProjectWithProgress[]> {
  // Get all projects with client info
  const allProjects = await db.query.projects.findMany({
    columns: { id: true, name: true, status: true },
    with: { client: { columns: { name: true } } },
    orderBy: (projects, { desc }) => [desc(projects.updatedAt)],
  });

  if (allProjects.length === 0) return [];

  // Aggregate task counts per project in a single query
  const taskCounts = await db
    .select({
      projectId: tasks.projectId,
      total: count(),
      completed: sql<number>`count(*) filter (where ${tasks.status} = 'completed')`,
      running: sql<number>`count(*) filter (where ${tasks.status} in ('running', 'queued'))`,
      failed: sql<number>`count(*) filter (where ${tasks.status} = 'failed')`,
    })
    .from(tasks)
    .where(inArray(tasks.projectId, allProjects.map((p) => p.id)))
    .groupBy(tasks.projectId);

  const countsMap = new Map(taskCounts.map((c) => [c.projectId, c]));

  return allProjects.map((p) => {
    const c = countsMap.get(p.id);
    const totalTasks = c?.total ?? 0;
    const completedTasks = c?.completed ?? 0;
    const runningTasks = c?.running ?? 0;
    const failedTasks = c?.failed ?? 0;

    return {
      id: p.id,
      name: p.name,
      status: p.status,
      clientName: p.client?.name ?? null,
      totalTasks,
      completedTasks,
      runningTasks,
      failedTasks,
      progressPercent: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    };
  });
}
