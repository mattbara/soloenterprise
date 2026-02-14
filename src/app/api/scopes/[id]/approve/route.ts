import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projectScopes } from "@soloenterprise/db/schema";
import { eq } from "drizzle-orm";

/**
 * POST /api/scopes/:id/approve — Approve a scope
 *
 * Body: { approvedBy: string }
 *
 * Transitions scope status from 'draft' to 'approved'.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { approvedBy } = body;

    if (!approvedBy || typeof approvedBy !== "string" || !approvedBy.trim()) {
      return NextResponse.json(
        { error: "approvedBy is required" },
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

    if (scope.status === "approved") {
      return NextResponse.json(
        { error: "Scope is already approved" },
        { status: 409 }
      );
    }

    // Update scope status to approved
    const [updated] = await db
      .update(projectScopes)
      .set({
        status: "approved",
        approvedBy: approvedBy.trim(),
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(projectScopes.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to approve scope:", error);
    return NextResponse.json(
      { error: "Failed to approve scope" },
      { status: 500 }
    );
  }
}
