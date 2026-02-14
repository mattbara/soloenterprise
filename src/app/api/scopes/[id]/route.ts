import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projectScopes } from "@soloenterprise/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/scopes/:id — Get a scope by ID
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const scope = await db.query.projectScopes.findFirst({
      where: eq(projectScopes.id, id),
      with: {
        brief: true,
        project: true,
      },
    });

    if (!scope) {
      return NextResponse.json(
        { error: "Scope not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(scope);
  } catch (error) {
    console.error("Failed to fetch scope:", error);
    return NextResponse.json(
      { error: "Failed to fetch scope" },
      { status: 500 }
    );
  }
}
