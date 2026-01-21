import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks } from "@soloenterprise/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check if task exists
    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, id),
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    if (task.archived) {
      return NextResponse.json(
        { error: "Task is already archived" },
        { status: 400 }
      );
    }

    // Archive the task
    const [updated] = await db
      .update(tasks)
      .set({
        archived: true,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to archive task:", error);
    return NextResponse.json({ error: "Failed to archive task" }, { status: 500 });
  }
}
