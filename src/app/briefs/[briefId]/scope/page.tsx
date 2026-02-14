"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { MarkdownRenderer } from "@/components";

interface ScopeRequirement {
  id: string;
  description: string;
  category?: string;
  complexity?: string;
  estimatedTasks?: number;
}

interface ScopeGap {
  description: string;
  blocking?: boolean;
  severity?: string;
}

interface ScopeMilestone {
  name: string;
  description?: string;
  deliverables?: string[];
  targetDate?: string;
}

interface ScopeData {
  projectName?: string;
  summary?: string;
  requirements?: ScopeRequirement[];
  agentsRequired?: string[];
  estimates?: {
    totalTasks?: number;
    durationRange?: string;
    confidence?: string;
    riskLevel?: string;
  };
  gaps?: ScopeGap[];
  outOfScope?: string[];
  milestones?: ScopeMilestone[];
}

interface Scope {
  id: string;
  briefId: string;
  projectId: string | null;
  scopeData: ScopeData;
  clientDocument: string | null;
  estimatedTasks: number | null;
  estimatedDuration: string | null;
  riskLevel: string | null;
  status: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  brief: {
    id: string;
    title: string;
    status: string;
  };
}

interface Brief {
  id: string;
  title: string;
  status: string;
  scope: { id: string } | null;
}

const RISK_COLORS: Record<string, string> = {
  low: "text-green-700 bg-green-100",
  medium: "text-yellow-700 bg-yellow-100",
  high: "text-orange-700 bg-orange-100",
  critical: "text-red-700 bg-red-100",
};

const COMPLEXITY_COLORS: Record<string, string> = {
  simple: "text-green-600",
  moderate: "text-yellow-600",
  complex: "text-orange-600",
  very_complex: "text-red-600",
};

