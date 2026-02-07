import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks } from "@soloenterprise/db/schema";
import { eq } from "drizzle-orm";
import { enqueueTask } from "@soloenterprise/core";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get the task
    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, id),
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Only allow retry of failed, waiting_human, or blocked tasks
    if (!["failed", "waiting_human", "blocked"].includes(task.status)) {
      return NextResponse.json(
        {
          error: `Cannot retry task with status '${task.status}'. Only 'failed', 'waiting_human', or 'blocked' tasks can be retried.`,
        },
        { status: 400 }
      );
    }

    // Track retry in previousAttempts (matches existing schema pattern)
    const existingContext = (task.context as Record<string, unknown>) || {};
    const previousAttempts = (existingContext.previousAttempts as Array<{ attemptNumber: number; error: string; timestamp: string }>) || [];

    // Add a retry marker to previousAttempts
    previousAttempts.push({
      attemptNumber: task.attemptCount + 1,
      error: "Manual retry requested",
      timestamp: new Date().toISOString(),
    });

    // Update task status to pending for retry
    await db
      .update(tasks)
      .set({
        status: "pending",
        updatedAt: new Date(),
        context: {
          ...existingContext,
          previousAttempts,
        },
      })
      .where(eq(tasks.id, id));

    const newAttempts = task.attemptCount + 1;

    // Queue the task
    const agentType = task.agentType as
      | "backend"
      | "frontend"
      | "qa"
      | "devops"
      | "orchestrator"
      | "feedback";
    await enqueueTask(id, agentType, task.priority);

    console.log(`[API /tasks/${id}/retry] Retrying task (attempt ${newAttempts})`);

    return NextResponse.json({
      success: true,
      taskId: id,
      attempt: newAttempts,
      message: `Task queued for retry (attempt ${newAttempts})`,
    });
  } catch (error) {
    console.error("[API /tasks/retry] Error:", error);
    return NextResponse.json(
      { error: "Failed to retry task" },
      { status: 500 }
    );
  }
}
