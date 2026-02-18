import { db } from "@/lib/db";
import { projects, tasks, questions, fileLocks } from "@soloenterprise/db/schema";
import { eq, count } from "drizzle-orm";
import Link from "next/link";
import { DashboardHeader } from "@/components/DashboardHeader";
import { DashboardContent } from "@/components/DashboardContent";
import { getAllProjectsWithProgress } from "@/lib/utils/project-progress";

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

async function getProjects() {
  return db.query.projects.findMany({
    columns: { id: true, name: true },
    orderBy: (projects, { asc }) => [asc(projects.name)],
  });
}

export default async function DashboardPage() {
  const [stats, pendingQuestionsList, projectsWithProgress, projectsList] = await Promise.all([
    getStats(),
    getPendingQuestions(),
    getAllProjectsWithProgress(),
    getProjects(),
  ]);

  return (
    <div className="space-y-6">
      <DashboardHeader projects={projectsList} />

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

      {/* Projects + Overview + Task viewer */}
      <DashboardContent projects={projectsWithProgress} stats={stats} />
    </div>
  );
}
