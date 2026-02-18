import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  projects,
  projectBriefs,
  projectScopes,
  costTracking,
} from "@soloenterprise/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * DELETE /api/companies/:companyId/projects/:projectId
 *
 * Deletes a project and ALL related data — zero orphans.
 *
 * Cascade from `projects` FK handles: tasks, questions, artifacts, deployments, file_locks
 * Must manually clean: scopes, briefs, cost_tracking (task FK is SET NULL, not CASCADE)
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ companyId: string; projectId: string }> }
) {
  try {
    const { companyId, projectId } = await params;

    const project = await db.query.projects.findFirst({
      where: and(
        eq(projects.id, projectId),
        eq(projects.clientId, companyId)
      ),
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // 1. Find briefs for THIS project (matched by title + clientId)
    const briefs = await db.query.projectBriefs.findMany({
      where: and(
        eq(projectBriefs.clientId, companyId),
        eq(projectBriefs.title, project.name)
      ),
    });

    // 2. Delete scopes linked to those briefs
    for (const brief of briefs) {
      await db.delete(projectScopes).where(eq(projectScopes.briefId, brief.id));
    }

    // Also delete scopes directly linked to this project (via scopeId or projectId)
    if (project.scopeId) {
      await db.delete(projectScopes).where(eq(projectScopes.id, project.scopeId));
    }
    await db.delete(projectScopes).where(eq(projectScopes.projectId, projectId));

    // 3. Delete the matched briefs
    for (const brief of briefs) {
      await db.delete(projectBriefs).where(eq(projectBriefs.id, brief.id));
    }

    // 4. Delete cost tracking entries for this project
    await db.delete(costTracking).where(eq(costTracking.projectId, projectId));

    // 5. Delete the project (CASCADE handles tasks → questions, artifacts, file_locks, deployments)
    await db.delete(projects).where(eq(projects.id, projectId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete project:", error);
    return NextResponse.json(
      { error: "Failed to delete project" },
      { status: 500 }
    );
  }
}
