import { db } from "@/lib/db";
import { questions } from "@soloenterprise/db/schema";
import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { MarkdownRenderer, PriorityBadge } from "@/components";

export const dynamic = "force-dynamic";

async function answerQuestion(formData: FormData) {
  "use server";
  
  const questionId = formData.get("questionId") as string;
  const answer = formData.get("answer") as string;

  if (!questionId || !answer) return;

  await db
    .update(questions)
    .set({
      answer,
      status: "answered",
      answeredAt: new Date(),
    })
    .where(eq(questions.id, questionId));

  revalidatePath("/questions");
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
                          placeholder="Type your answer..."
                          className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
                        />
                        <button
                          type="submit"
                          className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                          Answer
                        </button>
                      </div>
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
                    <div className="text-sm font-medium text-gray-900">
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
