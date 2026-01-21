import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks } from "@soloenterprise/db/schema";
import { eq } from "drizzle-orm";
import { removeTaskFromQueue } from "@soloenterprise/core";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check if task exists and is not already completed/cancelled
    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, id),
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    if (task.status === "completed" || task.status === "cancelled") {
      return NextResponse.json(
        { error: `Task is already ${task.status}` },
        { status: 400 }
      );
    }

    // Cancel the task in database first
    const [updated] = await db
      .update(tasks)
      .set({
        status: "cancelled",
        updatedAt: new Date(),
        completedAt: new Date(),
      })
      .where(eq(tasks.id, id))
      .returning();

    // Try to remove from queue (best effort - may fail if not in queue)
    // This prevents the job from being picked up by the worker
    try {
      const agentType = task.agentType as "backend" | "frontend" | "qa" | "devops" | "orchestrator" | "feedback";
      await removeTaskFromQueue(id, agentType);
    } catch (queueError) {
      // Log but don't fail - the worker will skip cancelled tasks anyway
      console.warn(`Could not remove task ${id} from queue:`, queueError);
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to cancel task:", error);
    return NextResponse.json({ error: "Failed to cancel task" }, { status: 500 });
  }
}
