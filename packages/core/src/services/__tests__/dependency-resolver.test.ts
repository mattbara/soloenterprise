/**
 * Tests for Dependency Resolver
 *
 * Validates that:
 * 1. Only truly completed tasks (DB status = 'completed') can unblock dependents
 * 2. Failed tasks (DB status = 'failed') do NOT unblock dependents
 * 3. When BullMQ fires 'completed' but DB status is 'failed', delegates to handleFailedDependency
 * 4. Mixed dependencies (one completed, one failed) do NOT unblock
 * 5. Failed tasks with dependents log a warning about stuck chain
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — hoisted so vi.mock factories can reference them
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  taskFindFirst: vi.fn(),
  taskFindMany: vi.fn(),
  taskUpdate: vi.fn(),
  enqueueTask: vi.fn(),
  generateTechSpec: vi.fn(),
}));

// Track db.update().set() calls
const capturedUpdates: Array<{ data: any; whereArgs: any }> = [];

vi.mock('@soloenterprise/db', () => ({
  db: {
    query: {
      tasks: {
        findFirst: mocks.taskFindFirst,
        findMany: mocks.taskFindMany,
      },
    },
    update: () => ({
      set: (data: any) => ({
        where: vi.fn().mockImplementation((whereArgs: any) => {
          capturedUpdates.push({ data, whereArgs });
          return {
            // Support .returning() for atomic claims
            returning: mocks.taskUpdate,
            // Also work as a plain promise for non-returning calls
            then: (resolve: any) => resolve(undefined),
          };
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
  inArray: vi.fn((...args: any[]) => args),
}));

vi.mock('../../queue/task-queue', () => ({
  enqueueTask: mocks.enqueueTask,
}));

vi.mock('../../agents/utils/architect-spec-generator', () => ({
  generateTechSpec: mocks.generateTechSpec,
}));

// Mock TaskLogger — must be a class (used with `new`)
const mockLoggerInstance = vi.hoisted(() => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../utils/task-logger', () => ({
  TaskLogger: class MockTaskLogger {
    log = mockLoggerInstance.log;
    warn = mockLoggerInstance.warn;
    error = mockLoggerInstance.error;
  },
}));

import {
  resolveCompletedDependency,
  handleFailedDependency,
  unblockDependentTasks,
} from '../dependency-resolver';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TASK_A_ID = 'aaaa-aaaa-aaaa-aaaa';
const TASK_B_ID = 'bbbb-bbbb-bbbb-bbbb';
const TASK_C_ID = 'cccc-cccc-cccc-cccc';

function makeTask(overrides: Partial<{
  id: string;
  name: string;
  status: string;
  dependsOn: string[] | null;
  agentType: string;
  priority: number;
  context: Record<string, unknown> | null;
}> = {}) {
  return {
    id: overrides.id ?? TASK_A_ID,
    name: overrides.name ?? 'Test Task',
    status: overrides.status ?? 'pending',
    dependsOn: overrides.dependsOn ?? null,
    agentType: overrides.agentType ?? 'backend',
    priority: overrides.priority ?? 1,
    context: overrides.context ?? null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveCompletedDependency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedUpdates.length = 0;
    mockLoggerInstance.log.mockClear();
    mockLoggerInstance.warn.mockClear();
    mockLoggerInstance.error.mockClear();
    mocks.generateTechSpec.mockResolvedValue(null);
    mocks.enqueueTask.mockResolvedValue(undefined);
  });

  it('does NOT unblock dependents when triggering task is failed in DB', async () => {
    // Task A "completed" in BullMQ but is actually failed in DB
    mocks.taskFindFirst.mockResolvedValue(makeTask({
      id: TASK_A_ID,
      status: 'failed',
      name: 'Failed Task',
    }));

    // Task B depends on Task A and is pending
    mocks.taskFindMany.mockResolvedValue([
      makeTask({
        id: TASK_B_ID,
        name: 'Dependent Task',
        status: 'pending',
        dependsOn: [TASK_A_ID],
      }),
    ]);

    await resolveCompletedDependency(TASK_A_ID);

    // Should NOT have queued the dependent task
    expect(mocks.enqueueTask).not.toHaveBeenCalled();

    // Should have logged a warning about DB status mismatch
    expect(mockLoggerInstance.warn).toHaveBeenCalledWith(
      'DependencyResolver',
      expect.stringContaining('has DB status "failed" but BullMQ reported completion'),
    );
  });

  it('delegates to handleFailedDependency when DB status is failed', async () => {
    // Task A "completed" in BullMQ but is actually failed in DB
    mocks.taskFindFirst.mockResolvedValue(makeTask({
      id: TASK_A_ID,
      status: 'failed',
      name: 'Failed Task',
    }));

    // findMany is called by handleFailedDependency (delegated to)
    // First call: from handleFailedDependency looking for pending tasks
    mocks.taskFindMany.mockResolvedValue([
      makeTask({
        id: TASK_B_ID,
        name: 'Dependent Task',
        status: 'pending',
        dependsOn: [TASK_A_ID],
      }),
    ]);

    await resolveCompletedDependency(TASK_A_ID);

    // handleFailedDependency should have been called, which marks dependents as blocked
    expect(capturedUpdates.length).toBe(1);
    expect(capturedUpdates[0].data.status).toBe('blocked');
    expect(capturedUpdates[0].data.context).toMatchObject({
      blockedByTaskId: TASK_A_ID,
    });
  });

  it('unblocks dependents when triggering task is actually completed', async () => {
    // Task A is truly completed
    mocks.taskFindFirst.mockResolvedValue(makeTask({
      id: TASK_A_ID,
      status: 'completed',
    }));

    // Task B depends only on Task A
    mocks.taskFindMany
      .mockResolvedValueOnce([ // findMany for pending tasks
        makeTask({
          id: TASK_B_ID,
          name: 'Dependent Task',
          status: 'pending',
          dependsOn: [TASK_A_ID],
        }),
      ])
      .mockResolvedValueOnce([ // findMany for dep statuses
        makeTask({ id: TASK_A_ID, status: 'completed' }),
      ]);

    // Atomic claim succeeds — returns claimed row
    mocks.taskUpdate.mockResolvedValueOnce([{ id: TASK_B_ID }]);

    await resolveCompletedDependency(TASK_A_ID);

    // Should have queued the dependent task
    expect(mocks.enqueueTask).toHaveBeenCalledWith(TASK_B_ID, 'backend', 1);
  });

  it('only queues task once when two deps resolve concurrently', async () => {
    // Task A is truly completed
    mocks.taskFindFirst.mockResolvedValue(makeTask({
      id: TASK_A_ID,
      status: 'completed',
    }));

    // Task C depends on A and B, both completed
    mocks.taskFindMany
      .mockResolvedValueOnce([ // findMany for pending tasks
        makeTask({
          id: TASK_C_ID,
          name: 'Double-Dep Task',
          status: 'pending',
          dependsOn: [TASK_A_ID, TASK_B_ID],
        }),
      ])
      .mockResolvedValueOnce([ // findMany for dep statuses
        makeTask({ id: TASK_A_ID, status: 'completed' }),
        makeTask({ id: TASK_B_ID, status: 'completed' }),
      ]);

    // Atomic claim FAILS — another resolver already claimed it
    mocks.taskUpdate.mockResolvedValueOnce([]);

    await resolveCompletedDependency(TASK_A_ID);

    // Should NOT have queued — another resolver already claimed
    expect(mocks.enqueueTask).not.toHaveBeenCalled();
  });

  it('does NOT unblock when one dep is completed but another is failed', async () => {
    // Task A just completed
    mocks.taskFindFirst.mockResolvedValue(makeTask({
      id: TASK_A_ID,
      status: 'completed',
    }));

    // Task C depends on both A (completed) and B (failed)
    mocks.taskFindMany
      .mockResolvedValueOnce([ // findMany for pending tasks
        makeTask({
          id: TASK_C_ID,
          name: 'Double-Dep Task',
          status: 'pending',
          dependsOn: [TASK_A_ID, TASK_B_ID],
        }),
      ])
      .mockResolvedValueOnce([ // findMany for dep statuses
        makeTask({ id: TASK_A_ID, status: 'completed' }),
        makeTask({ id: TASK_B_ID, status: 'failed' }),
      ]);

    await resolveCompletedDependency(TASK_A_ID);

    // Should NOT have queued — Task B is still failed
    expect(mocks.enqueueTask).not.toHaveBeenCalled();
  });
});

describe('handleFailedDependency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedUpdates.length = 0;
    mockLoggerInstance.log.mockClear();
    mockLoggerInstance.warn.mockClear();
    mockLoggerInstance.error.mockClear();
  });

  it('marks pending dependents as blocked when task fails', async () => {
    mocks.taskFindMany.mockResolvedValue([
      makeTask({
        id: TASK_B_ID,
        name: 'Dependent Task',
        status: 'pending',
        dependsOn: [TASK_A_ID],
      }),
    ]);

    await handleFailedDependency(TASK_A_ID);

    expect(capturedUpdates.length).toBe(1);
    expect(capturedUpdates[0].data.status).toBe('blocked');
    expect(capturedUpdates[0].data.context).toMatchObject({
      blockedByTaskId: TASK_A_ID,
      blockedReason: expect.stringContaining('failed'),
    });
  });

  it('logs warning about stuck chain when dependents exist', async () => {
    mocks.taskFindMany.mockResolvedValue([
      makeTask({
        id: TASK_B_ID,
        name: 'Task B',
        status: 'pending',
        dependsOn: [TASK_A_ID],
      }),
      makeTask({
        id: TASK_C_ID,
        name: 'Task C',
        status: 'pending',
        dependsOn: [TASK_A_ID],
      }),
    ]);

    await handleFailedDependency(TASK_A_ID);

    expect(mockLoggerInstance.warn).toHaveBeenCalledWith(
      'DependencyResolver',
      expect.stringContaining('2 downstream task(s) are now blocked'),
    );
  });

  it('does NOT block tasks that do not depend on the failed task', async () => {
    mocks.taskFindMany.mockResolvedValue([
      makeTask({
        id: TASK_B_ID,
        name: 'Unrelated Task',
        status: 'pending',
        dependsOn: ['some-other-id'], // depends on something else
      }),
    ]);

    await handleFailedDependency(TASK_A_ID);

    expect(capturedUpdates.length).toBe(0);
  });
});

describe('unblockDependentTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedUpdates.length = 0;
    mockLoggerInstance.log.mockClear();
    mockLoggerInstance.warn.mockClear();
    mockLoggerInstance.error.mockClear();
    mocks.generateTechSpec.mockResolvedValue(null);
    mocks.enqueueTask.mockResolvedValue(undefined);
  });

  it('skips unblocking when triggering task is not completed in DB', async () => {
    mocks.taskFindFirst.mockResolvedValue(makeTask({
      id: TASK_A_ID,
      status: 'failed',
    }));

    await unblockDependentTasks(TASK_A_ID);

    // Should not have queried for blocked tasks at all
    expect(mocks.taskFindMany).not.toHaveBeenCalled();
    expect(mocks.enqueueTask).not.toHaveBeenCalled();

    expect(mockLoggerInstance.warn).toHaveBeenCalledWith(
      'DependencyResolver',
      expect.stringContaining('Skipping unblock'),
    );
  });

  it('unblocks tasks when triggering task is truly completed', async () => {
    mocks.taskFindFirst.mockResolvedValue(makeTask({
      id: TASK_A_ID,
      status: 'completed',
    }));

    // Blocked task that was blocked by TASK_A_ID
    mocks.taskFindMany
      .mockResolvedValueOnce([ // findMany for blocked tasks
        makeTask({
          id: TASK_B_ID,
          name: 'Blocked Task',
          status: 'blocked',
          dependsOn: [TASK_A_ID],
          context: { blockedByTaskId: TASK_A_ID },
        }),
      ])
      .mockResolvedValueOnce([ // findMany for dep statuses
        makeTask({ id: TASK_A_ID, status: 'completed' }),
      ]);

    // Atomic claim succeeds — returns claimed row
    mocks.taskUpdate.mockResolvedValueOnce([{ id: TASK_B_ID }]);

    await unblockDependentTasks(TASK_A_ID);

    // Should have updated status to queued (atomic transition)
    expect(capturedUpdates.length).toBe(1);
    expect(capturedUpdates[0].data.status).toBe('queued');
    expect(capturedUpdates[0].data.context).toMatchObject({
      blockedReason: null,
      blockedByTaskId: null,
    });

    // Should have queued the task
    expect(mocks.enqueueTask).toHaveBeenCalledWith(TASK_B_ID, 'backend', 1);
  });
});
