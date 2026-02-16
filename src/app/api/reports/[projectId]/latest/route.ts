import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientReports } from "@soloenterprise/db/schema";
import { eq, desc, and } from "drizzle-orm";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_TYPES = ["weekly", "milestone", "summary"];

/**
 * GET /api/reports/{projectId}/latest — Get the most recent report
 *
 * Query params:
 *   type — filter by report type
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    if (!UUID_REGEX.test(projectId)) {
      return NextResponse.json(
        { error: "projectId must be a valid UUID" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const typeFilter = searchParams.get("type");

    if (typeFilter && !VALID_TYPES.includes(typeFilter)) {
      return NextResponse.json(
        { error: `type must be one of: ${VALID_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const conditions = [eq(clientReports.projectId, projectId)];
    if (typeFilter) {
      conditions.push(eq(clientReports.reportType, typeFilter));
    }

    const [report] = await db
      .select({
        id: clientReports.id,
        reportType: clientReports.reportType,
        reportContent: clientReports.reportContent,
        internalNotes: clientReports.internalNotes,
        period: clientReports.period,
        status: clientReports.status,
        createdAt: clientReports.createdAt,
      })
      .from(clientReports)
      .where(and(...conditions))
      .orderBy(desc(clientReports.createdAt))
      .limit(1);

    if (!report) {
      return NextResponse.json(
        { error: "No reports found for this project" },
        { status: 404 }
      );
    }

    return NextResponse.json(report);
  } catch (error) {
    console.error("Failed to fetch latest report:", error);
    return NextResponse.json(
      { error: "Failed to fetch latest report" },
      { status: 500 }
    );
  }
}
