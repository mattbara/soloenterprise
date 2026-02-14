"use client";

import { useState, useEffect, useRef } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";

type AgentType = "orchestrator" | "backend" | "frontend" | "qa";

interface Project {
  id: string;
  name: string;
}

interface TaskResult {
  taskId: string;
  jobId: string;
  projectId: string;
  agentType: AgentType;
}

interface RequirementsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  projects: Project[]; // Server-provided, no client fetch needed
}

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB per file
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export function RequirementsModal({
  isOpen,
  onClose,
  onSuccess,
  projects,
}: RequirementsModalProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [agentType, setAgentType] = useState<AgentType>("backend");
  const [title, setTitle] = useState<string>("");
  const [requirements, setRequirements] = useState<string>("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [taskResult, setTaskResult] = useState<TaskResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setAgentType("backend");
      setTitle("");
      setRequirements("");
      setSelectedFiles([]);
      setPreviews([]);
      setError(null);
      setUploadProgress(null);
      setTaskResult(null);
    }
  }, [isOpen]);

  // Generate previews when files change
  useEffect(() => {
    const urls = selectedFiles.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [selectedFiles]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    // Validate count
    // No artificial cap — upload as many as needed

    // Validate each file
    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(`"${file.name}" is not a supported image type. Use PNG, JPEG, WebP, or GIF.`);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`"${file.name}" exceeds 2MB limit.`);
        return;
      }
    }

    setError(null);
    setSelectedFiles((prev) => [...prev, ...files]);

    // Reset input so same file can be re-selected
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function removeFile(index: number) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Validate
    if (!selectedProjectId) {
      setError("Please select a project");
      return;
    }

    if (!title.trim()) {
      setError("Please enter a title");
      return;
    }

    if (!requirements.trim()) {
      setError("Please enter requirements");
      return;
    }

    setIsLoading(true);

    try {
      // 1. Create task first (need taskId for image upload)
      const response = await fetch("/api/tasks/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId: selectedProjectId,
          agentType,
          title: title.trim(),
          requirements: requirements.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create task");
      }

      const result: TaskResult = await response.json();

      // 2. Upload images if any
      if (selectedFiles.length > 0) {
        setUploadProgress(`Uploading ${selectedFiles.length} image(s)...`);

        const formData = new FormData();
        formData.append("taskId", result.taskId);
        for (const file of selectedFiles) {
          formData.append("files", file);
        }

        const uploadResponse = await fetch("/api/tasks/upload-images", {
          method: "POST",
          body: formData,
        });

        if (!uploadResponse.ok) {
          const data = await uploadResponse.json();
          // Task was created but upload failed — warn but don't fail
          console.error("Image upload failed:", data.error);
          setUploadProgress(null);
        } else {
          setUploadProgress(null);
        }
      }

      setTaskResult(result);
      onSuccess(); // This calls router.refresh() in parent
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
      setUploadProgress(null);
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
            {selectedFiles.length > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Images:</span>
                <span className="text-gray-900">{selectedFiles.length} attached</span>
              </div>
            )}
          </div>

          {/* What Happens Next */}
          <div className="border-t pt-4">
            <h5 className="text-sm font-medium text-gray-900 mb-2">What happens next?</h5>
            <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
              <li>The {taskResult.agentType} worker will pick up this task</li>
              {selectedFiles.length > 0 && (
                <li>Visual requirements will be extracted from your images</li>
              )}
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
                  pnpm worker:{taskResult.agentType}
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
    <Modal isOpen={isOpen} onClose={onClose} title="New Task">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Error Message */}
        {error && (
          <div className="rounded-md bg-red-50 p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Upload Progress */}
        {uploadProgress && (
          <div className="rounded-md bg-blue-50 p-3">
            <p className="text-sm text-blue-700">{uploadProgress}</p>
          </div>
        )}

        {/* Agent Type Dropdown */}
        <div>
          <label
            htmlFor="agentType"
            className="block text-sm font-medium text-gray-700"
          >
            Agent Type
          </label>
          <select
            id="agentType"
            value={agentType}
            onChange={(e) => setAgentType(e.target.value as AgentType)}
            disabled={isLoading}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            <option value="orchestrator">Orchestrator (Coordinator)</option>
            <option value="backend">Backend</option>
            <option value="frontend">Frontend</option>
            <option value="qa">QA</option>
          </select>
          <p className="mt-1 text-xs text-gray-500">
            {agentType === "orchestrator"
              ? "Decomposes projects, assigns tasks to other agents, coordinates work"
              : agentType === "backend"
              ? "API routes, database queries, services, etc."
              : agentType === "frontend"
              ? "React components, pages, hooks, etc."
              : "Unit tests, component tests, integration tests (Vitest + React Testing Library)"}
          </p>
        </div>

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

        {/* Title Input */}
        <div>
          <label
            htmlFor="title"
            className="block text-sm font-medium text-gray-700"
          >
            Title
          </label>
          <input
            type="text"
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isLoading}
            placeholder="e.g., Add user authentication API"
            className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm p-3 disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
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

        {/* Image Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Reference Images (optional)
          </label>
          <p className="mt-1 text-xs text-gray-500">
            Attach mockups, wireframes, or screenshots. Visual requirements will be extracted automatically.
          </p>

          {/* Preview thumbnails */}
          {previews.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {previews.map((url, i) => (
                <div key={i} className="relative group">
                  <img
                    src={url}
                    alt={selectedFiles[i]?.name ?? "preview"}
                    className="h-20 w-20 rounded-md object-cover border border-gray-200"
                  />
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    disabled={isLoading}
                    className="absolute -top-1.5 -right-1.5 rounded-full bg-red-500 text-white w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity disabled:cursor-not-allowed"
                    aria-label={`Remove ${selectedFiles[i]?.name}`}
                  >
                    x
                  </button>
                  <p className="text-[10px] text-gray-400 truncate w-20 mt-0.5">
                    {selectedFiles[i]?.name}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* File input */}
          <div className="mt-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleFileSelect}
                disabled={isLoading}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
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
            disabled={!selectedProjectId || !title.trim() || !requirements.trim()}
          >
            {selectedFiles.length > 0
              ? `Create Task (${selectedFiles.length} image${selectedFiles.length > 1 ? "s" : ""})`
              : "Create Task"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
