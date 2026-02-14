import { NextResponse } from "next/server";
import {
  getWorkerStatus,
  requestWorkerStop,
  type WorkerType,
} from "@soloenterprise/core/services";

const VALID_WORKER_TYPES: WorkerType[] = [
  "backend",
  "echo",
  "orchestrator",
  "frontend",
  "qa",
  "devops",
  "feedback",
  "scoper",
];

interface RouteParams {
  params: Promise<{ type: string }>;
}

/**
 * GET /api/workers/[type]
 * Returns status of a specific worker type.
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { type } = await params;

    if (!VALID_WORKER_TYPES.includes(type as WorkerType)) {
      return NextResponse.json(
        { error: `Invalid worker type: ${type}` },
        { status: 400 }
      );
    }

    const status = await getWorkerStatus(type as WorkerType);
    return NextResponse.json(status);
  } catch (error) {
    console.error("Failed to get worker status:", error);
    return NextResponse.json(
      { error: "Failed to get worker status" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/workers/[type]
 * Requests a worker to stop gracefully.
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { type } = await params;

    if (!VALID_WORKER_TYPES.includes(type as WorkerType)) {
      return NextResponse.json(
        { error: `Invalid worker type: ${type}` },
        { status: 400 }
      );
    }

    // Check if worker is running
    const status = await getWorkerStatus(type as WorkerType);
    if (status.status !== "running") {
      return NextResponse.json(
        { error: `Worker ${type} is not running` },
        { status: 400 }
      );
    }

    // Request worker to stop
    await requestWorkerStop(type as WorkerType);

    // Return full status object so client doesn't need to re-fetch
    return NextResponse.json({
      type,
      status: "stopped",
      pid: null,
      lastHeartbeat: null,
      lastTaskTime: null,
      startedAt: null,
    });
  } catch (error) {
    console.error("Failed to stop worker:", error);
    return NextResponse.json(
      { error: "Failed to stop worker" },
      { status: 500 }
    );
  }
}
