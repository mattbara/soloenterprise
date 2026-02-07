import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks } from "@soloenterprise/db/schema";
import { and, inArray, notInArray } from "drizzle-orm";

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

    // Only cancel tasks that are not already completed/cancelled/failed
    const nonCancellableStatuses = ["completed", "cancelled", "failed"] as const;

    // Update tasks to cancelled status (only those that can be cancelled)
    const result = await db
      .update(tasks)
      .set({ status: "cancelled" })
      .where(
        and(
          inArray(tasks.id, taskIds),
          notInArray(tasks.status, [...nonCancellableStatuses])
        )
      )
      .returning({ id: tasks.id });

    return NextResponse.json({
      cancelled: result.length,
      taskIds: result.map((r) => r.id),
    });
  } catch (error) {
    console.error("Failed to bulk cancel tasks:", error);
    return NextResponse.json(
      { error: "Failed to cancel tasks" },
      { status: 500 }
    );
  }
}
