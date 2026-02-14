"use client";

import { useState } from "react";
import { Button } from "./Button";
import { WorkerLogModal } from "./WorkerLogModal";

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
    console.error("[WorkerDashboardPanel] Failed to clear browser cache:", err);
  }
}

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

type WorkerType = "orchestrator" | "backend" | "frontend" | "qa" | "scoper";

interface WorkerStatusData {
  type: string;
  status: "running" | "stopped";
  pid: number | null;
  lastHeartbeat: number | null;
  lastTaskTime: number | null;
  startedAt: number | null;
}

interface Stats {
  projects: number;
  pendingTasks: number;
  runningTasks: number;
  waitingHuman: number;
  pendingQuestions: number;
  activeLocks: number;
}

interface WorkerDashboardPanelProps {
  workerStatuses: Record<WorkerType, WorkerStatusData | null>;
  stats: Stats;
}

const WORKER_TYPES: WorkerType[] = ["orchestrator", "backend", "frontend", "qa", "scoper"];

const STAT_ROWS: { key: keyof Stats; label: string; color: string }[] = [
  { key: "projects", label: "Projects", color: "bg-blue-500" },
  { key: "pendingTasks", label: "Pending Tasks", color: "bg-yellow-500" },
  { key: "runningTasks", label: "Running Tasks", color: "bg-green-500" },
  { key: "waitingHuman", label: "Waiting Human", color: "bg-orange-500" },
  { key: "pendingQuestions", label: "Pending Questions", color: "bg-red-500" },
  { key: "activeLocks", label: "Active File Locks", color: "bg-purple-500" },
];

export function WorkerDashboardPanel({ workerStatuses, stats }: WorkerDashboardPanelProps) {
  const [statuses, setStatuses] = useState<Record<WorkerType, WorkerStatusData | null>>(workerStatuses);
  const [actionInProgress, setActionInProgress] = useState<Record<WorkerType, boolean>>({
    orchestrator: false,
    backend: false,
    frontend: false,
    qa: false,
    scoper: false,
  });
  const [bulkActionInProgress, setBulkActionInProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logsWorker, setLogsWorker] = useState<WorkerType | null>(null);

  const now = Date.now();

  const handleStart = async (type: WorkerType) => {
    setActionInProgress((prev) => ({ ...prev, [type]: true }));
    setError(null);
    try {
      const response = await fetch("/api/workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to start worker");
      setStatuses((prev) => ({ ...prev, [type]: data }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start worker");
    } finally {
      setActionInProgress((prev) => ({ ...prev, [type]: false }));
    }
  };

  const handleStop = async (type: WorkerType) => {
    setActionInProgress((prev) => ({ ...prev, [type]: true }));
    setError(null);
    try {
      const response = await fetch(`/api/workers/${type}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to stop worker");
      setStatuses((prev) => ({ ...prev, [type]: data }));
      await clearBrowserCache();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop worker");
    } finally {
      setActionInProgress((prev) => ({ ...prev, [type]: false }));
    }
  };

  const stoppedWorkers = WORKER_TYPES.filter((t) => statuses[t]?.status !== "running");
  const runningWorkers = WORKER_TYPES.filter((t) => statuses[t]?.status === "running");

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
      // Response is a map of worker type → status
      setStatuses((prev) => ({ ...prev, ...data }));
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
      for (const type of runningWorkers) {
        const response = await fetch(`/api/workers/${type}`, { method: "DELETE" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `Failed to stop ${type}`);
        setStatuses((prev) => ({ ...prev, [type]: data }));
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
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* Workers Table */}
      <div className="lg:col-span-3 bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">Workers</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">PID</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Uptime</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Idle</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Logs</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {WORKER_TYPES.map((type) => {
                const s = statuses[type];
                const isRunning = s?.status === "running";
                const uptime = s?.startedAt ? Math.round((now - s.startedAt) / 1000) : null;
                const idle = s?.lastTaskTime ? Math.round((now - s.lastTaskTime) / 1000) : null;

                return (
                  <tr key={type} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm font-medium text-gray-900 capitalize">{type}</td>
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isRunning ? "bg-green-500 animate-pulse" : "bg-gray-300"
                          }`}
                        />
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded-full ${
                            isRunning ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {isRunning ? "Running" : "Stopped"}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm font-mono text-gray-500">
                      {isRunning && s?.pid ? s.pid : "\u2014"}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-500">
                      {isRunning && uptime !== null ? formatDuration(uptime) : "\u2014"}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-500">
                      {isRunning && idle !== null ? formatDuration(idle) : "\u2014"}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button
                        onClick={() => setLogsWorker(type)}
                        className="p-1.5 text-purple-500 hover:text-purple-700 hover:bg-purple-50 rounded transition-colors inline-flex items-center"
                        title={`View ${type} worker logs`}
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {isRunning ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleStop(type)}
                          isLoading={actionInProgress[type]}
                          disabled={isAnyActionInProgress}
                        >
                          Stop
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleStart(type)}
                          isLoading={actionInProgress[type]}
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
        <div className="px-4 py-3 border-t border-gray-200 flex gap-2">
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
      </div>

      {/* Stats Table */}
      <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">Overview</h3>
        </div>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase" colSpan={2}>
                Metric
              </th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Count</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {STAT_ROWS.map((row) => (
              <tr key={row.key} className="hover:bg-gray-50">
                <td className="pl-4 py-2 w-6">
                  <span className={`inline-block w-2.5 h-2.5 rounded-full ${row.color}`} />
                </td>
                <td className="px-2 py-2 text-sm text-gray-700">{row.label}</td>
                <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">{stats[row.key]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Worker Log Modal */}
      {logsWorker && (
        <WorkerLogModal
          workerType={logsWorker}
          onClose={() => setLogsWorker(null)}
        />
      )}
    </div>
  );
}
