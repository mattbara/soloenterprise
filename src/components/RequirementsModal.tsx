"use client";

import { useState, useEffect } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";

interface Project {
  id: string;
  name: string;
}

interface TaskResult {
  taskId: string;
  jobId: string;
  projectId: string;
}

interface RequirementsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  projects: Project[]; // Server-provided, no client fetch needed
}

export function RequirementsModal({
  isOpen,
  onClose,
  onSuccess,
  projects,
}: RequirementsModalProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [requirements, setRequirements] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taskResult, setTaskResult] = useState<TaskResult | null>(null);

  // Auto-select first project when modal opens if only one exists
  useEffect(() => {
    if (isOpen && projects.length === 1 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [isOpen, projects, selectedProjectId]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedProjectId("");
      setRequirements("");
      setError(null);
      setTaskResult(null);
    }
  }, [isOpen]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Validate
    if (!selectedProjectId) {
      setError("Please select a project");
      return;
    }

    if (!requirements.trim()) {
      setError("Please enter requirements");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/tasks/backend", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId: selectedProjectId,
          requirements: requirements.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create task");
      }

      const result: TaskResult = await response.json();
      setTaskResult(result);
      onSuccess(); // This calls router.refresh() in parent
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  function handleClose() {
    setTaskResult(null);
    onClose();
  }

  // Success state - show task created info
  if (taskResult) {
    return (
      <Modal isOpen={isOpen} onClose={handleClose} title="Task Created Successfully">
        <div className="space-y-4">
          {/* Success Icon */}
          <div className="flex justify-center">
            <div className="rounded-full bg-green-100 p-3">
              <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
          </div>

          {/* Status Explanation */}
          <div className="text-center">
            <h4 className="text-lg font-medium text-gray-900">Task Queued</h4>
            <p className="mt-1 text-sm text-gray-500">
              Your task has been added to the processing queue.
            </p>
          </div>

          {/* Task Details */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Task ID:</span>
              <code className="text-gray-900 font-mono text-xs bg-gray-200 px-2 py-0.5 rounded">
                {taskResult.taskId.slice(0, 8)}...
              </code>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Status:</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                Queued
              </span>
            </div>
          </div>

          {/* What Happens Next */}
          <div className="border-t pt-4">
            <h5 className="text-sm font-medium text-gray-900 mb-2">What happens next?</h5>
            <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
              <li>The backend worker will pick up this task</li>
              <li>Claude AI will analyze your requirements</li>
              <li>If clarification is needed, you&apos;ll be asked questions</li>
              <li>Generated code will appear in the artifacts</li>
            </ol>
          </div>

          {/* Worker Status Warning */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex">
              <svg className="h-5 w-5 text-amber-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div className="ml-3">
                <p className="text-sm text-amber-700">
                  <strong>Note:</strong> Make sure the worker is running:
                </p>
                <code className="text-xs text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded mt-1 inline-block">
                  pnpm worker:backend
                </code>
              </div>
            </div>
          </div>

          {/* Close Button */}
          <div className="flex justify-end pt-2">
            <Button variant="primary" onClick={handleClose}>
              Done
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Backend Task">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Error Message */}
        {error && (
          <div className="rounded-md bg-red-50 p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Project Dropdown */}
        <div>
          <label
            htmlFor="project"
            className="block text-sm font-medium text-gray-700"
          >
            Project
          </label>
          <select
            id="project"
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            disabled={isLoading}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            <option value="">Select a project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          {projects.length === 0 && (
            <p className="mt-1 text-sm text-gray-500">
              No projects available. Create a project first.
            </p>
          )}
        </div>

        {/* Requirements Textarea */}
        <div>
          <label
            htmlFor="requirements"
            className="block text-sm font-medium text-gray-700"
          >
            Requirements
          </label>
          <textarea
            id="requirements"
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            disabled={isLoading}
            rows={6}
            placeholder="Describe what you want the backend agent to build..."
            className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm p-3 disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3 pt-4 border-t">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={isLoading}
            disabled={!selectedProjectId || !requirements.trim()}
          >
            Create Task
          </Button>
        </div>
      </form>
    </Modal>
  );
}
