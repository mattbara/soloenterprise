"use client";

import { useRouter } from "next/navigation";
import { ProjectTable } from "@/components/ProjectTable";

interface ProjectsHubClientProps {
  projects: any[];
  companies: { id: string; name: string }[];
}

export function ProjectsHubClient({ projects, companies }: ProjectsHubClientProps) {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
      </div>

      <ProjectTable
        projects={projects}
        showCompanyColumn
        companies={companies}
        onRefresh={() => router.refresh()}
      />
    </div>
  );
}
