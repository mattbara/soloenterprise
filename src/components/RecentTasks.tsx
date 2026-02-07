"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "./StatusBadge";
import { RefreshButton } from "./RefreshButton";

interface TaskWarning {
  file: string;
  line?: number;
  message: string;
}

interface TaskContext {
  blockedReason?: string | null;
  blockedByTaskId?: string | null;
  blockedAt?: string | null;
  [key: string]: unknown;
}

interface Task {
  id: string;
  name: string;
  description: string;
  status: string;
  agentType: string;
  attemptCount: number;
  maxAttempts: number;
  createdAt: string;
  processingStartedAt: string | null;
  project: {
    id: string;
    name: string;
  } | null;
  warnings: TaskWarning[] | null;
  context?: TaskContext | null;
}

interface RecentTasksProps {
  tasks: Task[];
}

interface GeneratedFile {
  path: string;
  content: string;
}

export function RecentTasks({ tasks }: RecentTasksProps) {
  const router = useRouter();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [retryingTaskId, setRetryingTaskId] = useState<string | null>(null);
  // Files viewer state
  const [filesTask, setFilesTask] = useState<Task | null>(null);
  const [files, setFiles] = useState<GeneratedFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<GeneratedFile | null>(null);

  // Toggle selection for a single task
  const toggleSelection = (taskId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  // Select all / deselect all
  const toggleSelectAll = () => {
    if (selectedIds.size === tasks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tasks.map((t) => t.id)));
    }
  };

  // Bulk delete selected tasks
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedIds.size} task(s)? This cannot be undone.`
    );
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      const response = await fetch("/api/tasks/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskIds: Array.from(selectedIds) }),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || "Failed to delete tasks");
        return;
      }

      setSelectedIds(new Set());
      router.refresh();
    } catch (error) {
      console.error("Failed to delete tasks:", error);
      alert("Failed to delete tasks");
    } finally {
      setIsDeleting(false);
    }
  };

  // Bulk cancel selected tasks
  const handleBulkCancel = async () => {
    const cancellableIds = Array.from(selectedIds).filter((id) => {
      const task = tasks.find((t) => t.id === id);
      return task && canCancel(task.status);
    });

    if (cancellableIds.length === 0) {
      alert("No selected tasks can be cancelled");
      return;
    }

    const confirmed = window.confirm(
      `Cancel ${cancellableIds.length} task(s)?`
    );
    if (!confirmed) return;

    setIsCancelling(true);
    try {
      const response = await fetch("/api/tasks/bulk-cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskIds: cancellableIds }),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || "Failed to cancel tasks");
        return;
      }

      setSelectedIds(new Set());
      router.refresh();
    } catch (error) {
      console.error("Failed to cancel tasks:", error);
      alert("Failed to cancel tasks");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleCancel = async (taskId: string) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}/cancel`, {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || "Failed to cancel task");
        return;
      }

      // Refresh the page to show updated status
      router.refresh();
    } catch (error) {
      console.error("Failed to cancel task:", error);
      alert("Failed to cancel task");
    }
  };

  const handleArchive = async (taskId: string) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}/archive`, {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || "Failed to archive task");
        return;
      }

      // Refresh the page to hide archived task
      router.refresh();
    } catch (error) {
      console.error("Failed to archive task:", error);
      alert("Failed to archive task");
    }
  };

  // Check if task can be cancelled (not already completed/cancelled)
  const canCancel = (status: string) =>
    !["completed", "cancelled", "failed"].includes(status);

  // Check if task can be retried (failed, waiting_human, or blocked)
  const canRetry = (status: string) =>
    ["failed", "waiting_human", "blocked"].includes(status);

  const handleRetry = async (taskId: string) => {
    setRetryingTaskId(taskId);
    try {
      const response = await fetch(`/api/tasks/${taskId}/retry`, {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || "Failed to retry task");
        return;
      }

      // Refresh the page to show updated status
      router.refresh();
    } catch (error) {
      console.error("Failed to retry task:", error);
      alert("Failed to retry task");
    } finally {
      setRetryingTaskId(null);
    }
  };

  const handleCopy = async () => {
    if (selectedTask) {
      await navigator.clipboard.writeText(selectedTask.description);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCloseModal = () => {
    setSelectedTask(null);
    setCopied(false);
  };

  // Files viewer handlers
  const handleViewFiles = async (task: Task) => {
    setFilesTask(task);
    setFilesLoading(true);
    setFilesError(null);
    setSelectedFile(null);

    try {
      const response = await fetch(`/api/tasks/${task.id}/files`);
      const data = await response.json();

      if (data.error && data.files.length === 0) {
        setFilesError(data.error);
        setFiles([]);
      } else {
        setFiles(data.files || []);
        // Auto-select first file if available
        if (data.files && data.files.length > 0) {
          setSelectedFile(data.files[0]);
        }
      }
    } catch (error) {
      console.error("Failed to fetch files:", error);
      setFilesError("Failed to load files");
      setFiles([]);
    } finally {
      setFilesLoading(false);
    }
  };

  const handleCloseFilesModal = () => {
    setFilesTask(null);
    setFiles([]);
    setFilesError(null);
    setSelectedFile(null);
  };

  // Check if task can have generated files (completed or failed with output)
  const canViewFiles = (status: string) =>
    ["completed", "failed"].includes(status);

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-4 py-5 sm:px-6 border-b flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-medium text-gray-900">Recent Tasks</h2>
          {selectedIds.size > 0 && (
            <span className="text-sm text-gray-500">
              {selectedIds.size} selected
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <>
              <button
                onClick={handleBulkCancel}
                disabled={isCancelling}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCancelling ? "Cancelling..." : "Cancel Selected"}
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? "Deleting..." : "Delete Selected"}
              </button>
            </>
          )}
          <RefreshButton />
        </div>
      </div>
      {/* Scrollable container with sticky header */}
      <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={tasks.length > 0 && selectedIds.size === tasks.length}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  title={selectedIds.size === tasks.length ? "Deselect all" : "Select all"}
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Title
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
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-4 text-center text-gray-500">
                  No tasks yet
                </td>
              </tr>
            ) : (
              tasks.map((task) => (
                <tr key={task.id} className={`hover:bg-gray-50 transition-colors ${selectedIds.has(task.id) ? "bg-blue-50" : ""}`}>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(task.id)}
                      onChange={() => toggleSelection(task.id)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-xs font-mono text-gray-500">
                    {task.id.slice(0, 8)}
                  </td>
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
                    <div className="flex items-center gap-2">
                      <StatusBadge
                        status={task.status}
                        processingStartedAt={task.processingStartedAt}
                      />
                      {task.status === "blocked" && task.context?.blockedReason && (
                        <span
                          className="text-xs text-orange-600"
                          title={task.context.blockedReason}
                        >
                          ({task.context.blockedReason})
                        </span>
                      )}
                      {task.warnings && task.warnings.length > 0 && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-800"
                          title={`${task.warnings.length} syntax warning(s)`}
                        >
                          <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          {task.warnings.length}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {task.attemptCount}/{task.maxAttempts}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setSelectedTask(task)}
                        className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors inline-flex items-center"
                        title="View description"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </button>
                      {canViewFiles(task.status) && (
                        <button
                          onClick={() => handleViewFiles(task)}
                          className="p-1.5 text-green-600 hover:text-green-700 hover:bg-green-50 rounded transition-colors inline-flex items-center"
                          title="View generated files"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                          </svg>
                        </button>
                      )}
                      {canRetry(task.status) && (
                        <button
                          onClick={() => handleRetry(task.id)}
                          disabled={retryingTaskId === task.id}
                          className="p-1.5 text-orange-500 hover:text-orange-700 hover:bg-orange-50 rounded transition-colors inline-flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Retry task"
                        >
                          {retryingTaskId === task.id ? (
                            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          ) : (
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          )}
                        </button>
                      )}
                      {canCancel(task.status) && (
                        <button
                          onClick={() => handleCancel(task.id)}
                          className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors inline-flex items-center"
                          title="Cancel task"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={() => handleArchive(task.id)}
                        className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors inline-flex items-center"
                        title="Archive task"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Description Modal */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={handleCloseModal}
            />

            {/* Modal */}
            <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <h3 className="text-lg font-medium text-gray-900">
                  Task Description
                </h3>
                <button
                  onClick={handleCloseModal}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="px-6 py-4">
                <div className="mb-2 text-sm text-gray-500">
                  <span className="font-medium">Title:</span> {selectedTask.name}
                </div>
                <div className="mb-4 text-sm text-gray-500">
                  <span className="font-medium">ID:</span> {selectedTask.id.slice(0, 8)}
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono">
                    {selectedTask.description}
                  </pre>
                </div>

                {/* Warnings Banner */}
                {selectedTask.warnings && selectedTask.warnings.length > 0 && (
                  <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <svg className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-amber-800">
                          Completed with {selectedTask.warnings.length} syntax warning{selectedTask.warnings.length !== 1 ? 's' : ''}
                        </h4>
                        <ul className="mt-2 text-sm text-amber-700 space-y-1">
                          {selectedTask.warnings.map((warning, index) => (
                            <li key={index} className="font-mono text-xs">
                              <span className="font-medium">{warning.file}</span>
                              {warning.line && <span className="text-amber-600">:{warning.line}</span>}
                              <span className="text-amber-600"> — {warning.message}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
                <button
                  onClick={handleCopy}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {copied ? (
                    <>
                      <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy
                    </>
                  )}
                </button>
                <button
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Files Viewer Modal */}
      {filesTask && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={handleCloseFilesModal}
            />

            {/* Modal */}
            <div className="relative bg-white rounded-lg shadow-xl max-w-5xl w-full mx-4 max-h-[80vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">
                    Generated Files
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Task: {filesTask.name} ({filesTask.id.slice(0, 8)})
                  </p>
                </div>
                <button
                  onClick={handleCloseFilesModal}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-hidden flex min-h-0">
                {filesLoading ? (
                  <div className="flex items-center justify-center w-full py-12">
                    <div className="text-gray-500">Loading files...</div>
                  </div>
                ) : filesError ? (
                  <div className="flex items-center justify-center w-full py-12">
                    <div className="text-gray-500">{filesError}</div>
                  </div>
                ) : files.length === 0 ? (
                  <div className="flex items-center justify-center w-full py-12">
                    <div className="text-gray-500">No generated files found</div>
                  </div>
                ) : (
                  <>
                    {/* File tree */}
                    <div className="w-64 border-r bg-gray-50 overflow-y-auto flex-shrink-0">
                      <div className="p-2">
                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider px-2 py-1">
                          Files ({files.length})
                        </div>
                        <ul className="mt-1 space-y-0.5">
                          {files.map((file) => (
                            <li key={file.path}>
                              <button
                                onClick={() => setSelectedFile(file)}
                                className={`w-full text-left px-2 py-1.5 text-sm rounded transition-colors ${
                                  selectedFile?.path === file.path
                                    ? "bg-blue-100 text-blue-800"
                                    : "text-gray-700 hover:bg-gray-100"
                                }`}
                              >
                                <span className="font-mono text-xs truncate block">
                                  {file.path}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* File content */}
                    <div className="flex-1 overflow-auto min-w-0">
                      {selectedFile ? (
                        <div className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-mono text-sm text-gray-600">
                              {selectedFile.path}
                            </span>
                            <button
                              onClick={async () => {
                                await navigator.clipboard.writeText(selectedFile.content);
                              }}
                              className="text-xs text-blue-600 hover:text-blue-800"
                            >
                              Copy
                            </button>
                          </div>
                          <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-auto text-sm font-mono whitespace-pre">
                            {selectedFile.content}
                          </pre>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-full text-gray-500">
                          Select a file to view its contents
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 flex-shrink-0">
                <button
                  onClick={handleCloseFilesModal}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
