import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projectBriefs, projects, clients } from "@soloenterprise/db/schema";
import { eq } from "drizzle-orm";

/**
 * POST /api/companies/:companyId/projects — Create project + brief + scoper task
 *
 * Body: { projectName: string, briefQuestions: { fieldKey: string, question: string, answer: string }[] }
 *
 * Adapts the existing POST /api/briefs logic for the company-scoped pipeline.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const { companyId } = await params;
    const body = await request.json();
    const { projectName, briefQuestions } = body;

    // Validate company exists
    const company = await db.query.clients.findFirst({
      where: eq(clients.id, companyId),
    });

    if (!company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    if (!projectName || typeof projectName !== "string" || !projectName.trim()) {
      return NextResponse.json(
        { error: "projectName is required" },
        { status: 400 }
      );
    }

    if (!briefQuestions || !Array.isArray(briefQuestions) || briefQuestions.length === 0) {
      return NextResponse.json(
        { error: "briefQuestions is required and must be a non-empty array" },
        { status: 400 }
      );
    }

    // Concatenate briefQuestions into rawContent for the Scoper agent
    const rawContent = briefQuestions
      .filter((q: { answer?: string }) => q.answer && q.answer.trim())
      .map((q: { question: string; answer: string }) => `**${q.question}**\n${q.answer}`)
      .join("\n\n");

    if (!rawContent.trim()) {
      return NextResponse.json(
        { error: "At least one question must have an answer" },
        { status: 400 }
      );
    }

    // 1. Create the brief record
    const [brief] = await db
      .insert(projectBriefs)
      .values({
        title: projectName.trim(),
        rawContent,
        briefQuestions,
        clientId: companyId,
        status: "received",
      })
      .returning();

    // 2. Create the project linked to the company
    const [project] = await db
      .insert(projects)
      .values({
        name: projectName.trim(),
        description: `Scoping project for brief: ${brief.id}`,
        status: "planning",
        clientId: companyId,
      })
      .returning();

    // 3. Create a scoper task and queue it
    const { createTask } = await import("@soloenterprise/core/services");

    const result = await createTask(project.id, {
      name: `Scope brief: ${projectName.trim()}`,
      description: rawContent,
      agentType: "scoper",
      priority: "medium",
      context: {
        briefId: brief.id,
        briefTitle: projectName.trim(),
        clientId: companyId,
      },
    });

    // Worker startup is now handled automatically by the worker supervisor
    // inside createTask() — only the needed worker type starts on demand.

    return NextResponse.json(
      {
        briefId: brief.id,
        projectId: project.id,
        taskId: result.taskId,
        jobId: result.jobId,
        status: "received",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create project:", error);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}
