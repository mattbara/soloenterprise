import { NextResponse } from "next/server";
import { spawn } from "child_process";
import {
  getAllWorkerStatuses,
  getWorkerStatus,
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
];

/**
 * GET /api/workers
 * Returns status of all workers or a specific worker type.
 * Query params: ?type=backend (optional)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as WorkerType | null;

    if (type) {
      if (!VALID_WORKER_TYPES.includes(type)) {
        return NextResponse.json(
          { error: `Invalid worker type: ${type}` },
          { status: 400 }
        );
      }
      const status = await getWorkerStatus(type);
      return NextResponse.json(status);
    }

    const statuses = await getAllWorkerStatuses();
    return NextResponse.json(statuses);
  } catch (error) {
    console.error("Failed to get worker status:", error);
    return NextResponse.json(
      { error: "Failed to get worker status" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workers
 * Starts a worker of the specified type.
 * Body: { type: "backend" }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type } = body as { type: WorkerType };

    if (!type) {
      return NextResponse.json(
        { error: "type is required" },
        { status: 400 }
      );
    }

    if (!VALID_WORKER_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Invalid worker type: ${type}` },
        { status: 400 }
      );
    }

    // Check if worker is already running
    const status = await getWorkerStatus(type);
    if (status.status === "running") {
      return NextResponse.json(
        { error: `Worker ${type} is already running`, pid: status.pid },
        { status: 409 }
      );
    }

    // Spawn the worker process
    // Use pnpm to run the worker script
    const child = spawn("pnpm", [`worker:${type}`], {
      detached: true,
      stdio: "ignore",
      cwd: process.cwd(),
      env: {
        ...process.env,
        // Pass through env vars that the worker needs
      },
    });

    // Unref to allow parent to exit independently
    child.unref();

    console.log(`[API] Started worker ${type} with PID ${child.pid}`);

    // Return full status object so client doesn't need to re-fetch
    return NextResponse.json(
      {
        type,
        status: "running",
        pid: child.pid,
        lastHeartbeat: null,
        lastTaskTime: null,
        startedAt: Date.now(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to start worker:", error);
    return NextResponse.json(
      { error: "Failed to start worker" },
      { status: 500 }
    );
  }
}
