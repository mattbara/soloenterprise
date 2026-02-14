"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface TokenMetrics {
  inputTokens?: number;
  outputTokens?: number;
  skillTokens?: number;
  contextTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  cacheHitPercent?: number;
  estimatedSavingsPercent?: number;
}

interface TaskMetric {
  id: string;
  name: string;
  agentType: string;
  status: string;
  projectId: string;
  projectName: string;
  tokenMetrics: TokenMetrics;
  createdAt: string;
}

interface AgentAggregate {
  agentType: string;
  taskCount: number;
  avgInput: number;
  avgOutput: number;
  maxInput: number;
  maxOutput: number;
  avgTotal: number;
  maxTotal: number;
  avgCacheHit: number;
}

interface ProjectGroup {
  projectId: string;
  projectName: string;
  tasks: TaskMetric[];
  aggregates: AgentAggregate[];
}

interface MetricsDashboardProps {
  projects: ProjectGroup[];
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function getContextWarningLevel(total: number): string | null {
  // Claude context limits: Haiku 200K, Sonnet 200K
  if (total > 150_000) return "red";
  if (total > 100_000) return "amber";
  return null;
}

export function MetricsDashboard({ projects }: MetricsDashboardProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    new Set(projects.map((p) => p.projectId))
  );

  const toggleProject = (projectId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const toggleSelection = (taskId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const selectAllInProject = (tasks: TaskMetric[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = tasks.every((t) => next.has(t.id));
      if (allSelected) {
        tasks.forEach((t) => next.delete(t.id));
      } else {
        tasks.forEach((t) => next.add(t.id));
      }
      return next;
    });
  };

  const handleDelete = async () => {
    if (selectedIds.size === 0) return;

    const confirmed = window.confirm(
      `Delete token metrics for ${selectedIds.size} task(s)? This clears metrics from the database.`
    );
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      const response = await fetch("/api/metrics/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskIds: Array.from(selectedIds) }),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || "Failed to delete metrics");
        return;
      }

      setSelectedIds(new Set());
      router.refresh();
    } catch (error) {
      console.error("Failed to delete metrics:", error);
      alert("Failed to delete metrics");
    } finally {
      setIsDeleting(false);
    }
  };

  const totalTasks = projects.reduce((sum, p) => sum + p.tasks.length, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Token Metrics</h1>
          <p className="mt-1 text-sm text-gray-500">
            {totalTasks} task{totalTasks !== 1 ? "s" : ""} with metrics across{" "}
            {projects.length} project{projects.length !== 1 ? "s" : ""}
          </p>
        </div>
        {selectedIds.size > 0 && (
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting
              ? "Deleting..."
              : `Delete Metrics (${selectedIds.size})`}
          </button>
        )}
      </div>

      {projects.length === 0 && (
        <div className="bg-white shadow rounded-lg p-8 text-center text-gray-500">
          No tasks with token metrics found.
        </div>
      )}

      {projects.map((project) => (
        <div
          key={project.projectId}
          className="bg-white shadow rounded-lg overflow-hidden"
        >
          {/* Project Header */}
          <button
            onClick={() => toggleProject(project.projectId)}
            className="w-full px-6 py-4 border-b flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <svg
                className={`h-4 w-4 text-gray-400 transition-transform ${
                  expandedProjects.has(project.projectId) ? "rotate-90" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
              <h2 className="text-lg font-medium text-gray-900">
                {project.projectName}
              </h2>
              <span className="text-sm text-gray-500">
                ({project.tasks.length} task
                {project.tasks.length !== 1 ? "s" : ""})
              </span>
            </div>
          </button>

          {expandedProjects.has(project.projectId) && (
            <div>
              {/* Aggregates Summary */}
              <div className="px-6 py-4 bg-gray-50 border-b">
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  Averages / Max by Agent Type
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {project.aggregates.map((agg) => {
                    const warning = getContextWarningLevel(agg.maxTotal);
                    return (
                      <div
                        key={agg.agentType}
                        className={`rounded-lg border p-3 ${
                          warning === "red"
                            ? "border-red-300 bg-red-50"
                            : warning === "amber"
                              ? "border-amber-300 bg-amber-50"
                              : "border-gray-200 bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-gray-800 capitalize">
                            {agg.agentType}
                          </span>
                          <span className="text-xs text-gray-500">
                            {agg.taskCount} task
                            {agg.taskCount !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Avg Total</span>
                            <span className="font-mono font-medium">
                              {formatNumber(agg.avgTotal)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Max Total</span>
                            <span
                              className={`font-mono font-medium ${
                                warning === "red"
                                  ? "text-red-700"
                                  : warning === "amber"
                                    ? "text-amber-700"
                                    : ""
                              }`}
                            >
                              {formatNumber(agg.maxTotal)}
                              {warning && " !"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Avg In/Out</span>
                            <span className="font-mono">
                              {formatNumber(agg.avgInput)} /{" "}
                              {formatNumber(agg.avgOutput)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Avg Cache Hit</span>
                            <span className="font-mono">
                              {agg.avgCacheHit.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tasks Table */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left">
                        <input
                          type="checkbox"
                          checked={
                            project.tasks.length > 0 &&
                            project.tasks.every((t) => selectedIds.has(t.id))
                          }
                          onChange={() => selectAllInProject(project.tasks)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        ID
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Task
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Agent
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Input
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Output
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Cache Hit
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Savings
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {project.tasks.map((task) => {
                      const m = task.tokenMetrics;
                      const total = (m.inputTokens ?? 0) + (m.outputTokens ?? 0);
                      const warning = getContextWarningLevel(total);
                      return (
                        <tr
                          key={task.id}
                          className={`hover:bg-gray-50 transition-colors ${
                            selectedIds.has(task.id) ? "bg-blue-50" : ""
                          }`}
                        >
                          <td className="px-4 py-3 whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(task.id)}
                              onChange={() => toggleSelection(task.id)}
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs font-mono text-gray-500">
                            {task.id.slice(0, 8)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 max-w-[200px] truncate">
                            {task.name}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                              {task.agentType}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                task.status === "completed"
                                  ? "bg-green-100 text-green-800"
                                  : task.status === "running"
                                    ? "bg-blue-100 text-blue-800"
                                    : task.status === "failed"
                                      ? "bg-red-100 text-red-800"
                                      : "bg-gray-100 text-gray-800"
                              }`}
                            >
                              {task.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-mono text-gray-700">
                            {formatNumber(m.inputTokens ?? 0)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-mono text-gray-700">
                            {formatNumber(m.outputTokens ?? 0)}
                          </td>
                          <td
                            className={`px-4 py-3 whitespace-nowrap text-sm text-right font-mono font-medium ${
                              warning === "red"
                                ? "text-red-700"
                                : warning === "amber"
                                  ? "text-amber-700"
                                  : "text-gray-900"
                            }`}
                          >
                            {formatNumber(total)}
                            {warning && " !"}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-mono text-gray-700">
                            {m.cacheHitPercent != null
                              ? `${m.cacheHitPercent.toFixed(0)}%`
                              : "—"}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-mono text-gray-700">
                            {m.estimatedSavingsPercent != null
                              ? `${m.estimatedSavingsPercent.toFixed(0)}%`
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
