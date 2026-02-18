import { db } from "@/lib/db";
import { projects, projectScopes, projectBriefs } from "@soloenterprise/db/schema";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ScopeReviewClient } from "./scope-review-client";

export const dynamic = "force-dynamic";

export default async function ScopeReviewPage({
  params,
}: {
  params: Promise<{ companyId: string; projectId: string }>;
}) {
  const { companyId, projectId } = await params;

  const project = await db.query.projects.findFirst({
    where: and(
      eq(projects.id, projectId),
      eq(projects.clientId, companyId)
    ),
    with: {
      scope: true,
    },
  });

  if (!project) return notFound();

  // 1. Try direct scope link (set after approval)
  let scope = project.scope;

  // 2. Look up via brief chain: project name + clientId → brief → scope
  if (!scope) {
    const brief = await db.query.projectBriefs.findFirst({
      where: and(
        eq(projectBriefs.clientId, companyId),
        eq(projectBriefs.title, project.name)
      ),
      with: {
        scope: true,
      },
    });
    scope = brief?.scope ?? null;
  }

  if (!scope) {
    return (
      <div className="space-y-6">
        <div className="bg-white shadow rounded-lg p-8 text-center">
          <div className="text-gray-400 text-4xl mb-4">&#9203;</div>
          <h2 className="text-lg font-medium text-gray-900 mb-2">Scope Not Ready</h2>
          <p className="text-gray-500">
            The scoper agent is still working. Check back soon.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ScopeReviewClient
      scopeId={scope.id}
      scopeData={scope.scopeData as any}
      clientDocument={scope.clientDocument}
      estimatedTasks={scope.estimatedTasks}
      estimatedDuration={scope.estimatedDuration}
      riskLevel={scope.riskLevel}
      status={scope.status}
      companyId={companyId}
      projectName={project.name}
    />
  );
}
