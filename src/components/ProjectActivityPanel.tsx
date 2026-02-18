"use client";

import { useState } from "react";
import { WorkerLogModal } from "./WorkerLogModal";

type AgentStatus = "running" | "completed" | "pending" | "idle" | "failed";

interface AgentActivity {
  status: AgentStatus;
  taskCount: number;
  activeTask: { id: string; name: string; status: string } | null;
  recentTask: { id: string; name: string; status: string } | null;
}

interface ProjectActivityData {
  projectId: string;
  projectName: string;
  projectStatus: string;
  agents: Record<string, AgentActivity>;
  totalTasks: number;
  completedTasks: number;
  runningTasks: number;
  pendingTasks: number;
  failedTasks: number;
}

interface ProjectActivityPanelProps {
  activity: ProjectActivityData;
}

// Pipeline stages in execution order
const PIPELINE_STAGES = [
  { key: "scoper", label: "Scoper" },
  { key: "orchestrator", label: "Orchestrator" },
  { key: "backend", label: "Backend" },
  { key: "frontend", label: "Frontend" },
  { key: "qa", label: "QA" },
  { key: "client-reporter", label: "Reporter" },
] as const;

const STATUS_COLORS: Record<AgentStatus, { dot: string; bg: string; text: string }> = {
  running: { dot: "bg-blue-500 animate-pulse", bg: "bg-blue-50", text: "text-blue-700" },
  completed: { dot: "bg-green-500", bg: "bg-green-50", text: "text-green-700" },
  pending: { dot: "bg-yellow-500", bg: "bg-yellow-50", text: "text-yellow-700" },
  failed: { dot: "bg-red-500", bg: "bg-red-50", text: "text-red-700" },
  idle: { dot: "bg-gray-300", bg: "bg-gray-50", text: "text-gray-500" },
};

export function ProjectActivityPanel({ activity }: ProjectActivityPanelProps) {
  const [logAgent, setLogAgent] = useState<string | null>(null);

  // Collect all tasks from all agents that have active or recent tasks
  const activeTasks = PIPELINE_STAGES
    .map((stage) => {
      const agent = activity.agents[stage.key];
      if (!agent) return null;
      const task = agent.activeTask || agent.recentTask;
      if (!task) return null;
      return { ...task, agentType: stage.key, agentLabel: stage.label };
    })
    .filter(Boolean) as Array<{
      id: string;
      name: string;
      status: string;
      agentType: string;
      agentLabel: string;
    }>;

  return (
    <div className="space-y-4">
      {/* Agent Pipeline */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Agent Pipeline</h3>
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {PIPELINE_STAGES.map((stage, i) => {
            const agent = activity.agents[stage.key];
            const status: AgentStatus = agent?.status ?? "idle";
            const colors = STATUS_COLORS[status];

            return (
              <div key={stage.key} className="flex items-center">
                {i > 0 && (
                  <svg className="w-4 h-4 text-gray-300 flex-shrink-0 mx-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                )}
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md ${colors.bg} min-w-0`}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colors.dot}`} />
                  <span className={`text-xs font-medium whitespace-nowrap ${colors.text}`}>
                    {stage.label}
                  </span>
                  {agent && agent.taskCount > 0 && (
                    <span className={`text-xs ${colors.text} opacity-60`}>
                      ({agent.taskCount})
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Task Summary + Active Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Active Tasks Table */}
        <div className="lg:col-span-3 bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Tasks by Agent</h3>
            <button
              onClick={() => setLogAgent("__all__")}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-purple-600 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 rounded-md transition-colors"
              title="View combined logs from all agents"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              All Logs
            </button>
          </div>
          {activeTasks.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-500">
              No tasks yet for this project.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Task</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Logs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {activeTasks.map((task) => {
                    const taskStatusColor =
                      task.status === "completed" ? "bg-green-100 text-green-800" :
                      task.status === "running" ? "bg-blue-100 text-blue-800" :
                      task.status === "queued" ? "bg-blue-50 text-blue-700" :
                      task.status === "failed" ? "bg-red-100 text-red-800" :
                      task.status === "waiting_human" ? "bg-orange-100 text-orange-800" :
                      "bg-gray-100 text-gray-600";

                    return (
                      <tr key={task.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm font-medium text-gray-900">
                          {task.agentLabel}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-600 max-w-xs truncate" title={task.name}>
                          {task.name}
                        </td>
                        <td className="px-4 py-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${taskStatusColor}`}>
                            {task.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <button
                            onClick={() => setLogAgent(task.agentType)}
                            className="p-1.5 text-purple-500 hover:text-purple-700 hover:bg-purple-50 rounded transition-colors inline-flex items-center"
                            title={`View ${task.agentLabel} logs for this project`}
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Summary Stats */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">Summary</h3>
          </div>
          <table className="min-w-full divide-y divide-gray-200">
            <tbody className="divide-y divide-gray-200">
              <tr className="hover:bg-gray-50">
                <td className="pl-4 py-2 w-6">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500" />
                </td>
                <td className="px-2 py-2 text-sm text-gray-700">Total Tasks</td>
                <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">{activity.totalTasks}</td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="pl-4 py-2 w-6">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" />
                </td>
                <td className="px-2 py-2 text-sm text-gray-700">Completed</td>
                <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">{activity.completedTasks}</td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="pl-4 py-2 w-6">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse" />
                </td>
                <td className="px-2 py-2 text-sm text-gray-700">Running</td>
                <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">{activity.runningTasks}</td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="pl-4 py-2 w-6">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-500" />
                </td>
                <td className="px-2 py-2 text-sm text-gray-700">Pending</td>
                <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">{activity.pendingTasks}</td>
              </tr>
              {activity.failedTasks > 0 && (
                <tr className="hover:bg-gray-50">
                  <td className="pl-4 py-2 w-6">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />
                  </td>
                  <td className="px-2 py-2 text-sm text-gray-700">Failed</td>
                  <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">{activity.failedTasks}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Log Modal */}
      {logAgent && (
        <WorkerLogModal
          workerType={logAgent === "__all__" ? "All Agents" : logAgent}
          logEndpoint={
            logAgent === "__all__"
              ? `/api/projects/${activity.projectId}/logs`
              : `/api/projects/${activity.projectId}/logs?agentType=${logAgent}`
          }
          onClose={() => setLogAgent(null)}
        />
      )}
    </div>
  );
}
