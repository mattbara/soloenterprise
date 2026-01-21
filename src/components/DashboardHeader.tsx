"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./Button";
import { RequirementsModal } from "./RequirementsModal";

interface Project {
  id: string;
  name: string;
}

interface DashboardHeaderProps {
  projects: Project[];
}

export function DashboardHeader({ projects }: DashboardHeaderProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const router = useRouter();

  function handleSuccess() {
    router.refresh();
  }

  return (
    <div className="flex justify-between items-center">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
      <Button onClick={() => setIsModalOpen(true)}>+ New Backend Task</Button>

      <RequirementsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleSuccess}
        projects={projects}
      />
    </div>
  );
}
