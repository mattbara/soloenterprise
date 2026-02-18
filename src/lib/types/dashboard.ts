/**
 * Shared types for dashboard and project detail pages.
 */

export interface ProjectWithProgress {
  id: string;
  name: string;
  status: string;
  clientName: string | null;
  totalTasks: number;
  completedTasks: number;
  runningTasks: number;
  failedTasks: number;
  progressPercent: number;
}

export interface WorkerWithTask {
  agentType: string;
  agentLabel: string;
  // Worker process info (global)
  workerStatus: "running" | "stopped";
  pid: number | null;
  uptime: number | null; // seconds
  idle: number | null; // seconds since last task
  // Per-project task info
  currentTask: { id: string; name: string; status: string } | null;
  taskStatus: "running" | "completed" | "pending" | "idle" | "failed";
  taskCount: number;
}

export interface SerializedTask {
  id: string;
  name: string;
  description: string;
  status: string;
  agentType: string;
  attemptCount: number;
  maxAttempts: number;
  createdAt: string;
  processingStartedAt: string | null;
  project: { id: string; name: string } | null;
  warnings: Array<{ file: string; line?: number; message: string }> | null;
  dependsOn: string[];
  context: Record<string, unknown> | null;
  imageAttachments: Array<{ url: string; mimeType: string; name: string }> | null;
  imageRequirements: string | null;
  imageRequirementsTokens: number | null;
}
