/**
 * Tests for claimTaskForProcessing — atomic queued → running transition
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — hoisted so vi.mock factories can reference them
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  updateReturning: vi.fn(),
  taskFindFirst: vi.fn(),
}));

vi.mock('@soloenterprise/db', () => ({
  db: {
    query: {
      tasks: {
        findFirst: mocks.taskFindFirst,
      },
    },
    update: () => ({
      set: () => ({
        where: () => ({
          returning: mocks.updateReturning,
        }),
      }),
    }),
  },
}));

vi.mock('@soloenterprise/db/schema', () => ({
  tasks: { id: 'id', status: 'status' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: any[]) => args),
  and: vi.fn((...args: any[]) => args),
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn(),
}));

vi.mock('../../utils/index', () => ({
  getSharedRedisConnection: vi.fn(),
  closeSharedRedisConnection: vi.fn(),
}));

vi.mock('../task-events', () => ({
  publishTaskEvent: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { claimTaskForProcessing } from '../task-service';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('claimTaskForProcessing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns claimed=true for queued task', async () => {
    // Atomic UPDATE...WHERE status='queued' succeeds
    mocks.updateReturning.mockResolvedValueOnce([{ id: 'task-1' }]);

    const result = await claimTaskForProcessing('task-1');

    expect(result.claimed).toBe(true);
    expect(result.currentStatus).toBe('running');
    // Should NOT query for current status (already claimed)
    expect(mocks.taskFindFirst).not.toHaveBeenCalled();
  });

  it('returns claimed=false for already-running task', async () => {
    // Atomic UPDATE returns empty — task is not in queued status
    mocks.updateReturning.mockResolvedValueOnce([]);

    // Fallback query to get current status
    mocks.taskFindFirst.mockResolvedValueOnce({ status: 'running' });

    const result = await claimTaskForProcessing('task-1');

    expect(result.claimed).toBe(false);
    expect(result.currentStatus).toBe('running');
  });

  it('returns claimed=false with "unknown" for nonexistent task', async () => {
    mocks.updateReturning.mockResolvedValueOnce([]);
    mocks.taskFindFirst.mockResolvedValueOnce(null);

    const result = await claimTaskForProcessing('nonexistent');

    expect(result.claimed).toBe(false);
    expect(result.currentStatus).toBe('unknown');
  });

  it('returns claimed=false for completed task', async () => {
    mocks.updateReturning.mockResolvedValueOnce([]);
    mocks.taskFindFirst.mockResolvedValueOnce({ status: 'completed' });

    const result = await claimTaskForProcessing('task-1');

    expect(result.claimed).toBe(false);
    expect(result.currentStatus).toBe('completed');
  });
});
