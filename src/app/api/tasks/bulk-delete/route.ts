import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks } from "@soloenterprise/db/schema";
import { inArray } from "drizzle-orm";

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

    // Delete tasks
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
