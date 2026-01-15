"use client";

import { useState, useEffect } from "react";

interface StatusBadgeProps {
  status: string;
  processingStartedAt?: string | null;
  estimatedDurationMs?: number; // Default ~30s for Haiku, ~120s for Sonnet
}

const statusClasses: Record<string, string> = {
  pending: "bg-gray-100 text-gray-800",
  queued: "bg-blue-100 text-blue-800",
  running: "bg-green-100 text-green-800",
  waiting_human: "bg-yellow-100 text-yellow-800",
  processing_answer: "bg-purple-100 text-purple-800",
  blocked: "bg-orange-100 text-orange-800",
  completed: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
  cancelled: "bg-gray-300 text-gray-600",
};

const statusLabels: Record<string, string> = {
  pending: "pending",
  queued: "queued",
  running: "running",
  waiting_human: "awaiting human",
  processing_answer: "processing",
  blocked: "blocked",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
};

// Default estimated time for Claude API calls (30s for Haiku)
const DEFAULT_ESTIMATED_MS = 30000;

export function StatusBadge({
  status,
  processingStartedAt,
  estimatedDurationMs = DEFAULT_ESTIMATED_MS,
}: StatusBadgeProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Only track progress for processing_answer status
    if (status !== "processing_answer" || !processingStartedAt) {
      setProgress(0);
      return;
    }

    const startTime = new Date(processingStartedAt).getTime();

    const updateProgress = () => {
      const elapsed = Date.now() - startTime;
      // Cap at 95% to show it's still in progress (never shows 100% until complete)
      const pct = Math.min(95, Math.round((elapsed / estimatedDurationMs) * 100));
      setProgress(pct);
    };

    // Initial update
    updateProgress();

    // Update every second
    const interval = setInterval(updateProgress, 1000);

    return () => clearInterval(interval);
  }, [status, processingStartedAt, estimatedDurationMs]);

  // Special rendering for processing_answer with progress
  if (status === "processing_answer") {
    return (
      <span
        className={`px-2 inline-flex items-center gap-1.5 text-xs leading-5 font-semibold rounded-full ${statusClasses[status]}`}
      >
        {/* Animated spinner */}
        <svg
          className="animate-spin h-3 w-3"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <span>processing {progress > 0 ? `${progress}%` : "..."}</span>
      </span>
    );
  }

  return (
    <span
      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
        statusClasses[status] || "bg-gray-100 text-gray-800"
      }`}
    >
      {statusLabels[status] || status.replace("_", " ")}
    </span>
  );
}
