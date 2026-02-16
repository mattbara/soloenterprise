/**
 * Tests for cost-tracking-service.ts
 *
 * Mocks the database layer and verifies recordAgentCost() calculates
 * costs correctly, handles failures gracefully, and logs appropriately.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted so mocks are available when vi.mock factories run
const { mockInsertValues, mockInsert } = vi.hoisted(() => {
  const mockInsertValues = vi.fn().mockResolvedValue(undefined);
  const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });
  return { mockInsertValues, mockInsert };
});

vi.mock('@soloenterprise/db', () => ({
  db: { insert: mockInsert },
}));

vi.mock('@soloenterprise/db/schema', () => ({
  costTracking: Symbol('costTracking'),
}));

import { recordAgentCost, type AgentCostRecord } from '../cost-tracking-service';
import { calculateTokenCost, estimateBillableHours } from '../../agents/utils/token-pricing';

function mockCostRecord(overrides?: Partial<AgentCostRecord>): AgentCostRecord {
  return {
    projectId: 'test-project-id',
    taskId: 'test-task-id',
    agentType: 'backend',
    model: 'claude-sonnet-4-5-20250929',
    tokensInput: 10_000,
    tokensOutput: 5_000,
    cachedTokens: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('recordAgentCost', () => {
  it('calls db.insert with correct values', async () => {
    const record = mockCostRecord();
    await recordAgentCost(record);

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'test-project-id',
        taskId: 'test-task-id',
        agentType: 'backend',
        tokensInput: 10_000,
        tokensOutput: 5_000,
        cachedTokens: 0,
      })
    );
  });

  it('passes correct USD cost matching calculateTokenCost', async () => {
    const record = mockCostRecord();
    await recordAgentCost(record);

    const expectedCost = calculateTokenCost({
      model: record.model,
      tokensInput: record.tokensInput,
      tokensOutput: record.tokensOutput,
      cachedTokens: record.cachedTokens,
    });

    const insertedValues = mockInsertValues.mock.calls[0][0];
    expect(insertedValues.apiCostUsd).toBe(expectedCost.totalCostUsd.toFixed(4));
  });

  it('passes correct billable hours matching estimateBillableHours', async () => {
    const record = mockCostRecord({ complexity: 'complex' });
    await recordAgentCost(record);

    const totalTokens = record.tokensInput + record.tokensOutput;
    const expectedHours = estimateBillableHours(totalTokens, 'complex');

    const insertedValues = mockInsertValues.mock.calls[0][0];
    expect(insertedValues.estimatedBillableHours).toBe(expectedHours.toFixed(2));
  });

  it('defaults complexity to standard when not provided', async () => {
    const record = mockCostRecord(); // no complexity field
    await recordAgentCost(record);

    const totalTokens = record.tokensInput + record.tokensOutput;
    const expectedHours = estimateBillableHours(totalTokens, 'standard');

    const insertedValues = mockInsertValues.mock.calls[0][0];
    expect(insertedValues.estimatedBillableHours).toBe(expectedHours.toFixed(2));
  });

  it('does not throw when db.insert fails', async () => {
    mockInsertValues.mockRejectedValueOnce(new Error('DB connection failed'));

    await expect(recordAgentCost(mockCostRecord())).resolves.toBeUndefined();

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[CostTracking]'),
      expect.stringContaining('DB connection failed')
    );
  });

  it('logs with [CostTracking] prefix on success', async () => {
    await recordAgentCost(mockCostRecord());

    expect(console.log).toHaveBeenCalledWith(
      expect.stringMatching(/\[CostTracking\].*backend.*\$.*project=test-project-id/)
    );
  });
});
