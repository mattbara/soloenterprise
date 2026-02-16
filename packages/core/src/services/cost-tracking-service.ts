/**
 * Cost Tracking Service
 *
 * Records per-call API costs into the cost_tracking table.
 * Called by every agent after a successful Claude API response.
 *
 * IMPORTANT: This is observability, not business logic.
 * Failures are logged as warnings — never thrown.
 */

import { db } from '@soloenterprise/db';
import { costTracking } from '@soloenterprise/db/schema';
import { calculateTokenCost, estimateBillableHours } from '../agents/utils/token-pricing';

export interface AgentCostRecord {
  projectId: string;
  taskId: string;
  agentType: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  cachedTokens: number;
  complexity?: 'simple' | 'standard' | 'complex';
}

/**
 * Record the cost of a single Claude API call.
 *
 * Safe to call from any agent — never throws.
 */
export async function recordAgentCost(record: AgentCostRecord): Promise<void> {
  try {
    const cost = calculateTokenCost({
      model: record.model,
      tokensInput: record.tokensInput,
      tokensOutput: record.tokensOutput,
      cachedTokens: record.cachedTokens,
    });

    const totalTokens = record.tokensInput + record.tokensOutput;
    const complexity = record.complexity ?? 'standard';
    const billableHours = estimateBillableHours(totalTokens, complexity);

    await db.insert(costTracking).values({
      projectId: record.projectId,
      taskId: record.taskId,
      agentType: record.agentType,
      tokensInput: record.tokensInput,
      tokensOutput: record.tokensOutput,
      cachedTokens: record.cachedTokens,
      apiCostUsd: cost.totalCostUsd.toFixed(4),
      estimatedBillableHours: billableHours.toFixed(2),
    });

    console.log(
      `[CostTracking] ${record.agentType} | $${cost.totalCostUsd.toFixed(4)} | project=${record.projectId}`,
    );
  } catch (err) {
    console.warn(
      `[CostTracking] Failed to record cost for task ${record.taskId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}
