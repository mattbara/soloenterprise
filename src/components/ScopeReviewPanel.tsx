"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";

interface ScopeData {
  projectName?: string;
  summary?: string;
  requirements?: Array<{
    id: string;
    description: string;
    category?: string;
    complexity?: string;
    estimatedTasks?: number;
  }>;
  agentsRequired?: string[];
  estimates?: {
    totalTasks?: number;
    durationRange?: string;
    confidence?: string;
    riskLevel?: string;
  };
  gaps?: Array<{
    description: string;
    blocking?: boolean;
    severity?: string;
  }>;
  outOfScope?: string[];
  milestones?: Array<{
    name: string;
    description?: string;
    deliverables?: string[];
    targetDate?: string;
  }>;
}

interface ScopeReviewPanelProps {
  scopeId: string;
  scopeData: ScopeData;
  clientDocument: string | null;
  estimatedTasks: number | null;
  estimatedDuration: string | null;
  riskLevel: string | null;
  status: string;
  companyId: string;
  projectName: string;
}

export function ScopeReviewPanel({
  scopeId,
  scopeData: sd,
  clientDocument,
  estimatedTasks,
  estimatedDuration,
  riskLevel,
  status: initialStatus,
  companyId,
  projectName,
}: ScopeReviewPanelProps) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [promptText, setPromptText] = useState("");
  const [submittedPrompt, setSubmittedPrompt] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleAction(action: "approve" | "reject") {
    setActionLoading(true);
    setActionMessage(null);

    try {
      const res = await fetch(`/api/scopes/${scopeId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(action === "approve"
            ? {
                approvedBy: "human",
                additionalContext: submittedPrompt || promptText.trim() || undefined,
              }
            : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Failed to ${action} scope`);
      }

      const data = await res.json();

      if (action === "approve") {
        setStatus("approved");
        setActionMessage({
          type: "success",
          text: `Scope approved. Orchestrator task created${data.orchestratorTaskId ? ` (${data.orchestratorTaskId})` : ""}. Workers ${data.workersStarted ? "started" : "already running"}.`,
        });
        setTimeout(() => router.push(`/companies/${companyId}`), 2000);
      } else {
        setStatus("rejected");
        setActionMessage({ type: "success", text: "Scope rejected." });
      }
    } catch (err) {
      setActionMessage({ type: "error", text: err instanceof Error ? err.message : "Action failed" });
    } finally {
      setActionLoading(false);
    }
  }

  function handleSubmitPrompt() {
    const text = promptText.trim();
    if (text) {
      setSubmittedPrompt(text);
      setPromptText("");
    }
  }

  const scopeMarkdown = buildScopeMarkdown(sd, estimatedTasks, estimatedDuration, riskLevel);
  const isActionable = status === "draft" || status === "ready";

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <h1 className="text-2xl font-bold text-gray-900 mb-4 shrink-0">{projectName} — Scope Review</h1>

      {actionMessage && (
        <div className={`mb-4 p-3 rounded-md text-sm shrink-0 ${actionMessage.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {actionMessage.text}
        </div>
      )}

      <div className="flex gap-6 min-h-0 flex-1">
        {/* Left (35%): Scope Document + Notes + Actions */}
        <div className="w-[35%] shrink-0 flex flex-col gap-4 min-h-0">
          <div className="bg-white shadow rounded-lg p-4 flex-1 overflow-y-auto min-h-0">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Scope Document</h2>
            <MarkdownRenderer content={scopeMarkdown} />
          </div>

          {isActionable && (
            <div className="bg-white shadow rounded-lg p-4 space-y-4 shrink-0">
              <div>
                <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 mb-1">
                  Add notes for the development team
                </label>
                <textarea
                  id="prompt"
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  rows={3}
                  className="block w-full rounded-md border border-gray-300 p-3 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="E.g., prioritize the auth module first, use Stripe for payments..."
                />
                <button
                  onClick={handleSubmitPrompt}
                  disabled={!promptText.trim()}
                  className="mt-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Add Note
                </button>
              </div>

              {submittedPrompt && (
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-800">
                  <span className="font-medium">Note added:</span> {submittedPrompt}
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => handleAction("reject")}
                  disabled={actionLoading}
                  className="flex-1 rounded-md border border-red-300 px-4 py-2.5 text-sm font-medium text-red-700 bg-white hover:bg-red-50 disabled:opacity-50"
                >
                  Reject
                </button>
                <button
                  onClick={() => handleAction("approve")}
                  disabled={actionLoading}
                  className="flex-1 rounded-md bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {actionLoading ? "Processing..." : "Accept"}
                </button>
              </div>
            </div>
          )}

          {!isActionable && (
            <div className={`p-3 rounded-md text-sm shrink-0 ${status === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
              This scope has been {status}.
            </div>
          )}
        </div>

        {/* Right (65%): Client Document — fills viewport, scrolls internally */}
        <div className="w-[65%] min-h-0 flex flex-col">
          <h2 className="text-lg font-semibold text-gray-900 mb-3 shrink-0">Client Document</h2>
          <div className="bg-white shadow rounded-lg p-6 flex-1 overflow-y-auto">
            <MarkdownRenderer content={clientDocument || "No client document available."} />
          </div>
        </div>
      </div>
    </div>
  );
}

