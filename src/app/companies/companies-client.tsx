"use client";

import { useState } from "react";
import { CompanyTable } from "@/components/CompanyTable";
import { CreateCompanyModal } from "@/components/CreateCompanyModal";
import { Plus } from "lucide-react";

interface Company {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  whatsappContact: string | null;
  projectCount: number;
  createdAt: string | null;
}

interface CompaniesClientProps {
  companies: Company[];
}

export function CompaniesClient({ companies }: CompaniesClientProps) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Companies</h1>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          New Company
        </button>
      </div>

      <CompanyTable companies={companies} />

      <CreateCompanyModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
