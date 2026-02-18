"use client";

import { useRouter } from "next/navigation";
import type { ProjectWithProgress } from "@/lib/types/dashboard";

interface ProjectListTableProps {
  projects: ProjectWithProgress[];
  selectedProjectId: string | null;
  onProjectSelect: (projectId: string, projectName: string) => void;
}

export function ProjectListTable({
  projects,
  selectedProjectId,
  onProjectSelect,
}: ProjectListTableProps) {
  const router = useRouter();

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">Projects</h3>
      </div>
      <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Name
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Company
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase min-w-[180px]">
                  Progress
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {projects.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500">
                    No projects yet
                  </td>
                </tr>
              ) : (
                projects.map((project) => {
                  const isSelected = selectedProjectId === project.id;
                  return (
                    <tr
                      key={project.id}
                      onClick={() => onProjectSelect(project.id, project.name)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-amber-50 hover:bg-amber-100"
                          : "hover:bg-amber-50/60"
                      }`}
                    >
                      <td className="px-4 py-2.5 text-sm font-medium text-gray-900 max-w-[250px] break-words">
                        {project.name}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-gray-500">
                        {project.clientName ?? "\u2014"}
                      </td>
                      <td className="px-4 py-2.5">
                        <ProgressCell project={project} />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/projects/${project.id}`);
                          }}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="View project detail"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
    </div>
  );
}

function ProgressCell({ project }: { project: ProjectWithProgress }) {
  const { progressPercent, failedTasks, runningTasks, totalTasks } = project;

  if (totalTasks === 0) {
    return <span className="text-xs text-gray-400">No tasks</span>;
  }

  let barColor = "bg-gray-300";
  let label = `${progressPercent}%`;
  let icon: React.ReactNode = null;

  if (failedTasks > 0) {
    barColor = "bg-red-500";
    label = `${progressPercent}% (${failedTasks} failed)`;
    icon = (
      <svg className="h-3.5 w-3.5 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
      </svg>
    );
  } else if (progressPercent === 100) {
    barColor = "bg-green-500";
    label = "Complete";
    icon = (
      <svg className="h-3.5 w-3.5 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
    );
  } else if (runningTasks > 0) {
    barColor = "bg-blue-500";
    icon = (
      <svg className="h-3.5 w-3.5 text-blue-500 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${Math.max(progressPercent, 2)}%` }}
        />
      </div>
      {icon}
      <span className="text-xs text-gray-600 whitespace-nowrap min-w-[60px] text-right">
        {label}
      </span>
    </div>
  );
}
