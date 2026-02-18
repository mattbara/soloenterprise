"use client";

import { useState } from "react";
import { ProjectListTable } from "./ProjectListTable";
import { OverviewStats } from "./OverviewStats";
import { RecentTasks } from "./RecentTasks";
import type { ProjectWithProgress, SerializedTask } from "@/lib/types/dashboard";

interface Stats {
  projects: number;
  pendingTasks: number;
  runningTasks: number;
  waitingHuman: number;
  pendingQuestions: number;
  activeLocks: number;
}

interface DashboardContentProps {
  projects: ProjectWithProgress[];
  stats: Stats;
}

export function DashboardContent({ projects, stats }: DashboardContentProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProjectName, setSelectedProjectName] = useState<string | null>(null);
  const [projectTasks, setProjectTasks] = useState<SerializedTask[]>([]);
  const [loading, setLoading] = useState(false);

  const handleProjectSelect = async (projectId: string, projectName: string) => {
    if (selectedProjectId === projectId) {
      setSelectedProjectId(null);
      setSelectedProjectName(null);
      setProjectTasks([]);
      return;
    }

    setSelectedProjectId(projectId);
    setSelectedProjectName(projectName);
    setLoading(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/tasks`);
      if (response.ok) {
        const data = await response.json();
        setProjectTasks(data.tasks);
      } else {
        setProjectTasks([]);
      }
    } catch {
      setProjectTasks([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Projects + Overview side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <ProjectListTable
            projects={projects}
            selectedProjectId={selectedProjectId}
            onProjectSelect={handleProjectSelect}
          />
        </div>
        <div className="lg:col-span-2">
          <OverviewStats stats={stats} />
        </div>
      </div>

      {/* Project tasks */}
      {selectedProjectId ? (
        loading ? (
          <div className="bg-white shadow rounded-lg px-4 py-8 text-center text-gray-500">
            Loading tasks...
          </div>
        ) : (
          <RecentTasks tasks={projectTasks} projectName={selectedProjectName ?? undefined} />
        )
      ) : (
        <div className="bg-white shadow rounded-lg px-4 py-8 text-center text-gray-400">
          Select a project above to view its tasks
        </div>
      )}
    </>
  );
}
