"use client";

import { useState } from "react";
import { Button } from "./Button";

// Utility to clear browser caches when worker stops
async function clearBrowserCache() {
  try {
    // Clear localStorage
    localStorage.clear();

    // Clear sessionStorage
    sessionStorage.clear();

    // Clear IndexedDB databases
    if (window.indexedDB && window.indexedDB.databases) {
      const databases = await window.indexedDB.databases();
      databases.forEach((db) => {
        if (db.name) {
          window.indexedDB.deleteDatabase(db.name);
        }
      });
    }

    // Clear Cache API (service worker caches)
    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    }

    console.log("[WorkerStatus] Browser cache cleared");
  } catch (err) {
    console.error("[WorkerStatus] Failed to clear browser cache:", err);
  }
}

interface WorkerStatusData {
  type: string;
  status: "running" | "stopped";
  pid: number | null;
  lastHeartbeat: number | null;
  lastTaskTime: number | null;
  startedAt: number | null;
}

interface WorkerStatusProps {
  workerType?: "backend" | "frontend" | "qa" | "echo" | "orchestrator";
  initialStatus?: WorkerStatusData | null;
}

export function WorkerStatus({
  workerType = "backend",
  initialStatus = null,
}: WorkerStatusProps) {
  // Use initial data from server - NO client fetch, no polling
  const [status, setStatus] = useState<WorkerStatusData | null>(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState(false);

  const handleStart = async () => {
    setActionInProgress(true);
    setError(null);

    try {
      const response = await fetch("/api/workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: workerType }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to start worker");
      }

      // Use response data directly - no second fetch needed
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start worker");
    } finally {
      setActionInProgress(false);
    }
  };

  const handleStop = async () => {
    setActionInProgress(true);
    setError(null);

    try {
      const response = await fetch(`/api/workers/${workerType}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to stop worker");
      }

      // Use response data directly - no second fetch needed
      setStatus(data);

      // Clear browser cache when worker stops
      await clearBrowserCache();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop worker");
    } finally {
      setActionInProgress(false);
    }
  };

  const isRunning = status?.status === "running";
  const idleTime = status?.lastTaskTime
    ? Math.round((Date.now() - status.lastTaskTime) / 1000)
    : null;
  const uptime = status?.startedAt
    ? Math.round((Date.now() - status.startedAt) / 1000)
    : null;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {/* Status indicator */}
          <div className="flex items-center space-x-2">
            <div
              className={`w-3 h-3 rounded-full ${
                isRunning
                  ? "bg-green-500 animate-pulse"
                  : "bg-gray-300"
              }`}
            />
            <span className="font-medium text-gray-900 capitalize">
              {workerType} Worker
            </span>
          </div>

          {/* Status text */}
          <span
            className={`text-sm px-2 py-0.5 rounded-full ${
              isRunning
                ? "bg-green-100 text-green-800"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {isRunning ? "Running" : "Stopped"}
          </span>
        </div>

        {/* Action button */}
        <div>
          {isRunning ? (
            <Button
              variant="secondary"
              onClick={handleStop}
              isLoading={actionInProgress}
              disabled={actionInProgress}
            >
              Stop
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleStart}
              isLoading={actionInProgress}
              disabled={actionInProgress}
            >
              Start Worker
            </Button>
          )}
        </div>
      </div>

      {/* Details when running */}
      {isRunning && status && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex flex-wrap gap-4 text-sm text-gray-500">
            {status.pid && (
              <div>
                <span className="text-gray-400">PID:</span>{" "}
                <span className="font-mono">{status.pid}</span>
              </div>
            )}
            {uptime !== null && (
              <div>
                <span className="text-gray-400">Uptime:</span>{" "}
                {formatDuration(uptime)}
              </div>
            )}
            {idleTime !== null && (
              <div>
                <span className="text-gray-400">Idle:</span>{" "}
                {formatDuration(idleTime)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mt-3 p-2 bg-red-50 rounded text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}
