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
  "scoper",
  "client-reporter",
];

// Types that can be passed to the POST endpoint (includes "all")
type StartType = WorkerType | "all";

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
    const { type } = body as { type: StartType };

    if (!type) {
      return NextResponse.json(
        { error: "type is required" },
        { status: 400 }
      );
    }

    if (type !== "all" && !VALID_WORKER_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Invalid worker type: ${type}` },
        { status: 400 }
      );
    }

    if (type === "all") {
      // Start all workers in a single process (same as `pnpm worker` from terminal)
      const child = spawn("pnpm", ["worker"], {
        detached: true,
        stdio: "ignore",
        cwd: process.cwd(),
        env: { ...process.env },
      });
      child.unref();

      console.log(`[API] Started all workers in single process with PID ${child.pid}`);

      const now = Date.now();
      const statuses: Record<string, object> = {};
      for (const wt of VALID_WORKER_TYPES) {
        statuses[wt] = {
          type: wt,
          status: "running",
          pid: child.pid,
          lastHeartbeat: null,
          lastTaskTime: null,
          startedAt: now,
        };
      }

      return NextResponse.json(statuses, { status: 201 });
    }

    // Individual worker start
    const status = await getWorkerStatus(type);
    if (status.status === "running") {
      return NextResponse.json(
        { error: `Worker ${type} is already running`, pid: status.pid },
        { status: 409 }
      );
    }

    const child = spawn("pnpm", [`worker:${type}`], {
      detached: true,
      stdio: "ignore",
      cwd: process.cwd(),
      env: { ...process.env },
    });
    child.unref();

    console.log(`[API] Started worker ${type} with PID ${child.pid}`);

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
