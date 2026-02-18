import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks } from "@soloenterprise/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { removeTaskJobsFromQueues } from "@soloenterprise/core";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { agentType } = body;

    if (!agentType || typeof agentType !== "string") {
      return NextResponse.json(
        { error: "agentType is required" },
        { status: 400 }
      );
    }

    const cancellableStatuses = ["queued", "pending", "blocked"] as const;

    const result = await db
      .update(tasks)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(tasks.projectId, id),
          eq(tasks.agentType, agentType as any),
          inArray(tasks.status, [...cancellableStatuses])
        )
      )
      .returning({ id: tasks.id, agentType: tasks.agentType });

    // Remove from BullMQ queues (best effort)
    try {
      if (result.length > 0) {
        const removed = await removeTaskJobsFromQueues(
          result.map((t) => ({ taskId: t.id, agentType: t.agentType }))
        );
        if (removed > 0) {
          console.log(`[cancel-agent] Removed ${removed} jobs from queues for project ${id}, agent ${agentType}`);
        }
      }
    } catch (queueError) {
      console.warn("[cancel-agent] Could not clean queues:", queueError);
    }

    return NextResponse.json({
      cancelled: result.length,
      taskIds: result.map((r) => r.id),
    });
  } catch (error) {
    console.error("Failed to cancel agent tasks:", error);
    return NextResponse.json(
      { error: "Failed to cancel tasks" },
      { status: 500 }
    );
  }
}
