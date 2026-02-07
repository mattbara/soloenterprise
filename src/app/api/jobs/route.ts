import { NextResponse } from 'next/server';
import { db } from '@soloenterprise/db';
import { tasks } from '@soloenterprise/db/schema';
import { eq, desc } from 'drizzle-orm';

interface TokenMetrics {
  inputTokens?: number;
  outputTokens?: number;
  [key: string]: unknown;
}

interface JobSummary {
  id: string;
  name: string;
  status: string;
  createdAt: Date;
  completedAt: Date | null;
  durationMs: number | null;
  childTasks: {
    total: number;
    completed: number;
    failed: number;
    pending: number;
    running: number;
  };
  tokensByAgent: {
    orchestrator: { input: number; output: number };
    backend: { input: number; output: number };
    frontend: { input: number; output: number };
    qa: { input: number; output: number };
  };
  totalTokens: { input: number; output: number };
  children: Array<{
    id: string;
    name: string;
    agentType: string;
    status: string;
    tokenMetrics: TokenMetrics | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
}

export async function GET() {
  try {
    // Get all orchestrator tasks
    const orchestratorTasks = await db.query.tasks.findMany({
      where: eq(tasks.agentType, 'orchestrator'),
      orderBy: [desc(tasks.createdAt)],
    });

    const jobs: JobSummary[] = [];

    for (const orchTask of orchestratorTasks) {
      // Get child tasks
      const childTasks = await db.query.tasks.findMany({
        where: eq(tasks.parentTaskId, orchTask.id),
      });

      // Count by status
      const childCounts = {
        total: childTasks.length,
        completed: childTasks.filter(t => t.status === 'completed').length,
        failed: childTasks.filter(t => t.status === 'failed').length,
        pending: childTasks.filter(t => t.status === 'pending').length,
        running: childTasks.filter(t => t.status === 'running' || t.status === 'queued').length,
      };

      // Find completion time (latest child updatedAt where status = completed)
      const completedChildren = childTasks.filter(t => t.status === 'completed');
      const lastCompletedAt = completedChildren.length > 0
        ? new Date(Math.max(...completedChildren.map(t => new Date(t.updatedAt).getTime())))
        : null;

      // Calculate duration
      const durationMs = lastCompletedAt && childCounts.pending === 0 && childCounts.running === 0
        ? lastCompletedAt.getTime() - new Date(orchTask.createdAt).getTime()
        : null;

      // Aggregate tokens by agent type
      const tokensByAgent = {
        orchestrator: { input: 0, output: 0 },
        backend: { input: 0, output: 0 },
        frontend: { input: 0, output: 0 },
        qa: { input: 0, output: 0 },
      };

      // Add orchestrator's own metrics
      const orchMetrics = orchTask.tokenMetrics as TokenMetrics | null;
      if (orchMetrics) {
        tokensByAgent.orchestrator.input = orchMetrics.inputTokens ?? 0;
        tokensByAgent.orchestrator.output = orchMetrics.outputTokens ?? 0;
      }

      // Add child task metrics
      for (const child of childTasks) {
        const metrics = child.tokenMetrics as TokenMetrics | null;
        if (metrics && child.agentType in tokensByAgent) {
          const agentKey = child.agentType as keyof typeof tokensByAgent;
          tokensByAgent[agentKey].input += metrics.inputTokens ?? 0;
          tokensByAgent[agentKey].output += metrics.outputTokens ?? 0;
        }
      }

      // Calculate totals
      const totalTokens = {
        input: Object.values(tokensByAgent).reduce((sum, t) => sum + t.input, 0),
        output: Object.values(tokensByAgent).reduce((sum, t) => sum + t.output, 0),
      };

      jobs.push({
        id: orchTask.id,
        name: orchTask.name,
        status: orchTask.status,
        createdAt: orchTask.createdAt,
        completedAt: lastCompletedAt,
        durationMs,
        childTasks: childCounts,
        tokensByAgent,
        totalTokens,
        children: childTasks.map(t => ({
          id: t.id,
          name: t.name,
          agentType: t.agentType,
          status: t.status,
          tokenMetrics: t.tokenMetrics as TokenMetrics | null,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        })),
      });
    }

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error('[API /jobs] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch jobs' },
      { status: 500 }
    );
  }
}
