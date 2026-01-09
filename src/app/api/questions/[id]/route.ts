import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { questions } from "@soloenterprise/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const question = await db.query.questions.findFirst({
      where: eq(questions.id, id),
      with: {
        task: true,
      },
    });

    if (!question) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    return NextResponse.json(question);
  } catch (error) {
    console.error("Failed to fetch question:", error);
    return NextResponse.json({ error: "Failed to fetch question" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { answer } = body;

    if (!answer) {
      return NextResponse.json({ error: "Answer is required" }, { status: 400 });
    }

    const [updated] = await db
      .update(questions)
      .set({
        answer,
        status: "answered",
        answeredAt: new Date(),
      })
      .where(eq(questions.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to answer question:", error);
    return NextResponse.json({ error: "Failed to answer question" }, { status: 500 });
  }
}
