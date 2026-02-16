import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientReports } from "@soloenterprise/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_TYPES = ["weekly", "milestone", "summary"];
const VALID_STATUSES = ["draft", "reviewed", "sent"];

/**
 * GET /api/reports/{projectId} — List reports for a project
 *
 * Query params:
 *   type   — filter by report type
 *   status — filter by status
 *   limit  — max results (default 20, max 100)
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
    const statusFilter = searchParams.get("status");
    const limitParam = searchParams.get("limit");

    // Validate optional filters
    if (typeFilter && !VALID_TYPES.includes(typeFilter)) {
      return NextResponse.json(
        { error: `type must be one of: ${VALID_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    if (statusFilter && !VALID_STATUSES.includes(statusFilter)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    let limit = 20;
    if (limitParam) {
      const parsed = parseInt(limitParam, 10);
      if (isNaN(parsed) || parsed < 1) {
        return NextResponse.json(
          { error: "limit must be a positive integer" },
          { status: 400 }
        );
      }
      limit = Math.min(parsed, 100);
    }

    // Build conditions
    const conditions = [eq(clientReports.projectId, projectId)];

    if (typeFilter) {
      conditions.push(eq(clientReports.reportType, typeFilter));
    }
    if (statusFilter) {
      conditions.push(eq(clientReports.status, statusFilter));
    }

    // Query reports
    const reports = await db
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
      .limit(limit);

    // Get total count (without limit)
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(clientReports)
      .where(and(...conditions));

    return NextResponse.json({
      reports,
      total: countResult.count,
    });
  } catch (error) {
    console.error("Failed to fetch reports:", error);
    return NextResponse.json(
      { error: "Failed to fetch reports" },
      { status: 500 }
    );
  }
}
