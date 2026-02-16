import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects } from "@soloenterprise/db/schema";
import { eq } from "drizzle-orm";

const VALID_REPORT_TYPES = ["weekly", "milestone", "summary"] as const;
type ReportType = (typeof VALID_REPORT_TYPES)[number];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/reports — Queue a report generation job
 *
 * Body: { projectId: string, reportType: 'weekly' | 'milestone' | 'summary', period?: string }
 * Returns 202 with jobId on success.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, reportType, period } = body;

    // Validate required fields
    if (!projectId || typeof projectId !== "string") {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 }
      );
    }

    if (!UUID_REGEX.test(projectId)) {
      return NextResponse.json(
        { error: "projectId must be a valid UUID" },
        { status: 400 }
      );
    }

    if (!reportType || typeof reportType !== "string") {
      return NextResponse.json(
        { error: "reportType is required" },
        { status: 400 }
      );
    }

    if (!VALID_REPORT_TYPES.includes(reportType as ReportType)) {
      return NextResponse.json(
        { error: `reportType must be one of: ${VALID_REPORT_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    // Verify project exists
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // Enqueue via createTask (same pattern as briefs/route.ts)
    const { createTask } = await import("@soloenterprise/core/services");

    const result = await createTask(projectId, {
      name: `report-${reportType}-${projectId.slice(0, 8)}`,
      description: `Generate a ${reportType} report for project ${project.name}`,
      agentType: "client-reporter",
      priority: "medium",
      context: {
        reportType,
        period: period || undefined,
      },
    });

    return NextResponse.json(
      {
        jobId: result.jobId,
        message: "Report generation queued",
        projectId,
        reportType,
      },
      { status: 202 }
    );
  } catch (error) {
    console.error("Failed to queue report:", error);
    return NextResponse.json(
      { error: "Failed to queue report generation" },
      { status: 500 }
    );
  }
}
