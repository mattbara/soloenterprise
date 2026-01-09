import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects } from "@soloenterprise/db/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  try {
    const allProjects = await db.query.projects.findMany({
      orderBy: [desc(projects.createdAt)],
    });
    return NextResponse.json(allProjects);
  } catch (error) {
    console.error("Failed to fetch projects:", error);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const [project] = await db
      .insert(projects)
      .values({
        name,
        description,
        status: "planning",
      })
      .returning();

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("Failed to create project:", error);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
