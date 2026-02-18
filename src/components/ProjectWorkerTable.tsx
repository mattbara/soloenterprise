"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./Button";
import { WorkerLogModal } from "./WorkerLogModal";
import type { WorkerWithTask } from "@/lib/types/dashboard";

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

async function clearBrowserCache() {
  try {
    localStorage.clear();
    sessionStorage.clear();
    if (window.indexedDB && window.indexedDB.databases) {
      const databases = await window.indexedDB.databases();
      databases.forEach((db) => {
        if (db.name) {
          window.indexedDB.deleteDatabase(db.name);
        }
      });
    }
    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    }
  } catch (err) {
    console.error("[ProjectWorkerTable] Failed to clear browser cache:", err);
  }
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  running: { bg: "bg-blue-100", text: "text-blue-800" },
  completed: { bg: "bg-green-100", text: "text-green-800" },
  pending: { bg: "bg-yellow-100", text: "text-yellow-800" },
  failed: { bg: "bg-red-100", text: "text-red-800" },
  idle: { bg: "bg-gray-100", text: "text-gray-600" },
};

interface ProjectWorkerTableProps {
  workers: WorkerWithTask[];
  projectId: string;
}

export function ProjectWorkerTable({ workers, projectId }: ProjectWorkerTableProps) {
  const router = useRouter();
  const [logAgent, setLogAgent] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<Record<string, boolean>>({});
  const [bulkActionInProgress, setBulkActionInProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track local worker status overrides after start/stop
  const [statusOverrides, setStatusOverrides] = useState<Record<string, any>>({});

  const getWorkerStatus = (worker: WorkerWithTask) => {
    if (statusOverrides[worker.agentType]) {
      return statusOverrides[worker.agentType];
    }
    return null;
  };

  const isWorkerRunning = (worker: WorkerWithTask) => {
    const override = getWorkerStatus(worker);
    if (override) return override.status === "running";
    return worker.workerStatus === "running";
  };

  const handleStartWorker = async (agentType: string) => {
    setActionInProgress((prev) => ({ ...prev, [agentType]: true }));
    setError(null);
    try {
      const response = await fetch("/api/workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: agentType }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to start worker");
      setStatusOverrides((prev) => ({ ...prev, [agentType]: data }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start worker");
    } finally {
      setActionInProgress((prev) => ({ ...prev, [agentType]: false }));
    }
  };

  const handleStopWorker = async (agentType: string) => {
    setActionInProgress((prev) => ({ ...prev, [agentType]: true }));
    setError(null);
    try {
      const response = await fetch(`/api/workers/${agentType}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to stop worker");
      setStatusOverrides((prev) => ({ ...prev, [agentType]: data }));
      await clearBrowserCache();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop worker");
    } finally {
      setActionInProgress((prev) => ({ ...prev, [agentType]: false }));
    }
  };

  const stoppedWorkers = workers.filter((w) => !isWorkerRunning(w));
  const runningWorkers = workers.filter((w) => isWorkerRunning(w));

  const handleStartAll = async () => {
    setBulkActionInProgress(true);
    setError(null);
    try {
      const response = await fetch("/api/workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "all" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to start workers");
      setStatusOverrides((prev) => ({ ...prev, ...data }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start workers");
    } finally {
      setBulkActionInProgress(false);
    }
  };

  const handleStopAll = async () => {
    setBulkActionInProgress(true);
    setError(null);
    try {
      for (const w of runningWorkers) {
        const response = await fetch(`/api/workers/${w.agentType}`, { method: "DELETE" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `Failed to stop ${w.agentType}`);
        setStatusOverrides((prev) => ({ ...prev, [w.agentType]: data }));
      }
      await clearBrowserCache();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop workers");
    } finally {
      setBulkActionInProgress(false);
    }
  };

  const isAnyActionInProgress = bulkActionInProgress || Object.values(actionInProgress).some(Boolean);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Workers & Tasks</h3>
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
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Agent</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Uptime</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Idle</th>
              <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Logs</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {workers.map((worker) => {
              const running = isWorkerRunning(worker);
              const override = getWorkerStatus(worker);
              const uptime = running && worker.uptime !== null ? worker.uptime : null;
              const idle = running && worker.idle !== null ? worker.idle : null;

              // Use task status for the label (like old "Tasks by Agent")
              const colors = STATUS_COLORS[worker.taskStatus] ?? STATUS_COLORS.idle;

              return (
                <tr key={worker.agentType} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm font-medium text-gray-900">
                    {worker.agentLabel}
                    {worker.taskCount > 0 && (
                      <span className="ml-1.5 text-xs text-gray-400">({worker.taskCount})</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                      {worker.taskStatus}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-500">
                    {running && uptime !== null ? formatDuration(uptime) : "\u2014"}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-500">
                    {running && idle !== null ? formatDuration(idle) : "\u2014"}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => setLogAgent(worker.agentType)}
                      className="p-1.5 text-purple-500 hover:text-purple-700 hover:bg-purple-50 rounded transition-colors inline-flex items-center"
                      title={`View ${worker.agentLabel} logs`}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {running ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleStopWorker(worker.agentType)}
                        isLoading={actionInProgress[worker.agentType]}
                        disabled={isAnyActionInProgress}
                      >
                        Stop
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleStartWorker(worker.agentType)}
                        isLoading={actionInProgress[worker.agentType]}
                        disabled={isAnyActionInProgress}
                      >
                        Start
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer: Start All / Stop All */}
      <div className="px-4 py-3 border-t border-gray-200 flex items-center gap-2">
        {stoppedWorkers.length > 0 && (
          <Button
            variant="primary"
            size="sm"
            onClick={handleStartAll}
            isLoading={bulkActionInProgress}
            disabled={isAnyActionInProgress}
          >
            Start All
          </Button>
        )}
        {runningWorkers.length > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleStopAll}
            isLoading={bulkActionInProgress}
            disabled={isAnyActionInProgress}
          >
            Stop All
          </Button>
        )}
      </div>

      {error && (
        <div className="mx-4 mb-3 p-2 bg-red-50 rounded text-sm text-red-700">{error}</div>
      )}

      {/* Log Modal */}
      {logAgent && (
        <WorkerLogModal
          workerType={logAgent === "__all__" ? "All Agents" : logAgent}
          logEndpoint={
            logAgent === "__all__"
              ? `/api/projects/${projectId}/logs`
              : `/api/projects/${projectId}/logs?agentType=${logAgent}`
          }
          onClose={() => setLogAgent(null)}
        />
      )}
    </div>
  );
}
