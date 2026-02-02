import { db } from "@/lib/db";
import { questions, tasks } from "@soloenterprise/db/schema";
import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { MarkdownRenderer, PriorityBadge } from "@/components";
import { enqueueTask } from "@soloenterprise/core/queue";

export const dynamic = "force-dynamic";

async function answerQuestion(formData: FormData) {
  "use server";

  console.log("[QuestionAnswer] Server action invoked");

  const questionId = formData.get("questionId") as string;
  const answer = formData.get("answer") as string;

  console.log(`[QuestionAnswer] Received: questionId=${questionId}, answer=${answer?.substring(0, 50)}...`);

  if (!questionId || !answer) {
    console.log("[QuestionAnswer] Missing questionId or answer, returning early");
    return;
  }

  // Get the question to find its task
  const question = await db.query.questions.findFirst({
    where: eq(questions.id, questionId),
  });

  if (!question) {
    console.log(`[QuestionAnswer] Question ${questionId} not found`);
    return;
  }

  console.log(`[QuestionAnswer] Found question, taskId=${question.taskId}`);

  // Check if user wants to cancel the task
  const isCancelled = answer.toLowerCase().trim() === "cancelled";

  // Update the question
  await db
    .update(questions)
    .set({
      answer,
      status: "answered",
      answeredAt: new Date(),
    })
    .where(eq(questions.id, questionId));

  // Update the task status based on the answer
  if (question.taskId) {
    if (isCancelled) {
      // Cancel the task
      await db
        .update(tasks)
        .set({
          status: "cancelled",
          updatedAt: new Date(),
          completedAt: new Date(),
        })
        .where(eq(tasks.id, question.taskId));

      console.log(`[QuestionAnswer] Task ${question.taskId} cancelled by user`);
    } else {
      // Get the task to update context with the Q&A
      const task = await db.query.tasks.findFirst({
        where: eq(tasks.id, question.taskId),
      });

      console.log(`[QuestionAnswer] Task found: id=${task?.id}, status=${task?.status}, agentType=${task?.agentType}`);

      if (task && (task.status === "waiting_human" || task.status === "pending")) {
        // Add the Q&A to the task context for the next processing attempt
        const existingContext = (task.context as Record<string, unknown>) ?? {};
        const answeredQuestions = (existingContext.answeredQuestions as Array<{ question: string; answer: string }>) ?? [];

        answeredQuestions.push({
          question: question.question,
          answer: answer,
        });

        // Update task context with the Q&A history
        await db
          .update(tasks)
          .set({
            context: {
              ...existingContext,
              answeredQuestions,
            },
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, question.taskId));

        // Re-queue the task to the appropriate agent queue
        console.log(`[QuestionAnswer] Attempting to re-queue task ${task.id} to ${task.agentType} queue...`);
        console.log(`[QuestionAnswer] REDIS_URL present: ${!!process.env.REDIS_URL}`);

        try {
          const job = await enqueueTask(
            task.id,
            task.agentType as "backend" | "frontend" | "qa" | "orchestrator" | "devops" | "feedback",
            task.priority as "critical" | "high" | "medium" | "low"
          );
          console.log(`[QuestionAnswer] SUCCESS - Task ${task.id} re-queued to ${task.agentType} queue, job ID: ${job.id}`);
        } catch (queueError) {
          console.error(`[QuestionAnswer] FAILED to re-queue task ${task.id}:`, queueError);
          console.error(`[QuestionAnswer] Error details:`, String(queueError));
          // Still update status to pending even if queue fails, so it can be manually retried
          await db
            .update(tasks)
            .set({
              status: "pending",
              updatedAt: new Date(),
            })
            .where(eq(tasks.id, question.taskId));
          console.log(`[QuestionAnswer] Task ${task.id} set to pending status for manual retry`);
        }
      } else if (task) {
        console.log(`[QuestionAnswer] Task ${task.id} is in status '${task.status}', not re-queuing`);
      } else {
        console.log(`[QuestionAnswer] Task not found for taskId ${question.taskId}`);
      }
    }
  } else {
    console.log(`[QuestionAnswer] No taskId associated with question ${questionId}`);
  }

  revalidatePath("/questions");
  revalidatePath("/"); // Also refresh dashboard
}

