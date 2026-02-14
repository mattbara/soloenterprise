import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projectBriefs, projects, tasks } from "@soloenterprise/db/schema";
import { desc } from "drizzle-orm";

/**
 * GET /api/briefs — List all briefs
 */
export async function GET() {
  try {
    const allBriefs = await db.query.projectBriefs.findMany({
      orderBy: [desc(projectBriefs.createdAt)],
      with: {
        client: true,
        scope: true,
      },
    });
    return NextResponse.json(allBriefs);
  } catch (error) {
    console.error("Failed to fetch briefs:", error);
    return NextResponse.json(
      { error: "Failed to fetch briefs" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/briefs — Submit a new brief for scoping
 *
 * Body: { title: string, content: string, clientId?: string }
 *
 * Creates:
 * 1. A project_briefs record (status: 'received')
 * 2. A project (status: 'planning') to hold the scoper task
 * 3. A task (agentType: 'scoper') queued to scoper-tasks
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, content, clientId } = body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json(
        { error: "title is required" },
        { status: 400 }
      );
    }

    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json(
        { error: "content is required" },
        { status: 400 }
      );
    }

    // 1. Create the brief record
    const [brief] = await db
      .insert(projectBriefs)
      .values({
        title: title.trim(),
        rawContent: content.trim(),
        clientId: clientId || null,
        status: "received",
      })
      .returning();

    // 2. Create a project to hold the scoper task
    const [project] = await db
      .insert(projects)
      .values({
        name: `Scope: ${title.trim()}`,
        description: `Scoping project for brief: ${brief.id}`,
        status: "planning",
        clientId: clientId || null,
      })
      .returning();

    // 3. Create a scoper task and queue it
    // We use the task-service pattern: insert task, then add to queue
    const { createTask } = await import("@soloenterprise/core/services");

    const result = await createTask(project.id, {
      name: `Scope brief: ${title.trim()}`,
      description: content.trim(),
      agentType: "scoper",
      priority: "medium",
      context: {
        briefId: brief.id,
        briefTitle: title.trim(),
        clientId: clientId || undefined,
      },
    });

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
    console.error("Failed to submit brief:", error);
    return NextResponse.json(
      { error: "Failed to submit brief" },
      { status: 500 }
    );
  }
}
