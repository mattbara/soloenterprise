import { db } from "@/lib/db";
import { tasks, projects } from "@soloenterprise/db/schema";
import { isNotNull, desc } from "drizzle-orm";
import { MetricsDashboard } from "@/components/MetricsDashboard";

export const dynamic = "force-dynamic";

interface TokenMetrics {
  inputTokens?: number;
  outputTokens?: number;
  skillTokens?: number;
  contextTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  cacheHitPercent?: number;
  estimatedSavingsPercent?: number;
}

async function getMetricsData() {
  // Fetch all tasks that have tokenMetrics
  const tasksWithMetrics = await db.query.tasks.findMany({
    where: isNotNull(tasks.tokenMetrics),
    orderBy: [desc(tasks.createdAt)],
    columns: {
      id: true,
      name: true,
      agentType: true,
      status: true,
      projectId: true,
      tokenMetrics: true,
      createdAt: true,
    },
    with: {
      project: {
        columns: { id: true, name: true },
      },
    },
  });

  // Group by project
  const projectMap = new Map<
    string,
    {
      projectId: string;
      projectName: string;
      tasks: Array<{
        id: string;
        name: string;
        agentType: string;
        status: string;
        projectId: string;
        projectName: string;
        tokenMetrics: TokenMetrics;
        createdAt: string;
      }>;
    }
  >();

  for (const task of tasksWithMetrics) {
    const projectId = task.projectId;
    const projectName = task.project?.name ?? "Unknown";

    if (!projectMap.has(projectId)) {
      projectMap.set(projectId, {
        projectId,
        projectName,
        tasks: [],
      });
    }

    projectMap.get(projectId)!.tasks.push({
      id: task.id,
      name: task.name,
      agentType: task.agentType,
      status: task.status,
      projectId,
      projectName,
      tokenMetrics: (task.tokenMetrics ?? {}) as TokenMetrics,
      createdAt: task.createdAt.toISOString(),
    });
  }

  // Compute aggregates per agent type per project
  const projectGroups = Array.from(projectMap.values()).map((group) => {
    const byAgent = new Map<
      string,
      { inputs: number[]; outputs: number[]; totals: number[]; cacheHits: number[] }
    >();

    for (const task of group.tasks) {
      const m = task.tokenMetrics;
      const agentType = task.agentType;
      if (!byAgent.has(agentType)) {
        byAgent.set(agentType, { inputs: [], outputs: [], totals: [], cacheHits: [] });
      }
      const agg = byAgent.get(agentType)!;
      const input = m.inputTokens ?? 0;
      const output = m.outputTokens ?? 0;
      agg.inputs.push(input);
      agg.outputs.push(output);
      agg.totals.push(input + output);
      agg.cacheHits.push(m.cacheHitPercent ?? 0);
    }

    const aggregates = Array.from(byAgent.entries()).map(([agentType, data]) => {
      const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
      const max = (arr: number[]) => Math.max(...arr);
      return {
        agentType,
        taskCount: data.inputs.length,
        avgInput: avg(data.inputs),
        avgOutput: avg(data.outputs),
        maxInput: max(data.inputs),
        maxOutput: max(data.outputs),
        avgTotal: avg(data.totals),
        maxTotal: max(data.totals),
        avgCacheHit: avg(data.cacheHits),
      };
    });

    return { ...group, aggregates };
  });

  return projectGroups;
}

export default async function MetricsPage() {
  const projects = await getMetricsData();

  return (
    <div className="space-y-6">
      <MetricsDashboard projects={projects} />
    </div>
  );
}
