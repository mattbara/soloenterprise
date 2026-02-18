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
 * DELETE /api/projects/:id — Generic project delete (for projects without a company route)
 *
 * Same cleanup logic as the company-scoped delete — zero orphans.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, id),
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // 1. Find briefs for this project (by title + clientId match, or just title if no client)
    let briefs;
    if (project.clientId) {
      briefs = await db.query.projectBriefs.findMany({
        where: and(
          eq(projectBriefs.clientId, project.clientId),
          eq(projectBriefs.title, project.name)
        ),
      });
    } else {
      briefs = await db.query.projectBriefs.findMany({
        where: eq(projectBriefs.title, project.name),
      });
    }

    // 2. Delete scopes linked to those briefs
    for (const brief of briefs) {
      await db.delete(projectScopes).where(eq(projectScopes.briefId, brief.id));
    }

    // Also delete scopes directly linked to this project
    if (project.scopeId) {
      await db.delete(projectScopes).where(eq(projectScopes.id, project.scopeId));
    }
    await db.delete(projectScopes).where(eq(projectScopes.projectId, id));

    // 3. Delete the matched briefs
    for (const brief of briefs) {
      await db.delete(projectBriefs).where(eq(projectBriefs.id, brief.id));
    }

    // 4. Delete cost tracking
    await db.delete(costTracking).where(eq(costTracking.projectId, id));

    // 5. Delete the project (CASCADE handles tasks, questions, artifacts, file_locks, deployments)
    await db.delete(projects).where(eq(projects.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete project:", error);
    return NextResponse.json(
      { error: "Failed to delete project" },
      { status: 500 }
    );
  }
}
