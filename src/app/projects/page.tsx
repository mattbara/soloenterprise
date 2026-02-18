import { db } from "@/lib/db";
import { tasks, questions, fileLocks, projectScopes } from "@soloenterprise/db/schema";
import { count, eq, inArray } from "drizzle-orm";
import { DashboardContent } from "@/components/DashboardContent";
import { getAllProjectsWithProgress } from "@/lib/utils/project-progress";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  // Fetch projects with progress (single efficient query)
  const projectsWithProgress = await getAllProjectsWithProgress();

  // Fetch overview stats (parallel queries)
  const [pendingTasks, runningTasks, waitingHuman, pendingQuestions, activeLocks] =
    await Promise.all([
      db
        .select({ count: count() })
        .from(tasks)
        .where(inArray(tasks.status, ["pending", "queued"])),
      db
        .select({ count: count() })
        .from(tasks)
        .where(eq(tasks.status, "running")),
      db
        .select({ count: count() })
        .from(tasks)
        .where(eq(tasks.status, "waiting_human")),
      db
        .select({ count: count() })
        .from(questions)
        .where(eq(questions.status, "pending")),
      db.select({ count: count() }).from(fileLocks),
    ]);

  const stats = {
    projects: projectsWithProgress.length,
    pendingTasks: pendingTasks[0].count,
    runningTasks: runningTasks[0].count,
    waitingHuman: waitingHuman[0].count,
    pendingQuestions: pendingQuestions[0].count,
    activeLocks: activeLocks[0].count,
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
      </div>
      <DashboardContent projects={projectsWithProgress} stats={stats} />
    </div>
  );
}
