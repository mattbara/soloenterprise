import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { questions, tasks } from "@soloenterprise/db/schema";
import { eq } from "drizzle-orm";
import { enqueueTask } from "@soloenterprise/core/queue";

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

    // 1. Get the question with its associated task
    const question = await db.query.questions.findFirst({
      where: eq(questions.id, id),
      with: {
        task: true,
      },
    });

    if (!question) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    // 2. Update the question with the answer
    const [updatedQuestion] = await db
      .update(questions)
      .set({
        answer,
        status: "answered",
        answeredAt: new Date(),
      })
      .where(eq(questions.id, id))
      .returning();

    // 3. If this question has an associated task in waiting_human status, re-queue it
    let taskRequeued = false;
    if (question.task && question.task.status === "waiting_human") {
      const task = question.task;

      // Add the Q&A to the task context for the next processing attempt
      const existingContext = (task.context as Record<string, unknown>) ?? {};
      const answeredQuestions = (existingContext.answeredQuestions as Array<{ question: string; answer: string }>) ?? [];

      answeredQuestions.push({
        question: question.question,
        answer: answer,
      });

      // Update task context with the Q&A (don't set status yet - enqueueTask will set it to 'queued')
      await db
        .update(tasks)
        .set({
          context: {
            ...existingContext,
            answeredQuestions,
          },
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, task.id));

      // Re-queue the task to the appropriate agent queue
      console.log(`[Questions API] Attempting to re-queue task ${task.id} to ${task.agentType} queue...`);
      console.log(`[Questions API] REDIS_URL present: ${!!process.env.REDIS_URL}`);

      try {
        const job = await enqueueTask(
          task.id,
          task.agentType as "backend" | "frontend" | "qa" | "orchestrator" | "devops" | "feedback",
          task.priority as "critical" | "high" | "medium" | "low"
        );
        taskRequeued = true;
        console.log(`[Questions API] SUCCESS - Task ${task.id} re-queued to ${task.agentType} queue, job ID: ${job.id}`);
      } catch (queueError) {
        console.error(`[Questions API] FAILED to re-queue task ${task.id}:`, queueError);
        console.error(`[Questions API] Error details:`, String(queueError));
        // Set status to pending so it can be manually retried
        await db
          .update(tasks)
          .set({
            status: "pending",
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, task.id));
        console.log(`[Questions API] Task ${task.id} set to pending status for manual retry`);
      }
    }

    return NextResponse.json({
      ...updatedQuestion,
      taskRequeued,
    });
  } catch (error) {
    console.error("Failed to answer question:", error);
    return NextResponse.json({ error: "Failed to answer question" }, { status: 500 });
  }
}
