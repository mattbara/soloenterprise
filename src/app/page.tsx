import { db } from "@/lib/db";
import { projects, tasks, questions, fileLocks } from "@soloenterprise/db/schema";
import { eq, count, and, isNull } from "drizzle-orm";
import Link from "next/link";

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

async function getRecentTasks() {
  return db.query.tasks.findMany({
    limit: 10,
    orderBy: (tasks, { desc }) => [desc(tasks.createdAt)],
    with: {
      project: true,
    },
  });
}

async function getPendingQuestions() {
  return db.query.questions.findMany({
    where: eq(questions.status, "pending"),
    limit: 5,
    orderBy: (questions, { desc }) => [desc(questions.createdAt)],
  });
}

export default async function DashboardPage() {
  const stats = await getStats();
  const recentTasks = await getRecentTasks();
  const pendingQuestions = await getPendingQuestions();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Projects" value={stats.projects} color="blue" />
        <StatCard title="Pending Tasks" value={stats.pendingTasks} color="yellow" />
        <StatCard title="Running Tasks" value={stats.runningTasks} color="green" />
        <StatCard title="Waiting Human" value={stats.waitingHuman} color="orange" />
        <StatCard title="Pending Questions" value={stats.pendingQuestions} color="red" />
        <StatCard title="Active File Locks" value={stats.activeLocks} color="purple" />
      </div>

      {/* Pending Questions Alert */}
      {pendingQuestions.length > 0 && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                {pendingQuestions.length} question(s) awaiting your response
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

      {/* Recent Tasks */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:px-6 border-b">
          <h2 className="text-lg font-medium text-gray-900">Recent Tasks</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Task
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Project
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Agent
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Attempts
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {recentTasks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                    No tasks yet
                  </td>
                </tr>
              ) : (
                recentTasks.map((task) => (
                  <tr key={task.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {task.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {task.project?.name || "—"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {task.agentType}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={task.status} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {task.attemptCount}/{task.maxAttempts}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, color }: { title: string; value: number; color: string }) {
  const colorClasses: Record<string, string> = {
    blue: "bg-blue-500",
    yellow: "bg-yellow-500",
    green: "bg-green-500",
    orange: "bg-orange-500",
    red: "bg-red-500",
    purple: "bg-purple-500",
  };

  return (
    <div className="bg-white overflow-hidden shadow rounded-lg">
      <div className="p-5">
        <div className="flex items-center">
          <div className={`flex-shrink-0 ${colorClasses[color]} rounded-md p-3`}>
            <div className="h-6 w-6 text-white" />
          </div>
          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-gray-500 truncate">{title}</dt>
              <dd className="text-lg font-semibold text-gray-900">{value}</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const statusClasses: Record<string, string> = {
    pending: "bg-gray-100 text-gray-800",
    queued: "bg-blue-100 text-blue-800",
    running: "bg-green-100 text-green-800",
    waiting_human: "bg-yellow-100 text-yellow-800",
    blocked: "bg-orange-100 text-orange-800",
    completed: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
  };

  return (
    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClasses[status] || "bg-gray-100 text-gray-800"}`}>
      {status.replace("_", " ")}
    </span>
  );
}
