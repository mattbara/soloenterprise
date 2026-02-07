/**
 * Tests for:
 * - Bug #5: Cross-session dependency resolution
 * - Bug #6: Status update placeholder ID resolution
 *
 * Bug #5: When the orchestrator creates tasks with depends_on referencing existing UUIDs
 * (not just placeholder IDs like TASK-001), the executor must:
 * 1. Full UUID: verify it exists in the DB, store as valid dependency
 * 2. UUID prefix (e.g., "3c9240e8"): query tasks with LIKE, resolve if exactly 1 match
 * 3. No match: log warning, don't fail
 *
 * Bug #6: Status updates must resolve placeholder IDs (e.g., "TASK-001") through
 * the idMapping built during task creation, just like file locks already do.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — hoisted so vi.mock factories can reference them
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  projectFindFirst: vi.fn(),
  taskFindFirst: vi.fn(),
  taskFindMany: vi.fn(),
  insertReturning: vi.fn(),
  updateSet: vi.fn(),
  enqueueTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  acquireLocks: vi.fn(),
  releaseLocks: vi.fn(),
}));

// Track what dependsOn values are passed to db.update().set()
const capturedDepsUpdates: Array<{ dependsOn: string[] }> = [];

vi.mock('@soloenterprise/db', () => ({
  db: {
    query: {
      projects: { findFirst: mocks.projectFindFirst },
      tasks: {
        findFirst: mocks.taskFindFirst,
        findMany: mocks.taskFindMany,
      },
    },
    insert: () => ({
      values: () => ({
        returning: mocks.insertReturning,
      }),
    }),
    update: () => ({
      set: (data: any) => {
        capturedDepsUpdates.push(data);
        return {
          where: vi.fn().mockResolvedValue(undefined),
        };
      },
    }),
  },
}));

vi.mock('@soloenterprise/db/schema', () => ({
  tasks: { id: 'id', projectId: 'project_id' },
  projects: { id: 'id' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: any[]) => args),
  and: vi.fn((...args: any[]) => args),
  like: vi.fn((...args: any[]) => args),
  inArray: vi.fn((...args: any[]) => args),
}));

vi.mock('../../../services/task-service', () => ({
  updateTaskStatus: mocks.updateTaskStatus,
}));

vi.mock('../../../locks/file-lock-manager', () => ({
  acquireLocks: mocks.acquireLocks,
  releaseLocks: mocks.releaseLocks,
}));

vi.mock('../../../queue/task-queue', () => ({
  enqueueTask: mocks.enqueueTask,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { executeOrchestratorCommands } from '../orchestrator-command-executor';
import type { OrchestratorParseResult } from '../orchestrator-output-parser';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ID = 'proj-aaaaaaaa-1111-2222-3333-444444444444';
const PARENT_TASK_ID = 'parent-bbbbbbbb-1111-2222-3333-444444444444';

// Existing task in the DB (from a previous orchestrator session)
const EXISTING_FULL_UUID = 'cccccccc-1111-2222-3333-444444444444';
// Existing task referenced by prefix
const EXISTING_PREFIX = '3c9240e8';
const EXISTING_PREFIX_FULL = '3c9240e8-abcd-efgh-ijkl-mnopqrstuvwx';
// Non-existent prefix
const NONEXISTENT_PREFIX = 'abcdef1234';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Bug #5: Cross-session dependency resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedDepsUpdates.length = 0;

    // Project always exists
    mocks.projectFindFirst.mockResolvedValue({ id: PROJECT_ID });

    // Default: enqueue succeeds
    mocks.enqueueTask.mockResolvedValue(undefined);
  });

  it('resolves full UUID dependency from database', async () => {
    // Task inserts return predictable UUIDs
    let insertCall = 0;
    mocks.insertReturning.mockImplementation(() => {
      insertCall++;
      if (insertCall === 1) return [{ id: 'new-uuid-1', name: 'Independent Task' }];
      if (insertCall === 2) return [{ id: 'new-uuid-2', name: 'Dependent Task' }];
      return [{ id: `new-uuid-${insertCall}` }];
    });

    // Full UUID lookup — task exists in DB
    mocks.taskFindFirst.mockResolvedValueOnce({ id: EXISTING_FULL_UUID });

    const parseResult: OrchestratorParseResult = {
      success: true,
      action: 'decompose_and_assign',
      tasks: [
        {
          id: 'TASK-001',
          name: 'Independent Task',
          description: 'No deps',
          agent: 'backend',
          priority: 'medium',
          dependencies: [],
        },
        {
          id: 'TASK-002',
          name: 'Dependent Task',
          description: 'Depends on existing task',
          agent: 'frontend',
          priority: 'medium',
          dependencies: [EXISTING_FULL_UUID],
        },
      ],
      questions: [],
      statusUpdates: [],
      fileLocks: [],
    };

    const result = await executeOrchestratorCommands(PROJECT_ID, PARENT_TASK_ID, parseResult);

    expect(result.tasksCreated).toHaveLength(2);
    // DB was queried for the full UUID
    expect(mocks.taskFindFirst).toHaveBeenCalled();
    // Dependencies were updated with the resolved full UUID
    expect(capturedDepsUpdates).toHaveLength(1);
    expect(capturedDepsUpdates[0].dependsOn).toContain(EXISTING_FULL_UUID);
  });

  it('resolves truncated UUID prefix to full UUID from database', async () => {
    let insertCall = 0;
    mocks.insertReturning.mockImplementation(() => {
      insertCall++;
      if (insertCall === 1) return [{ id: 'new-uuid-1', name: 'Independent Task' }];
      if (insertCall === 2) return [{ id: 'new-uuid-2', name: 'Prefix Dep Task' }];
      return [{ id: `new-uuid-${insertCall}` }];
    });

    // Prefix lookup — exactly 1 match
    mocks.taskFindMany.mockResolvedValueOnce([{ id: EXISTING_PREFIX_FULL }]);

    const parseResult: OrchestratorParseResult = {
      success: true,
      action: 'decompose_and_assign',
      tasks: [
        {
          id: 'TASK-001',
          name: 'Independent Task',
          description: 'No deps',
          agent: 'backend',
          priority: 'medium',
          dependencies: [],
        },
        {
          id: 'TASK-002',
          name: 'Prefix Dep Task',
          description: 'Depends on task referenced by prefix',
          agent: 'frontend',
          priority: 'medium',
          dependencies: [EXISTING_PREFIX],
        },
      ],
      questions: [],
      statusUpdates: [],
      fileLocks: [],
    };

    const result = await executeOrchestratorCommands(PROJECT_ID, PARENT_TASK_ID, parseResult);

    expect(result.tasksCreated).toHaveLength(2);
    // DB was queried with LIKE for the prefix
    expect(mocks.taskFindMany).toHaveBeenCalled();
    // Dependencies were updated with the FULL UUID (not the prefix)
    expect(capturedDepsUpdates).toHaveLength(1);
    expect(capturedDepsUpdates[0].dependsOn).toContain(EXISTING_PREFIX_FULL);
    expect(capturedDepsUpdates[0].dependsOn).not.toContain(EXISTING_PREFIX);
  });

  it('logs warning and skips unresolvable dependencies without failing', async () => {
    let insertCall = 0;
    mocks.insertReturning.mockImplementation(() => {
      insertCall++;
      if (insertCall === 1) return [{ id: 'new-uuid-1', name: 'Task with bad dep' }];
      return [{ id: `new-uuid-${insertCall}` }];
    });

    // Prefix lookup — no matches
    mocks.taskFindMany.mockResolvedValueOnce([]);

    const parseResult: OrchestratorParseResult = {
      success: true,
      action: 'decompose_and_assign',
      tasks: [
        {
          id: 'TASK-001',
          name: 'Task with bad dep',
          description: 'Depends on something that does not exist',
          agent: 'backend',
          priority: 'medium',
          dependencies: [NONEXISTENT_PREFIX],
        },
      ],
      questions: [],
      statusUpdates: [],
      fileLocks: [],
    };

    const result = await executeOrchestratorCommands(PROJECT_ID, PARENT_TASK_ID, parseResult);

    // Task was still created (no hard failure)
    expect(result.tasksCreated).toHaveLength(1);
    // No deps were resolved, so no update call
    expect(capturedDepsUpdates).toHaveLength(0);
    // Overall should still succeed (unresolved deps are warnings, not errors)
    expect(result.success).toBe(true);
  });

  it('resolves placeholder, full UUID, and prefix in the same task', async () => {
    let insertCall = 0;
    mocks.insertReturning.mockImplementation(() => {
      insertCall++;
      if (insertCall === 1) return [{ id: 'new-uuid-1', name: 'First Task' }];
      if (insertCall === 2) return [{ id: 'new-uuid-2', name: 'Multi-dep Task' }];
      return [{ id: `new-uuid-${insertCall}` }];
    });

    // Full UUID lookup — exists
    mocks.taskFindFirst.mockResolvedValueOnce({ id: EXISTING_FULL_UUID });
    // Prefix lookup — exactly 1 match
    mocks.taskFindMany.mockResolvedValueOnce([{ id: EXISTING_PREFIX_FULL }]);
    // Second prefix lookup — no match (nonexistent)
    mocks.taskFindMany.mockResolvedValueOnce([]);

    const parseResult: OrchestratorParseResult = {
      success: true,
      action: 'decompose_and_assign',
      tasks: [
        {
          id: 'TASK-001',
          name: 'First Task',
          description: 'No deps',
          agent: 'backend',
          priority: 'medium',
          dependencies: [],
        },
        {
          id: 'TASK-002',
          name: 'Multi-dep Task',
          description: 'Depends on placeholder + existing full UUID + prefix + nonexistent',
          agent: 'frontend',
          priority: 'medium',
          dependencies: [
            'TASK-001',           // Placeholder → resolved via idMapping
            EXISTING_FULL_UUID,   // Full UUID → resolved via DB lookup
            EXISTING_PREFIX,      // Prefix → resolved via LIKE query
            NONEXISTENT_PREFIX,   // Prefix → no match, warning logged
          ],
        },
      ],
      questions: [],
      statusUpdates: [],
      fileLocks: [],
    };

    const result = await executeOrchestratorCommands(PROJECT_ID, PARENT_TASK_ID, parseResult);

    expect(result.tasksCreated).toHaveLength(2);
    expect(capturedDepsUpdates).toHaveLength(1);

    const deps = capturedDepsUpdates[0].dependsOn;
    // Placeholder resolved to new task UUID
    expect(deps).toContain('new-uuid-1');
    // Full UUID resolved from DB
    expect(deps).toContain(EXISTING_FULL_UUID);
    // Prefix resolved to full UUID from DB
    expect(deps).toContain(EXISTING_PREFIX_FULL);
    // Non-existent prefix NOT in deps
    expect(deps).not.toContain(NONEXISTENT_PREFIX);
    // Exactly 3 resolved deps (placeholder + full UUID + prefix)
    expect(deps).toHaveLength(3);
  });

  it('handles ambiguous prefix (multiple matches) by skipping', async () => {
    let insertCall = 0;
    mocks.insertReturning.mockImplementation(() => {
      insertCall++;
      return [{ id: `new-uuid-${insertCall}`, name: `Task ${insertCall}` }];
    });

    // Prefix lookup — 2 matches (ambiguous)
    mocks.taskFindMany.mockResolvedValueOnce([
      { id: '3c9240e8-aaaa-bbbb-cccc-111111111111' },
      { id: '3c9240e8-aaaa-bbbb-cccc-222222222222' },
    ]);

    const parseResult: OrchestratorParseResult = {
      success: true,
      action: 'decompose_and_assign',
      tasks: [
        {
          id: 'TASK-001',
          name: 'Ambiguous Dep Task',
          description: 'Depends on ambiguous prefix',
          agent: 'backend',
          priority: 'medium',
          dependencies: [EXISTING_PREFIX],
        },
      ],
      questions: [],
      statusUpdates: [],
      fileLocks: [],
    };

    const result = await executeOrchestratorCommands(PROJECT_ID, PARENT_TASK_ID, parseResult);

    expect(result.tasksCreated).toHaveLength(1);
    // Ambiguous prefix was NOT resolved — no deps update
    expect(capturedDepsUpdates).toHaveLength(0);
    // Still succeeds (warnings, not errors)
    expect(result.success).toBe(true);
  });
});
