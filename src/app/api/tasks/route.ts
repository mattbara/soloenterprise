import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks } from "@soloenterprise/db/schema";
import { desc } from "drizzle-orm";

/**
 * GET /api/tasks
 * Returns recent tasks with their project info.
 * Query params:
 *   - limit: number of tasks to return (default 10)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    const recentTasks = await db.query.tasks.findMany({
      limit: Math.min(limit, 50), // Cap at 50
      orderBy: [desc(tasks.createdAt)],
      with: {
        project: true,
      },
    });

    return NextResponse.json(recentTasks);
  } catch (error) {
    console.error("Failed to fetch tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}
