import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clients, projects, projectBriefs, projectScopes, costTracking } from "@soloenterprise/db/schema";
import { eq, inArray } from "drizzle-orm";

/**
 * GET /api/companies/:companyId — Single company with its projects and brief/scope status
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const { companyId } = await params;

    const company = await db.query.clients.findFirst({
      where: eq(clients.id, companyId),
    });

    if (!company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    const companyProjects = await db.query.projects.findMany({
      where: eq(projects.clientId, companyId),
      with: {
        scope: true,
      },
      orderBy: (p, { desc }) => [desc(p.createdAt)],
    });

    // Fetch brief status for each project — briefs are linked via clientId + project name pattern
    // We need to get briefs that are linked to this company
    const companyBriefs = await db.query.projectBriefs.findMany({
      where: eq(projectBriefs.clientId, companyId),
      with: {
        scope: true,
      },
    });

    return NextResponse.json({
      ...company,
      projects: companyProjects,
      briefs: companyBriefs,
    });
  } catch (error) {
    console.error("Failed to fetch company:", error);
    return NextResponse.json(
      { error: "Failed to fetch company" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/companies/:companyId — Delete company (cascades to projects → tasks → artifacts etc.)
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const { companyId } = await params;

    const company = await db.query.clients.findFirst({
      where: eq(clients.id, companyId),
    });

    if (!company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    // 1. Find all briefs for this company
    const briefs = await db.query.projectBriefs.findMany({
      where: eq(projectBriefs.clientId, companyId),
      columns: { id: true },
    });

    // 2. Delete scopes linked to those briefs
    if (briefs.length > 0) {
      const briefIds = briefs.map((b) => b.id);
      await db.delete(projectScopes).where(inArray(projectScopes.briefId, briefIds));
    }

    // 3. Also delete scopes that reference any of this company's projects
    const companyProjects = await db.query.projects.findMany({
      where: eq(projects.clientId, companyId),
      columns: { id: true, scopeId: true },
    });
    for (const p of companyProjects) {
      if (p.scopeId) {
        await db.delete(projectScopes).where(eq(projectScopes.id, p.scopeId));
      }
      await db.delete(projectScopes).where(eq(projectScopes.projectId, p.id));
    }

    // 4. Delete cost tracking for all company projects
    for (const p of companyProjects) {
      await db.delete(costTracking).where(eq(costTracking.projectId, p.id));
    }

    // 5. Delete all projects (CASCADE handles tasks, artifacts, etc.)
    await db.delete(projects).where(eq(projects.clientId, companyId));

    // 6. Delete all briefs
    await db.delete(projectBriefs).where(eq(projectBriefs.clientId, companyId));

    // 7. Delete the company itself
    await db.delete(clients).where(eq(clients.id, companyId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete company:", error);
    return NextResponse.json(
      { error: "Failed to delete company" },
      { status: 500 }
    );
  }
}
