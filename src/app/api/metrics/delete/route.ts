import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks, costTracking } from "@soloenterprise/db/schema";
import { eq, inArray } from "drizzle-orm";

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

    // Clear tokenMetrics from tasks
    let clearedCount = 0;
    for (const taskId of taskIds) {
      const result = await db
        .update(tasks)
        .set({ tokenMetrics: null })
        .where(eq(tasks.id, taskId))
        .returning({ id: tasks.id });
      clearedCount += result.length;
    }

    // Delete related cost_tracking rows
    let costDeleted = 0;
    try {
      const costResult = await db
        .delete(costTracking)
        .where(inArray(costTracking.taskId, taskIds))
        .returning({ id: costTracking.id });
      costDeleted = costResult.length;
    } catch {
      // cost_tracking may not have rows for all tasks
    }

    return NextResponse.json({
      cleared: clearedCount,
      costTrackingDeleted: costDeleted,
    });
  } catch (error) {
    console.error("Failed to delete metrics:", error);
    return NextResponse.json(
      { error: "Failed to delete metrics" },
      { status: 500 }
    );
  }
}