export default async function QuestionsPage() {
  const pendingQuestions = await db.query.questions.findMany({
    where: eq(questions.status, "pending"),
    orderBy: [desc(questions.createdAt)],
    with: {
      task: true,
    },
  });

  const answeredQuestions = await db.query.questions.findMany({
    where: eq(questions.status, "answered"),
    orderBy: [desc(questions.answeredAt)],
    limit: 20,
    with: {
      task: true,
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Questions</h1>

      {/* Pending Questions */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:px-6 border-b bg-yellow-50">
          <h2 className="text-lg font-medium text-gray-900">
            Pending Questions ({pendingQuestions.length})
          </h2>
          <p className="text-sm text-gray-500">These questions are blocking agent progress</p>
        </div>
        <div className="divide-y divide-gray-200">
          {pendingQuestions.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="mt-2">No pending questions. Agents are working autonomously!</p>
            </div>
          ) : (
            pendingQuestions.map((question) => (
              <div key={question.id} className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      {question.task?.id && (
                        <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-600">
                          Task: {question.task.id.slice(0, 8)}
                        </span>
                      )}
                      <PriorityBadge priority={question.priority} />
                      <span className="text-xs text-gray-500">
                        {question.task?.agentType || "Unknown agent"}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(question.createdAt!).toLocaleString()}
                      </span>
                    </div>
                    <div className="mb-2">
                      <MarkdownRenderer content={question.question} />
                    </div>
                    {question.context && (
                      <div className="text-sm mb-4 bg-gray-50 p-3 rounded">
                        <MarkdownRenderer content={question.context} className="text-gray-600" />
                      </div>
                    )}

                    <form action={answerQuestion} className="mt-4">
                      <input type="hidden" name="questionId" value={question.id} />

                      {question.suggestedAnswers && question.suggestedAnswers.length > 0 ? (
                        <div className="space-y-2 mb-4">
                          <p className="text-sm font-medium text-gray-700">Suggested answers:</p>
                          {question.suggestedAnswers.map((suggestion, idx) => (
                            <label key={idx} className="flex items-center space-x-2">
                              <input
                                type="radio"
                                name="answer"
                                value={suggestion}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-sm text-gray-700">{suggestion}</span>
                            </label>
                          ))}
                          <label className="flex items-center space-x-2">
                            <input
                              type="radio"
                              name="answerType"
                              value="custom"
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">Custom answer:</span>
                          </label>
                        </div>
                      ) : null}

                      <div className="flex space-x-2">
                        <input
                          type="text"
                          name="answer"
                          placeholder="Type your answer... (or 'cancelled' to cancel task)"
                          className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                        />
                        <button
                          type="submit"
                          className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                          Answer
                        </button>
                      </div>
                      <p className="mt-1 text-xs text-gray-400">
                        Tip: Type &quot;cancelled&quot; to cancel this task
                      </p>
                    </form>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Answered Questions */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:px-6 border-b">
          <h2 className="text-lg font-medium text-gray-900">Recently Answered</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {answeredQuestions.length === 0 ? (
            <div className="px-6 py-4 text-center text-gray-500">
              No answered questions yet
            </div>
          ) : (
            answeredQuestions.map((question) => (
              <div key={question.id} className="px-6 py-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    {question.task?.id && (
                      <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-600 mr-2">
                        Task: {question.task.id.slice(0, 8)}
                      </span>
                    )}
                    <div className="text-sm font-medium text-gray-900 mt-1">
                      <MarkdownRenderer content={question.question} />
                    </div>
                    <p className="text-sm text-green-600 mt-1">
                      ✓ {question.answer}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400 ml-4 flex-shrink-0">
                    {question.answeredAt ? new Date(question.answeredAt).toLocaleString() : "—"}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
