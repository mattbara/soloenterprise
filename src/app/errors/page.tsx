import { db } from "@/lib/db";
import { tasks } from "@soloenterprise/db/schema";
import { eq, or, isNotNull, desc } from "drizzle-orm";
import { ErrorsTable } from "@/components/ErrorsTable";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface ErrorItem {
  taskId: string;
  taskName: string;
  type: "error" | "warning";
  message: string;
  files?: string[];
  createdAt: string;
  needsFix: boolean;
}

async function getErrorsAndWarnings(): Promise<ErrorItem[]> {
  // Get failed tasks and tasks with warnings
  const tasksWithIssues = await db.query.tasks.findMany({
    where: or(
      eq(tasks.status, "failed"),
      isNotNull(tasks.result)
    ),
    orderBy: [desc(tasks.updatedAt)],
    limit: 100,
  });

  const errors: ErrorItem[] = [];

  for (const task of tasksWithIssues) {
    // Check for failed tasks with errors
    if (task.status === "failed" && task.result?.error) {
      errors.push({
        taskId: task.id,
        taskName: task.name,
        type: "error",
        message: task.result.error,
        createdAt: task.updatedAt.toISOString(),
        needsFix: true,
      });
    }

    // Check for tasks with warnings in outputs
    const warnings = task.result?.outputs?.warnings;
    if (warnings && warnings.length > 0) {
      const warningMessages = warnings
        .map((w) => `${w.file}${w.line ? `:${w.line}` : ""}: ${w.message}`)
        .join("\n");

      errors.push({
        taskId: task.id,
        taskName: task.name,
        type: "warning",
        message: warningMessages,
        files: task.result?.outputs?.files,
        createdAt: task.updatedAt.toISOString(),
        needsFix: true,
      });
    }
  }

  return errors;
}

export default async function ErrorsPage() {
  const errors = await getErrorsAndWarnings();
  const errorCount = errors.filter((e) => e.type === "error").length;
  const warningCount = errors.filter((e) => e.type === "warning").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Errors & Warnings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Issues from AI agents that need attention
          </p>
        </div>
        <Link
          href="/"
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          &larr; Back to Dashboard
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 max-w-md">
        <div className="bg-white shadow rounded-lg p-4 flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <div>
            <div className="text-2xl font-bold text-gray-900">{errorCount}</div>
            <div className="text-sm text-gray-500">Errors</div>
          </div>
        </div>
        <div className="bg-white shadow rounded-lg p-4 flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-orange-500" />
          <div>
            <div className="text-2xl font-bold text-gray-900">{warningCount}</div>
            <div className="text-sm text-gray-500">Warnings</div>
          </div>
        </div>
      </div>

      {/* Table */}
      <ErrorsTable errors={errors} />
    </div>
  );
}
