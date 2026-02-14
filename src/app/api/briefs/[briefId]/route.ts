import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projectBriefs } from "@soloenterprise/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/briefs/:briefId — Get a single brief with its scope
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ briefId: string }> }
) {
  try {
    const { briefId } = await params;

    const brief = await db.query.projectBriefs.findFirst({
      where: eq(projectBriefs.id, briefId),
      with: {
        client: true,
        scope: true,
      },
    });

    if (!brief) {
      return NextResponse.json(
        { error: "Brief not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(brief);
  } catch (error) {
    console.error("Failed to fetch brief:", error);
    return NextResponse.json(
      { error: "Failed to fetch brief" },
      { status: 500 }
    );
  }
}
