import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks } from "@soloenterprise/db/schema";
import { inArray } from "drizzle-orm";
import { removeTaskJobsFromQueues } from "@soloenterprise/core";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { taskIds } = body;

    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json(
        { error: "taskIds must be a non-empty array" },
        { status: 400 }
      );
    }

    // Look up agent types before deleting so we can clean Redis
    const tasksToDelete = await db.query.tasks.findMany({
      where: inArray(tasks.id, taskIds),
      columns: { id: true, agentType: true },
    });

    // Remove jobs from BullMQ queues (best effort)
    try {
      if (tasksToDelete.length > 0) {
        const removed = await removeTaskJobsFromQueues(
          tasksToDelete.map((t) => ({ taskId: t.id, agentType: t.agentType }))
        );
        if (removed > 0) {
          console.log(`[bulk-delete] Removed ${removed} jobs from queues`);
        }
      }
    } catch (queueError) {
      console.warn("[bulk-delete] Could not clean queues:", queueError);
    }

    // Delete tasks from database
    const result = await db
      .delete(tasks)
      .where(inArray(tasks.id, taskIds))
      .returning({ id: tasks.id });

    return NextResponse.json({
      deleted: result.length,
      taskIds: result.map((r) => r.id),
    });
  } catch (error) {
    console.error("Failed to bulk delete tasks:", error);
    return NextResponse.json(
      { error: "Failed to delete tasks" },
      { status: 500 }
    );
  }
}
