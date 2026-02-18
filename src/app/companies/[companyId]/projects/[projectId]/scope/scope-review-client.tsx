"use client";

import { useRouter } from "next/navigation";
import { FullPageOverlay } from "@/components/FullPageOverlay";
import { ScopeReviewPanel } from "@/components/ScopeReviewPanel";

interface ScopeReviewClientProps {
  scopeId: string;
  scopeData: any;
  clientDocument: string | null;
  estimatedTasks: number | null;
  estimatedDuration: string | null;
  riskLevel: string | null;
  status: string;
  companyId: string;
  projectName: string;
}

export function ScopeReviewClient({
  scopeId,
  scopeData,
  clientDocument,
  estimatedTasks,
  estimatedDuration,
  riskLevel,
  status,
  companyId,
  projectName,
}: ScopeReviewClientProps) {
  const router = useRouter();

  return (
    <FullPageOverlay onClose={() => router.push(`/companies/${companyId}`)}>
      <ScopeReviewPanel
        scopeId={scopeId}
        scopeData={scopeData}
        clientDocument={clientDocument}
        estimatedTasks={estimatedTasks}
        estimatedDuration={estimatedDuration}
        riskLevel={riskLevel}
        status={status}
        companyId={companyId}
        projectName={projectName}
      />
    </FullPageOverlay>
  );
}
