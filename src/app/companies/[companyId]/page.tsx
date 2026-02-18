import { db } from "@/lib/db";
import { clients, projects, projectScopes, projectBriefs } from "@soloenterprise/db/schema";
import { eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { CompanyDetailClient } from "./company-detail-client";

export const dynamic = "force-dynamic";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;

  const company = await db.query.clients.findFirst({
    where: eq(clients.id, companyId),
  });

  if (!company) return notFound();

  const companyProjects = await db.query.projects.findMany({
    where: eq(projects.clientId, companyId),
    with: {
      scope: true,
      client: true,
    },
    orderBy: (p, { desc }) => [desc(p.createdAt)],
  });

  // Resolve scopes via projectScopes.projectId for projects without direct scope link
  const unscopedProjectIds = companyProjects
    .filter((p) => !p.scope)
    .map((p) => p.id);

  const scopeByProjectId: Record<string, { id: string; status: string }> = {};
  if (unscopedProjectIds.length > 0) {
    // Primary: direct projectId link on scope
    const scopes = await db.query.projectScopes.findMany({
      where: inArray(projectScopes.projectId, unscopedProjectIds),
      columns: { id: true, projectId: true, status: true },
    });
    for (const scope of scopes) {
      if (scope.projectId) {
        scopeByProjectId[scope.projectId] = {
          id: scope.id,
          status: scope.status,
        };
      }
    }

    // Fallback for legacy scopes without projectId: match via brief title → project name
    const stillUnresolved = unscopedProjectIds.filter((id) => !scopeByProjectId[id]);
    if (stillUnresolved.length > 0) {
      const briefs = await db.query.projectBriefs.findMany({
        where: eq(projectBriefs.clientId, companyId),
        with: { scope: true },
      });
      const scopeByTitle: Record<string, { id: string; status: string }> = {};
      for (const brief of briefs) {
        if (brief.scope) {
          scopeByTitle[brief.title] = { id: brief.scope.id, status: brief.scope.status };
        }
      }
      for (const p of companyProjects.filter((p) => stillUnresolved.includes(p.id))) {
        const match = scopeByTitle[p.name];
        if (match) scopeByProjectId[p.id] = match;
      }
    }
  }

  const enriched = companyProjects.map((p) => ({
    ...p,
    briefScope: p.scope
      ? { id: p.scope.id, status: p.scope.status }
      : scopeByProjectId[p.id] || null,
  }));

  const serializedProjects = JSON.parse(JSON.stringify(enriched));

  return (
    <CompanyDetailClient
      company={{
        id: company.id,
        name: company.name,
        contactName: company.contactName,
        contactEmail: company.contactEmail,
        whatsappContact: company.whatsappContact,
        notes: company.notes,
      }}
      projects={serializedProjects}
    />
  );
}
