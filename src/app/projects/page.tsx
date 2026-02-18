import { db } from "@/lib/db";
import { projects, clients, projectBriefs, projectScopes } from "@soloenterprise/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { ProjectsHubClient } from "./projects-hub-client";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const allProjects = await db.query.projects.findMany({
    orderBy: [desc(projects.createdAt)],
    with: {
      scope: true,
      client: true,
    },
  });

  const allClients = await db.query.clients.findMany({
    columns: { id: true, name: true },
    orderBy: [desc(clients.createdAt)],
  });

  // For projects without a direct scope link, resolve scope via brief chain:
  // project.clientId → brief.clientId → scope.briefId
  const projectIds = allProjects.map((p) => p.id);
  const clientIds = allProjects
    .filter((p) => !p.scope && p.clientId)
    .map((p) => p.clientId!);

  let briefScopeMap: Record<string, { id: string; status: string }> = {};
  if (clientIds.length > 0) {
    const briefs = await db.query.projectBriefs.findMany({
      where: inArray(projectBriefs.clientId, clientIds),
      with: { scope: true },
    });
    // Map clientId → latest scope (briefs are 1:1 with projects via clientId in the pipeline)
    for (const brief of briefs) {
      if (brief.scope && brief.clientId) {
        briefScopeMap[brief.clientId] = {
          id: brief.scope.id,
          status: brief.scope.status,
        };
      }
    }
  }

  // Enrich projects with brief-resolved scope
  const enriched = allProjects.map((p) => ({
    ...p,
    briefScope: p.scope
      ? { id: p.scope.id, status: p.scope.status }
      : p.clientId && briefScopeMap[p.clientId]
        ? briefScopeMap[p.clientId]
        : null,
  }));

  const serialized = JSON.parse(JSON.stringify(enriched));

  return (
    <ProjectsHubClient
      projects={serialized}
      companies={allClients}
    />
  );
}
