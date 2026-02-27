/**
 * Tests for claimTaskForProcessing — atomic queued → running transition
 * with dependency guard that prevents claiming tasks whose deps aren't done.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — hoisted so vi.mock factories can reference them
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  updateReturning: vi.fn(),
  taskFindFirst: vi.fn(),
  taskFindMany: vi.fn(),
}));

vi.mock('@soloenterprise/db', () => ({
  db: {
    query: {
      tasks: {
        findFirst: mocks.taskFindFirst,
        findMany: mocks.taskFindMany,
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
  tasks: { id: 'id', status: 'status', dependsOn: 'dependsOn' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: any[]) => args),
  and: vi.fn((...args: any[]) => args),
  inArray: vi.fn((...args: any[]) => args),
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

  it('returns claimed=true for queued task with no dependencies', async () => {
    // Dependency guard: task has no deps
    mocks.taskFindFirst.mockResolvedValueOnce({ status: 'queued', dependsOn: [] });
    // Atomic UPDATE succeeds
    mocks.updateReturning.mockResolvedValueOnce([{ id: 'task-1' }]);

    const result = await claimTaskForProcessing('task-1');

    expect(result.claimed).toBe(true);
    expect(result.currentStatus).toBe('running');
  });

  it('returns claimed=true for queued task with all deps completed', async () => {
    // Dependency guard: task has deps
    mocks.taskFindFirst.mockResolvedValueOnce({ status: 'queued', dependsOn: ['dep-1', 'dep-2'] });
    // All deps completed
    mocks.taskFindMany.mockResolvedValueOnce([
      { id: 'dep-1', status: 'completed' },
      { id: 'dep-2', status: 'completed' },
    ]);
    // Atomic UPDATE succeeds
    mocks.updateReturning.mockResolvedValueOnce([{ id: 'task-1' }]);

    const result = await claimTaskForProcessing('task-1');

    expect(result.claimed).toBe(true);
    expect(result.currentStatus).toBe('running');
  });

  it('returns claimed=false when dependency is not completed', async () => {
    // Dependency guard: task has deps
    mocks.taskFindFirst.mockResolvedValueOnce({ status: 'queued', dependsOn: ['dep-1', 'dep-2'] });
    // dep-2 is still running
    mocks.taskFindMany.mockResolvedValueOnce([
      { id: 'dep-1', status: 'completed' },
      { id: 'dep-2', status: 'running' },
    ]);

    const result = await claimTaskForProcessing('task-1');

    expect(result.claimed).toBe(false);
    expect(result.reason).toContain('dependencies not completed');
    // Should NOT attempt the atomic UPDATE
    expect(mocks.updateReturning).not.toHaveBeenCalled();
  });

  it('returns claimed=false when dependency has failed', async () => {
    mocks.taskFindFirst.mockResolvedValueOnce({ status: 'queued', dependsOn: ['dep-1'] });
    mocks.taskFindMany.mockResolvedValueOnce([
      { id: 'dep-1', status: 'failed' },
    ]);

    const result = await claimTaskForProcessing('task-1');

    expect(result.claimed).toBe(false);
    expect(result.reason).toContain('dependencies not completed');
    expect(mocks.updateReturning).not.toHaveBeenCalled();
  });

  it('returns claimed=false for already-running task', async () => {
    // Dependency guard: no deps
    mocks.taskFindFirst
      .mockResolvedValueOnce({ status: 'running', dependsOn: [] }) // dep guard
      .mockResolvedValueOnce({ status: 'running' }); // fallback status query
    // Atomic UPDATE fails (not queued)
    mocks.updateReturning.mockResolvedValueOnce([]);

    const result = await claimTaskForProcessing('task-1');

    expect(result.claimed).toBe(false);
    expect(result.currentStatus).toBe('running');
  });

  it('returns claimed=false with "unknown" for nonexistent task', async () => {
    // Dependency guard: task not found
    mocks.taskFindFirst.mockResolvedValueOnce(null);

    const result = await claimTaskForProcessing('nonexistent');

    expect(result.claimed).toBe(false);
    expect(result.currentStatus).toBe('unknown');
    expect(result.reason).toBe('task not found');
  });

  it('returns claimed=false for completed task', async () => {
    // Dependency guard: no deps
    mocks.taskFindFirst
      .mockResolvedValueOnce({ status: 'completed', dependsOn: [] }) // dep guard
      .mockResolvedValueOnce({ status: 'completed' }); // fallback
    mocks.updateReturning.mockResolvedValueOnce([]);

    const result = await claimTaskForProcessing('task-1');

    expect(result.claimed).toBe(false);
    expect(result.currentStatus).toBe('completed');
  });
});
