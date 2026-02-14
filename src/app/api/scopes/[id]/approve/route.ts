import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projectScopes } from "@soloenterprise/db/schema";
import { eq } from "drizzle-orm";

/**
 * POST /api/scopes/:id/approve — Approve or reject a scope
 *
 * Body: { action: 'approve' | 'reject', approvedBy?: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action, approvedBy } = body;

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json(
        { error: "action must be 'approve' or 'reject'" },
        { status: 400 }
      );
    }

    if (action === "approve" && (!approvedBy || typeof approvedBy !== "string" || !approvedBy.trim())) {
      return NextResponse.json(
        { error: "approvedBy is required for approval" },
        { status: 400 }
      );
    }

    // Fetch the scope
    const scope = await db.query.projectScopes.findFirst({
      where: eq(projectScopes.id, id),
    });

    if (!scope) {
      return NextResponse.json(
        { error: "Scope not found" },
        { status: 404 }
      );
    }

    if (scope.status === "approved" || scope.status === "rejected") {
      return NextResponse.json(
        { error: `Scope is already ${scope.status}` },
        { status: 409 }
      );
    }

    const newStatus = action === "approve" ? "approved" : "rejected";

    const [updated] = await db
      .update(projectScopes)
      .set({
        status: newStatus,
        ...(action === "approve"
          ? { approvedBy: approvedBy.trim(), approvedAt: new Date() }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(projectScopes.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update scope:", error);
    return NextResponse.json(
      { error: "Failed to update scope" },
      { status: 500 }
    );
  }
}
