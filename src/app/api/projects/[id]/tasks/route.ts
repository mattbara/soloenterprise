import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks } from "@soloenterprise/db/schema";
import { eq, or, isNull, desc, and } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const dbTasks = await db.query.tasks.findMany({
      where: and(
        eq(tasks.projectId, id),
        or(eq(tasks.archived, false), isNull(tasks.archived))
      ),
      limit: 50,
      orderBy: [desc(tasks.createdAt)],
      with: { project: true },
    });

    const serialized = dbTasks.map((task) => ({
      id: task.id,
      name: task.name,
      description: task.description,
      status: task.status,
      agentType: task.agentType,
      attemptCount: task.attemptCount,
      maxAttempts: task.maxAttempts,
      createdAt: task.createdAt.toISOString(),
      processingStartedAt: task.processingStartedAt?.toISOString() ?? null,
      project: task.project ? { id: task.project.id, name: task.project.name } : null,
      warnings: task.warnings ?? null,
      dependsOn: task.dependsOn ?? [],
      context: task.context ?? null,
      imageAttachments: task.imageAttachments ?? null,
      imageRequirements: task.imageRequirements ?? null,
      imageRequirementsTokens: task.imageRequirementsTokens ?? null,
    }));

    return NextResponse.json({ tasks: serialized });
  } catch (error) {
    console.error("Failed to fetch project tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}