export default function ScopeReviewPage({ params }: { params: Promise<{ briefId: string }> }) {
  const { briefId } = use(params);
  const [scope, setScope] = useState<Scope | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [briefStatus, setBriefStatus] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        // First get the brief to find the scope ID
        const briefRes = await fetch(`/api/briefs/${briefId}`);
        if (!briefRes.ok) throw new Error("Brief not found");
        const brief: Brief = await briefRes.json();
        setBriefStatus(brief.status);

        if (!brief.scope) {
          // No scope yet — brief might still be scoping
          setLoading(false);
          return;
        }

        // Fetch the full scope
        const scopeRes = await fetch(`/api/scopes/${brief.scope.id}`);
        if (!scopeRes.ok) throw new Error("Scope not found");
        const scopeData = await scopeRes.json();
        setScope(scopeData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [briefId]);

  // Auto-refresh while brief is still scoping
  useEffect(() => {
    if (briefStatus !== "scoping" || scope) return;

    const interval = setInterval(async () => {
      try {
        const briefRes = await fetch(`/api/briefs/${briefId}`);
        if (!briefRes.ok) return;
        const brief: Brief = await briefRes.json();
        setBriefStatus(brief.status);

        if (brief.scope) {
          const scopeRes = await fetch(`/api/scopes/${brief.scope.id}`);
          if (scopeRes.ok) {
            setScope(await scopeRes.json());
          }
        }
      } catch {
        // silent retry
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [briefId, briefStatus, scope]);

  async function handleAction(action: "approve" | "reject") {
    if (!scope) return;
    setActionLoading(true);
    setActionMessage(null);

    try {
      const res = await fetch(`/api/scopes/${scope.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(action === "approve" ? { approvedBy: "human" } : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Failed to ${action} scope`);
      }

      const updated = await res.json();
      setScope((prev) => prev ? { ...prev, status: updated.status, approvedBy: updated.approvedBy, approvedAt: updated.approvedAt } : prev);
      setActionMessage({ type: "success", text: `Scope ${action === "approve" ? "approved" : "rejected"} successfully.` });
    } catch (err) {
      setActionMessage({ type: "error", text: err instanceof Error ? err.message : "Action failed" });
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-gray-500">Loading scope...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Link href="/briefs" className="text-blue-600 hover:text-blue-800 text-sm">&larr; Back to Briefs</Link>
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  if (!scope) {
    return (
      <div className="space-y-6">
        <Link href="/briefs" className="text-blue-600 hover:text-blue-800 text-sm">&larr; Back to Briefs</Link>
        <div className="bg-white shadow rounded-lg p-8 text-center">
          <div className="text-gray-400 text-4xl mb-4">&#9203;</div>
          <h2 className="text-lg font-medium text-gray-900 mb-2">Scope Not Ready</h2>
          <p className="text-gray-500">
            {briefStatus === "scoping"
              ? "The scoper agent is working on this brief. This page will auto-refresh."
              : "No scope has been generated for this brief yet."}
          </p>
          {briefStatus === "scoping" && (
            <span className="text-xs text-blue-600 animate-pulse mt-4 inline-block">Auto-refreshing...</span>
          )}
        </div>
      </div>
    );
  }

  const sd = scope.scopeData;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link href="/briefs" className="text-blue-600 hover:text-blue-800 text-sm">&larr; Back to Briefs</Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">{sd.projectName || scope.brief.title}</h1>
          <div className="flex items-center space-x-3 mt-1">
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
              scope.status === "approved" ? "bg-emerald-100 text-emerald-800" :
              scope.status === "rejected" ? "bg-red-100 text-red-800" :
              "bg-blue-100 text-blue-800"
            }`}>
              {scope.status}
            </span>
            {scope.riskLevel && (
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${RISK_COLORS[scope.riskLevel] || "bg-gray-100 text-gray-700"}`}>
                Risk: {scope.riskLevel}
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        {scope.status === "draft" && (
          <div className="flex items-center space-x-3">
            <button
              onClick={() => handleAction("reject")}
              disabled={actionLoading}
              className="py-2 px-4 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
            >
              Reject Scope
            </button>
            <button
              onClick={() => handleAction("approve")}
              disabled={actionLoading}
              className="py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
            >
              Approve Scope
            </button>
          </div>
        )}
      </div>

      {actionMessage && (
        <div className={`p-3 rounded-md text-sm ${actionMessage.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {actionMessage.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Panel: Scope Data */}
        <div className="space-y-6">
          {/* Summary */}
          {sd.summary && (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">Summary</h3>
              <p className="text-gray-700">{sd.summary}</p>
            </div>
          )}

          {/* Estimates */}
          {(scope.estimatedTasks || scope.estimatedDuration || sd.estimates) && (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Estimates</h3>
              <div className="grid grid-cols-2 gap-4">
                {(scope.estimatedTasks ?? sd.estimates?.totalTasks) && (
                  <div>
                    <span className="text-xs text-gray-500">Total Tasks</span>
                    <p className="text-lg font-semibold text-gray-900">{scope.estimatedTasks ?? sd.estimates?.totalTasks}</p>
                  </div>
                )}
                {(scope.estimatedDuration ?? sd.estimates?.durationRange) && (
                  <div>
                    <span className="text-xs text-gray-500">Duration</span>
                    <p className="text-lg font-semibold text-gray-900">{scope.estimatedDuration ?? sd.estimates?.durationRange}</p>
                  </div>
                )}
                {sd.estimates?.confidence && (
                  <div>
                    <span className="text-xs text-gray-500">Confidence</span>
                    <p className="text-lg font-semibold text-gray-900">{sd.estimates.confidence}</p>
                  </div>
                )}
                {sd.estimates?.riskLevel && (
                  <div>
                    <span className="text-xs text-gray-500">Risk Level</span>
                    <p className={`text-lg font-semibold ${RISK_COLORS[sd.estimates.riskLevel]?.split(" ")[0] || "text-gray-900"}`}>
                      {sd.estimates.riskLevel}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Requirements */}
          {sd.requirements && sd.requirements.length > 0 && (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
                Requirements ({sd.requirements.length})
              </h3>
              <div className="space-y-3">
                {sd.requirements.map((req, i) => (
                  <div key={req.id || i} className="border-l-2 border-blue-200 pl-3 py-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-xs font-mono text-gray-400">{req.id || `R${i + 1}`}</span>
                      {req.category && (
                        <span className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">{req.category}</span>
                      )}
                      {req.complexity && (
                        <span className={`text-xs font-medium ${COMPLEXITY_COLORS[req.complexity] || "text-gray-600"}`}>
                          {req.complexity}
                        </span>
                      )}
                      {req.estimatedTasks !== undefined && (
                        <span className="text-xs text-gray-400">{req.estimatedTasks} tasks</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700">{req.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Agents Required */}
          {sd.agentsRequired && sd.agentsRequired.length > 0 && (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Agents Required</h3>
              <div className="flex flex-wrap gap-2">
                {sd.agentsRequired.map((agent) => (
                  <span key={agent} className="px-3 py-1 bg-indigo-100 text-indigo-800 text-sm rounded-full font-medium">
                    {agent}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Gaps / Questions */}
          {sd.gaps && sd.gaps.length > 0 && (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
                Gaps & Questions ({sd.gaps.length})
              </h3>
              <div className="space-y-2">
                {sd.gaps.map((gap, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-md text-sm ${
                      gap.blocking
                        ? "bg-red-50 border border-red-200 text-red-800"
                        : "bg-yellow-50 border border-yellow-200 text-yellow-800"
                    }`}
                  >
                    <div className="flex items-center space-x-2 mb-1">
                      {gap.blocking && <span className="text-xs font-bold uppercase">Blocking</span>}
                      {gap.severity && <span className="text-xs opacity-75">{gap.severity}</span>}
                    </div>
                    <p>{gap.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Out of Scope */}
          {sd.outOfScope && sd.outOfScope.length > 0 && (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Out of Scope</h3>
              <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                {sd.outOfScope.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Milestones */}
          {sd.milestones && sd.milestones.length > 0 && (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Milestones</h3>
              <div className="space-y-3">
                {sd.milestones.map((ms, i) => (
                  <div key={i} className="border-l-2 border-green-200 pl-3 py-1">
                    <p className="text-sm font-medium text-gray-900">{ms.name}</p>
                    {ms.description && <p className="text-sm text-gray-600">{ms.description}</p>}
                    {ms.targetDate && <p className="text-xs text-gray-400 mt-1">Target: {ms.targetDate}</p>}
                    {ms.deliverables && ms.deliverables.length > 0 && (
                      <ul className="mt-1 list-disc list-inside text-xs text-gray-500">
                        {ms.deliverables.map((d, j) => <li key={j}>{d}</li>)}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Panel: Client Document */}
        <div>
          <div className="bg-white shadow rounded-lg p-6 sticky top-6">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Client Document</h3>
            {scope.clientDocument ? (
              <MarkdownRenderer content={scope.clientDocument} />
            ) : (
              <p className="text-gray-400 text-sm">No client document generated.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
