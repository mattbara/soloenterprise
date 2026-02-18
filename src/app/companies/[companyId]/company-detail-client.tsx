"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { ProjectTable } from "@/components/ProjectTable";

interface CompanyDetailClientProps {
  company: {
    id: string;
    name: string;
    contactName: string | null;
    contactEmail: string | null;
    whatsappContact: string | null;
    notes: string | null;
  };
  projects: any[];
}

export function CompanyDetailClient({ company, projects }: CompanyDetailClientProps) {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/companies"
          className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{company.name}</h1>
          <div className="mt-1 flex flex-wrap gap-4 text-sm text-gray-500">
            {company.contactName && <span>{company.contactName}</span>}
            {company.contactEmail && <span>{company.contactEmail}</span>}
            {company.whatsappContact && <span>{company.whatsappContact}</span>}
          </div>
        </div>
        <Link
          href={`/companies/${company.id}/projects/new`}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          New Project
        </Link>
      </div>

      {company.notes && (
        <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
          {company.notes}
        </div>
      )}

      <ProjectTable
        projects={projects}
        companyId={company.id}
        onRefresh={() => router.refresh()}
      />
    </div>
  );
}
