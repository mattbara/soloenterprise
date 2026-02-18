"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Eye, Activity, RotateCcw } from "lucide-react";

interface Project {
  id: string;
  name: string;
  description: string | null;
  aiDescription: string | null;
  status: string;
  clientId: string | null;
  scopeId: string | null;
  createdAt: string;
  scope?: { id: string; status: string } | null;
  briefScope?: { id: string; status: string } | null;
  client?: { id: string; name: string } | null;
}

interface CompanyOption {
  id: string;
  name: string;
}

interface ProjectTableProps {
  projects: Project[];
  showCompanyColumn?: boolean;
  companies?: CompanyOption[];
  companyId?: string;
  onRefresh?: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  planning: "bg-gray-100 text-gray-800",
  active: "bg-emerald-100 text-emerald-800",
  paused: "bg-yellow-100 text-yellow-800",
  completed: "bg-blue-100 text-blue-800",
  cancelled: "bg-red-100 text-red-800",
};

function getBriefStatus(project: Project): string {
  // Use briefScope (resolved via brief chain) which is always populated by server
  const scope = project.briefScope || project.scope;
  if (scope?.status === "approved") return "approved";
  if (scope?.status === "rejected") return "rejected";
  if (scope?.status === "draft" || scope?.status === "ready") return "scoped";
  // Only show "scoping" if the project is part of the pipeline (has a clientId)
  if (project.status === "planning" && !scope && project.clientId) return "scoping";
  // Projects without a client are old orphans — show their actual project status
  if (!project.clientId) return project.status;
  return "received";
}

const BRIEF_STATUS_COLORS: Record<string, string> = {
  received: "bg-gray-100 text-gray-800",
  scoping: "bg-blue-100 text-blue-800 animate-pulse",
  scoped: "bg-green-100 text-green-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
};

export function ProjectTable({
  projects: initialProjects,
  showCompanyColumn = false,
  companies = [],
  companyId,
  onRefresh,
}: ProjectTableProps) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [companyFilter, setCompanyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [repushingId, setRepushingId] = useState<string | null>(null);

  // Update projects when props change
  useEffect(() => {
    setProjects(initialProjects);
  }, [initialProjects]);

  // No auto-polling — user clicks Refresh to check scoping status (guardrail #6)

  // Client-side filtering
  const filtered = projects.filter((p) => {
    if (companyFilter && p.clientId !== companyFilter) return false;
    if (statusFilter && getBriefStatus(p) !== statusFilter) return false;
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const cId = companyId || deleteTarget.clientId;
      const url = cId
        ? `/api/companies/${cId}/projects/${deleteTarget.id}`
        : `/api/projects/${deleteTarget.id}`;
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setDeleteTarget(null);
      router.refresh();
    } catch {
      // silently fail for now
    } finally {
      setDeleting(false);
    }
  }

  async function handleRepushOrchestrator(project: Project) {
    const scopeRef = project.briefScope || project.scope;
    if (!scopeRef) return;
    setRepushingId(project.id);
    try {
      const res = await fetch(`/api/scopes/${scopeRef.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", approvedBy: "human-repush" }),
      });
      if (!res.ok) {
        const data = await res.json();
        // 409 = already approved, try direct orchestrator creation
        if (res.status === 409) {
          const orchRes = await fetch(`/api/projects/${project.id}/orchestrate`, {
            method: "POST",
          });
          if (!orchRes.ok) {
            const orchData = await orchRes.json();
            throw new Error(orchData.error || "Failed to create orchestrator task");
          }
        } else {
          throw new Error(data.error || "Failed to re-approve scope");
        }
      }
      router.refresh();
    } catch (err) {
      console.error("[RepushOrchestrator]", err);
    } finally {
      setRepushingId(null);
    }
  }

  function handleRowClick(project: Project) {
    const status = getBriefStatus(project);
    if (status === "scoped") {
      const cId = companyId || project.clientId;
      if (cId) {
        router.push(`/companies/${cId}/projects/${project.id}/scope`);
      }
    }
  }

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      {/* Filter bar */}
      {showCompanyColumn && (
        <div className="border-b border-gray-200 px-4 py-3 flex flex-wrap gap-3">
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="">All Companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="">All Statuses</option>
            <option value="received">Received</option>
            <option value="scoping">Scoping</option>
            <option value="scoped">Scoped</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects..."
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm flex-1 min-w-[200px]"
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="px-6 py-8 text-center text-gray-500">
          No projects found.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider max-w-[300px]">Project Name</th>
                {showCompanyColumn && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider max-w-[250px]">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Brief Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filtered.map((project) => {
                const briefStatus = getBriefStatus(project);
                const isClickable = briefStatus === "scoped";

                return (
                  <tr
                    key={project.id}
                    onClick={() => handleRowClick(project)}
                    className={`transition-colors ${isClickable ? "cursor-pointer hover:bg-gray-50" : ""}`}
                  >
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 max-w-[300px] truncate">
                      {project.name}
                    </td>
                    {showCompanyColumn && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {project.client ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/companies/${project.clientId}`);
                            }}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            {project.client.name}
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                    )}
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-[250px] truncate">
                      {project.aiDescription || project.description || "—"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${BRIEF_STATUS_COLORS[briefStatus] || "bg-gray-100 text-gray-800"}`}>
                        {briefStatus}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/projects/${project.id}`);
                          }}
                          className="text-indigo-500 hover:text-indigo-700 p-1"
                          title="View activity"
                        >
                          <Activity className="h-4 w-4" />
                        </button>
                        {(briefStatus === "scoped" || briefStatus === "approved" || briefStatus === "rejected") && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const cId = companyId || project.clientId;
                              if (cId) {
                                router.push(`/companies/${cId}/projects/${project.id}/scope`);
                              }
                            }}
                            className="text-blue-500 hover:text-blue-700 p-1"
                            title="View scope"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        )}
                        {briefStatus === "approved" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRepushOrchestrator(project);
                            }}
                            disabled={repushingId === project.id}
                            className="text-amber-500 hover:text-amber-700 p-1 disabled:opacity-50"
                            title="Re-push to orchestrator"
                          >
                            <RotateCcw className={`h-4 w-4 ${repushingId === project.id ? "animate-spin" : ""}`} />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(project);
                          }}
                          className="text-red-500 hover:text-red-700 p-1"
                          title="Delete project"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setDeleteTarget(null)} />
          <div className="relative z-50 w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Project</h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This will permanently remove the project and all related data.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
