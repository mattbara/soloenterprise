"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface Run {
  id: string;
  name: string;
  createdAt: string;
  status: string;
  taskCount: number;
}

interface WorkerLogModalProps {
  workerType: string;
  logEndpoint?: string;
  onClose: () => void;
}

export function WorkerLogModal({ workerType, logEndpoint, onClose }: WorkerLogModalProps) {
  const [logs, setLogs] = useState<string>("");
  const [taskName, setTaskName] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const logContainerRef = useRef<HTMLPreElement>(null);

  const fetchLogs = useCallback(async (runId?: string | null) => {
    try {
      setError(null);
      const baseEndpoint = logEndpoint || `/api/workers/${workerType}/logs`;

      // Append runId if provided and this is a project logs endpoint
      let endpoint = baseEndpoint;
      if (runId && baseEndpoint.includes("/api/projects/")) {
        const separator = baseEndpoint.includes("?") ? "&" : "?";
        endpoint = `${baseEndpoint}${separator}runId=${runId}`;
      }

      const response = await fetch(endpoint);
      if (!response.ok) {
        const data = await response.json();
        setError(data.error || "Failed to load logs");
        return;
      }
      const data = await response.json();
      setLogs(data.logs || "");
      setTaskName(data.taskName || null);
      setTaskStatus(data.taskStatus || null);
      setIsRunning(data.isRunning ?? false);

      // Update runs list if returned
      if (data.runs) {
        setRuns(data.runs);
      }
      // Set selected run from API response on initial load
      if (data.selectedRunId && !runId) {
        setSelectedRunId(data.selectedRunId);
      }
    } catch {
      setError("Failed to load logs");
    } finally {
      setLoading(false);
    }
  }, [logEndpoint, workerType]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Auto-scroll to bottom on initial load
  useEffect(() => {
    if (!loading && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [loading, logs]);

  const handleRefresh = () => {
    setLoading(true);
    fetchLogs(selectedRunId);
  };

  const handleRunChange = (newRunId: string) => {
    setSelectedRunId(newRunId);
    setLoading(true);
    fetchLogs(newRunId);
  };

  const handleCopy = async () => {
    if (!logs) return;
    await navigator.clipboard.writeText(logs);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatRunDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const renderLogLine = (line: string, index: number) => {
    let className = "text-gray-100";
    if (line.includes("[ERROR]")) {
      className = "text-red-400";
    } else if (line.includes("[WARN]")) {
      className = "text-amber-400";
    }
    return (
      <div key={index} className={className}>
        {line}
      </div>
    );
  };

  const isProjectEndpoint = logEndpoint?.includes("/api/projects/");

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative bg-gray-900 rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div>
                <h3 className="text-lg font-medium text-gray-100 capitalize">
                  {workerType} Worker Logs
                </h3>
                {taskName && (
                  <p className="text-sm text-gray-400 mt-0.5">
                    Latest task: {taskName}
                  </p>
                )}
              </div>
              {taskStatus && (
                <span
                  className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                    taskStatus === "completed"
                      ? "bg-green-900 text-green-300"
                      : taskStatus === "running"
                        ? "bg-blue-900 text-blue-300"
                        : taskStatus === "failed"
                          ? "bg-red-900 text-red-300"
                          : "bg-gray-700 text-gray-300"
                  }`}
                >
                  {taskStatus}
                </span>
              )}
              {isRunning && (
                <span className="flex items-center gap-1.5 text-xs text-green-400">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
                  </span>
                  Running
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Run Picker */}
              {isProjectEndpoint && runs.length > 0 && (
                <select
                  value={selectedRunId || ""}
                  onChange={(e) => handleRunChange(e.target.value)}
                  className="px-2 py-1.5 text-sm font-medium text-gray-300 bg-gray-800 border border-gray-600 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[280px] truncate"
                >
                  {runs.map((run) => (
                    <option key={run.id} value={run.id}>
                      {run.name} ({formatRunDate(run.createdAt)}) [{run.taskCount}]
                    </option>
                  ))}
                </select>
              )}
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-300 bg-gray-800 border border-gray-600 rounded-md hover:bg-gray-700 disabled:opacity-50"
              >
                <svg
                  className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Refresh
              </button>
              <button
                onClick={handleCopy}
                disabled={!logs}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-300 bg-gray-800 border border-gray-600 rounded-md hover:bg-gray-700 disabled:opacity-50"
              >
                {copied ? (
                  <svg className="h-4 w-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-300"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto min-h-0 p-4">
            {loading && !logs ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                Loading logs...
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-full text-red-400">
                {error}
              </div>
            ) : !logs ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
                <p>No logs available for {workerType} worker.</p>
                <p className="text-sm">Logs appear after the worker processes a task.</p>
              </div>
            ) : (
              <pre
                ref={logContainerRef}
                className="h-full overflow-auto font-mono text-xs leading-5 whitespace-pre-wrap break-all"
              >
                {logs.split("\n").map((line, i) => renderLogLine(line, i))}
              </pre>
            )}
          </div>

          {/* Footer hint */}
          {isRunning && logs && (
            <div className="px-6 py-2 border-t border-gray-700 text-xs text-gray-500 flex-shrink-0">
              Task is running — click Refresh for latest logs
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
