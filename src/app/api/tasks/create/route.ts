import { NextResponse } from "next/server";
import { createTask } from "@soloenterprise/core/services";

type AgentType = "orchestrator" | "backend" | "frontend" | "qa";

const VALID_AGENT_TYPES: AgentType[] = ["orchestrator", "backend", "frontend", "qa"];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, agentType, title, requirements } = body;

    // Validate required fields
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 }
      );
    }

    if (!agentType || !VALID_AGENT_TYPES.includes(agentType)) {
      return NextResponse.json(
        { error: `agentType must be one of: ${VALID_AGENT_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json(
        { error: "title is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    if (!requirements || typeof requirements !== "string" || !requirements.trim()) {
      return NextResponse.json(
        { error: "requirements is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    // Create the task using the core service
    // The createTask function already validates that the project exists
    // and throws an error if not found
    const result = await createTask(projectId, {
      name: title.trim(),
      description: requirements.trim(),
      agentType: agentType as AgentType,
      priority: "medium",
      context: {
        requirements: requirements.trim(),
      },
    });

    return NextResponse.json(
      {
        taskId: result.taskId,
        jobId: result.jobId,
        projectId,
        agentType,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create task:", error);

    // Check for specific error types
    if (error instanceof Error) {
      // Project not found error from createTask
      if (error.message.includes("Project not found")) {
        return NextResponse.json(
          { error: "Project not found" },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    );
  }
}
