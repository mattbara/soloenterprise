/**
 * Tests for the Agent Registry Guard in the Command Executor.
 *
 * Validates that tasks targeting unavailable agents (devops, project-scoper, etc.)
 * are rejected before DB insertion and converted to human questions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — hoisted so vi.mock factories can reference them
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  projectFindFirst: vi.fn(),
  taskFindFirst: vi.fn(),
  taskFindMany: vi.fn(),
  insertValues: vi.fn(),
  insertReturning: vi.fn(),
  updateSet: vi.fn(),
  enqueueTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  acquireLocks: vi.fn(),
  releaseLocks: vi.fn(),
  questionsInsertValues: vi.fn(),
}));

// Track insert calls to distinguish tasks vs questions
const insertCalls: Array<{ table: string; values: any }> = [];

vi.mock('@soloenterprise/db', () => ({
  db: {
    query: {
      projects: { findFirst: mocks.projectFindFirst },
      tasks: {
        findFirst: mocks.taskFindFirst,
        findMany: mocks.taskFindMany,
      },
    },
    insert: (table: any) => ({
      values: (vals: any) => {
        insertCalls.push({ table: table?.id ?? 'unknown', values: vals });
        return {
          returning: mocks.insertReturning,
        };
      },
    }),
    update: () => ({
      set: () => ({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
}));

vi.mock('@soloenterprise/db/schema', () => ({
  tasks: { id: 'tasks_id', projectId: 'project_id' },
  projects: { id: 'projects_id' },
  questions: { id: 'questions_id' },
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

vi.mock('../architect-spec-generator', () => ({
  generateTechSpec: vi.fn().mockResolvedValue(null),
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

// Suppress console noise
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Agent Registry Guard — Pre-pass filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertCalls.length = 0;

    mocks.projectFindFirst.mockResolvedValue({ id: PROJECT_ID });
    mocks.enqueueTask.mockResolvedValue(undefined);
    // Questions insert succeeds (returning is called for task inserts only)
    mocks.insertReturning.mockImplementation(() => {
      // Should NOT be called for devops tasks
      return [{ id: `new-uuid-${Math.random().toString(36).slice(2, 8)}`, name: 'Task' }];
    });
  });

  it('rejects tasks targeting unavailable agent "devops"', async () => {
    let insertCall = 0;
    mocks.insertReturning.mockImplementation(() => {
      insertCall++;
      return [{ id: `uuid-${insertCall}`, name: `Task ${insertCall}` }];
    });

    const parseResult: OrchestratorParseResult = {
      success: true,
      action: 'decompose_and_assign',
      tasks: [
        {
          id: 'TASK-001',
          name: 'Backend API',
          description: 'Build the API',
          agent: 'backend',
          priority: 'medium',
          dependencies: [],
        },
        {
          id: 'TASK-002',
          name: 'CI/CD Pipeline',
          description: 'Set up CI/CD',
          agent: 'devops',
          priority: 'medium',
          dependencies: [],
        },
      ],
      questions: [],
      statusUpdates: [],
      fileLocks: [],
    };

    const result = await executeOrchestratorCommands(PROJECT_ID, PARENT_TASK_ID, parseResult);

    // Only 1 task created (backend), not 2
    expect(result.tasksCreated).toHaveLength(1);
    // enqueueTask called only for backend, not devops
    expect(mocks.enqueueTask).toHaveBeenCalledTimes(1);
  });

  it('allows tasks targeting available agents (backend, frontend, qa)', async () => {
    let insertCall = 0;
    mocks.insertReturning.mockImplementation(() => {
      insertCall++;
      return [{ id: `uuid-${insertCall}`, name: `Task ${insertCall}` }];
    });

    const parseResult: OrchestratorParseResult = {
      success: true,
      action: 'decompose_and_assign',
      tasks: [
        { id: 'T1', name: 'Backend work', description: 'API', agent: 'backend', priority: 'medium', dependencies: [] },
        { id: 'T2', name: 'Frontend work', description: 'UI', agent: 'frontend', priority: 'medium', dependencies: [] },
        { id: 'T3', name: 'QA work', description: 'Tests', agent: 'qa', priority: 'medium', dependencies: [] },
      ],
      questions: [],
      statusUpdates: [],
      fileLocks: [],
    };

    const result = await executeOrchestratorCommands(PROJECT_ID, PARENT_TASK_ID, parseResult);

    expect(result.tasksCreated).toHaveLength(3);
    expect(mocks.enqueueTask).toHaveBeenCalledTimes(3);
  });

  it('strips rejected task IDs from other tasks dependency arrays', async () => {
    let insertCall = 0;
    const capturedDeps: string[][] = [];
    mocks.insertReturning.mockImplementation(() => {
      insertCall++;
      return [{ id: `uuid-${insertCall}`, name: `Task ${insertCall}` }];
    });

    const parseResult: OrchestratorParseResult = {
      success: true,
      action: 'decompose_and_assign',
      tasks: [
        {
          id: 'TASK-001',
          name: 'DevOps task',
          description: 'Infrastructure',
          agent: 'devops',
          priority: 'medium',
          dependencies: [],
        },
        {
          id: 'TASK-002',
          name: 'QA tests',
          description: 'Test the deployment',
          agent: 'qa',
          priority: 'medium',
          dependencies: ['TASK-001'], // Depends on rejected devops task
        },
      ],
      questions: [],
      statusUpdates: [],
      fileLocks: [],
    };

    const result = await executeOrchestratorCommands(PROJECT_ID, PARENT_TASK_ID, parseResult);

    // Only QA task created (devops rejected)
    expect(result.tasksCreated).toHaveLength(1);
    // QA task should be queued (dependency was removed, so it has no deps)
    expect(mocks.enqueueTask).toHaveBeenCalledTimes(1);
  });

  it('creates a human question for rejected tasks', async () => {
    let insertCall = 0;
    mocks.insertReturning.mockImplementation(() => {
      insertCall++;
      return [{ id: `uuid-${insertCall}`, name: `Task ${insertCall}` }];
    });

    const parseResult: OrchestratorParseResult = {
      success: true,
      action: 'decompose_and_assign',
      tasks: [
        {
          id: 'TASK-001',
          name: 'Backend work',
          description: 'Build API',
          agent: 'backend',
          priority: 'medium',
          dependencies: [],
        },
        {
          id: 'TASK-002',
          name: 'Deploy to staging',
          description: 'Set up staging environment',
          agent: 'devops',
          priority: 'high',
          dependencies: [],
        },
      ],
      questions: [],
      statusUpdates: [],
      fileLocks: [],
    };

    await executeOrchestratorCommands(PROJECT_ID, PARENT_TASK_ID, parseResult);

    // Should have 2 insert calls: 1 task + 1 question
    // The question insert is the second one
    expect(insertCalls.length).toBeGreaterThanOrEqual(2);
    const questionInsert = insertCalls[insertCalls.length - 1];
    expect(questionInsert.values.askedByAgent).toBe('orchestrator');
    expect(questionInsert.values.isBlocking).toBe(false);
    expect(questionInsert.values.question).toContain('devops');
    expect(questionInsert.values.question).toContain('Deploy to staging');
  });

  it('rejects multiple unavailable agents and consolidates into one question', async () => {
    let insertCall = 0;
    mocks.insertReturning.mockImplementation(() => {
      insertCall++;
      return [{ id: `uuid-${insertCall}`, name: `Task ${insertCall}` }];
    });

    const parseResult: OrchestratorParseResult = {
      success: true,
      action: 'decompose_and_assign',
      tasks: [
        { id: 'T1', name: 'API', description: 'Build', agent: 'backend', priority: 'medium', dependencies: [] },
        { id: 'T2', name: 'CI/CD', description: 'Pipeline', agent: 'devops', priority: 'medium', dependencies: [] },
        // Using 'devops' again since it's the only unavailable agent in parser's AgentType
        { id: 'T3', name: 'Monitoring', description: 'Setup', agent: 'devops', priority: 'medium', dependencies: [] },
      ],
      questions: [],
      statusUpdates: [],
      fileLocks: [],
    };

    const result = await executeOrchestratorCommands(PROJECT_ID, PARENT_TASK_ID, parseResult);

    // Only backend task created
    expect(result.tasksCreated).toHaveLength(1);
    // One consolidated question for both rejected tasks
    const questionInserts = insertCalls.filter(c => c.values.askedByAgent === 'orchestrator');
    expect(questionInserts).toHaveLength(1);
    expect(questionInserts[0].values.question).toContain('2 task(s)');
  });

  it('does not create question when all agents are available', async () => {
    let insertCall = 0;
    mocks.insertReturning.mockImplementation(() => {
      insertCall++;
      return [{ id: `uuid-${insertCall}`, name: `Task ${insertCall}` }];
    });

    const parseResult: OrchestratorParseResult = {
      success: true,
      action: 'decompose_and_assign',
      tasks: [
        { id: 'T1', name: 'API', description: 'Build', agent: 'backend', priority: 'medium', dependencies: [] },
      ],
      questions: [],
      statusUpdates: [],
      fileLocks: [],
    };

    await executeOrchestratorCommands(PROJECT_ID, PARENT_TASK_ID, parseResult);

    // Only task inserts, no question inserts
    const questionInserts = insertCalls.filter(c => c.values.askedByAgent === 'orchestrator');
    expect(questionInserts).toHaveLength(0);
  });

  it('notes downstream dependencies in the human question', async () => {
    let insertCall = 0;
    mocks.insertReturning.mockImplementation(() => {
      insertCall++;
      return [{ id: `uuid-${insertCall}`, name: `Task ${insertCall}` }];
    });

    const parseResult: OrchestratorParseResult = {
      success: true,
      action: 'decompose_and_assign',
      tasks: [
        { id: 'TASK-001', name: 'Infra setup', description: 'Terraform', agent: 'devops', priority: 'medium', dependencies: [] },
        { id: 'TASK-002', name: 'Deploy app', description: 'Deploy after infra', agent: 'qa', priority: 'medium', dependencies: ['TASK-001'] },
      ],
      questions: [],
      statusUpdates: [],
      fileLocks: [],
    };

    await executeOrchestratorCommands(PROJECT_ID, PARENT_TASK_ID, parseResult);

    const questionInserts = insertCalls.filter(c => c.values.askedByAgent === 'orchestrator');
    expect(questionInserts).toHaveLength(1);
    // Question should mention that TASK-002 depended on the rejected task
    expect(questionInserts[0].values.question).toContain('TASK-002');
  });
});