function buildScopeMarkdown(
  sd: ScopeData,
  estimatedTasks: number | null,
  estimatedDuration: string | null,
  riskLevel: string | null
): string {
  const parts: string[] = [];

  if (sd.projectName) parts.push(`# ${sd.projectName}\n`);
  if (sd.summary) parts.push(`## Summary\n${sd.summary}\n`);

  if (estimatedTasks || estimatedDuration || riskLevel || sd.estimates) {
    parts.push(`## Estimates\n`);
    const tasks = estimatedTasks ?? sd.estimates?.totalTasks;
    const duration = estimatedDuration ?? sd.estimates?.durationRange;
    if (tasks) parts.push(`- **Total Tasks:** ${tasks}`);
    if (duration) parts.push(`- **Duration:** ${duration}`);
    if (riskLevel || sd.estimates?.riskLevel) parts.push(`- **Risk Level:** ${riskLevel || sd.estimates?.riskLevel}`);
    if (sd.estimates?.confidence) parts.push(`- **Confidence:** ${sd.estimates.confidence}`);
    parts.push("");
  }

  if (sd.requirements?.length) {
    parts.push(`## Requirements (${sd.requirements.length})\n`);
    sd.requirements.forEach((req) => {
      const meta = [req.category, req.complexity, req.estimatedTasks ? `${req.estimatedTasks} tasks` : null]
        .filter(Boolean)
        .join(" | ");
      parts.push(`- **${req.id}** ${meta ? `(${meta})` : ""}: ${req.description}`);
    });
    parts.push("");
  }

  if (sd.milestones?.length) {
    parts.push(`## Milestones\n`);
    sd.milestones.forEach((ms, i) => {
      parts.push(`### ${i + 1}. ${ms.name}${ms.targetDate ? ` (${ms.targetDate})` : ""}`);
      if (ms.description) parts.push(ms.description);
      if (ms.deliverables?.length) {
        ms.deliverables.forEach((d) => parts.push(`- ${d}`));
      }
      parts.push("");
    });
  }

  if (sd.gaps?.length) {
    parts.push(`## Gaps & Questions\n`);
    sd.gaps.forEach((gap) => {
      const prefix = gap.blocking ? "**[BLOCKING]** " : "";
      parts.push(`- ${prefix}${gap.description}`);
    });
    parts.push("");
  }

  if (sd.outOfScope?.length) {
    parts.push(`## Out of Scope\n`);
    sd.outOfScope.forEach((item) => parts.push(`- ${item}`));
    parts.push("");
  }

  if (sd.agentsRequired?.length) {
    parts.push(`## Agents Required\n`);
    parts.push(sd.agentsRequired.map((a) => `\`${a}\``).join(", "));
    parts.push("");
  }

  return parts.join("\n");
}
