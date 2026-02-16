/**
 * Tests for project-context-loader.ts
 *
 * Mocks all database queries and validates that buildProjectContext()
 * formats context strings correctly for various data scenarios.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Build a chainable query builder mock that is also thenable
// (Drizzle query builders can be awaited at any point in the chain)
function chainable(result: any[] = []) {
  const resultPromise = Promise.resolve(result);
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.groupBy = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue(result);
  chain.then = (resolve: any, reject: any) => resultPromise.then(resolve, reject);
  return chain;
}

// Holds the current mock chains for each sequential db.select() call
let selectCalls: any[] = [];
let selectIndex = 0;

// Use vi.hoisted so mockDb is available when vi.mock factory runs
const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    select: vi.fn(),
  };
  return { mockDb };
});

vi.mock('@soloenterprise/db', () => ({ db: mockDb }));

vi.mock('@soloenterprise/db/schema', () => ({
  projects: { id: 'id', name: 'name', description: 'description', status: 'status', createdAt: 'createdAt', completedAt: 'completedAt', currentMilestone: 'currentMilestone', clientId: 'clientId', scopeId: 'scopeId' },
  clients: { id: 'id', name: 'name', contactName: 'contactName', contactEmail: 'contactEmail' },
  tasks: { projectId: 'projectId', status: 'status', agentType: 'agentType' },
  milestones: { projectId: 'projectId', name: 'name', description: 'description', status: 'status', targetDate: 'targetDate', completedAt: 'completedAt', createdAt: 'createdAt' },
  projectScopes: { id: 'id', clientDocument: 'clientDocument', estimatedTasks: 'estimatedTasks', estimatedDuration: 'estimatedDuration', briefId: 'briefId', projectId: 'projectId' },
  questions: { projectId: 'projectId', question: 'question', createdAt: 'createdAt', priority: 'priority', status: 'status' },
  costTracking: { projectId: 'projectId', agentType: 'agentType', apiCostUsd: 'apiCostUsd', estimatedBillableHours: 'estimatedBillableHours', tokensInput: 'tokensInput', tokensOutput: 'tokensOutput' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: any[]) => args),
  and: vi.fn((...args: any[]) => args),
  sql: vi.fn((strings: TemplateStringsArray) => strings.join('')),
  desc: vi.fn((col: any) => col),
}));

import { buildProjectContext } from '../project-context-loader';

beforeEach(() => {
  vi.clearAllMocks();
  selectCalls = [];
  selectIndex = 0;
  mockDb.select.mockImplementation(() => {
    const chain = selectCalls[selectIndex] ?? chainable([]);
    selectIndex++;
    chain.select = vi.fn().mockReturnValue(chain);
    return chain;
  });
});

function setupSelectCalls(chains: any[]) {
  selectCalls = chains;
  selectIndex = 0;
}

describe('buildProjectContext', () => {
  it('returns error message for missing project', async () => {
    setupSelectCalls([chainable([])]);

    const result = await buildProjectContext('nonexistent-id');

    expect(result).toContain('not found');
  });

  it('builds full context with all sections', async () => {
    setupSelectCalls([
      // 1. Project query
      chainable([{
        name: 'Test Project',
        description: 'A test project',
        status: 'active',
        createdAt: new Date('2026-01-01'),
        completedAt: null,
        currentMilestone: 'Phase 1',
        clientId: 'client-1',
        scopeId: null,
      }]),
      // 2. Client query
      chainable([{
        name: 'Acme Corp',
        contactName: 'John Doe',
        contactEmail: 'john@acme.com',
      }]),
      // 3. Task summary query
      chainable([
        { status: 'completed', agentType: 'backend', count: 5 },
        { status: 'in_progress', agentType: 'frontend', count: 3 },
        { status: 'pending', agentType: 'backend', count: 2 },
      ]),
      // 4. Milestones query
      chainable([{
        name: 'Phase 1',
        description: 'Initial setup',
        status: 'completed',
        targetDate: '2026-02-01',
        completedAt: new Date('2026-01-28'),
      }]),
      // 5. Questions query
      chainable([{
        question: 'What color scheme should we use?',
        createdAt: new Date(Date.now() - 2 * 86400000), // 2 days ago
        priority: 'high',
      }]),
      // 6. Cost summary query
      chainable([
        { agentType: 'backend', totalCost: '1.50', totalHours: '3.0', totalInputTokens: 50000, totalOutputTokens: 25000 },
        { agentType: 'frontend', totalCost: '0.80', totalHours: '2.0', totalInputTokens: 30000, totalOutputTokens: 15000 },
      ]),
    ]);

    const result = await buildProjectContext('test-project-id');

    // Project details
    expect(result).toContain('Test Project');
    expect(result).toContain('active');
    expect(result).toContain('Phase 1');

    // Client info
    expect(result).toContain('Acme Corp');
    expect(result).toContain('John Doe');

    // Task summary
    expect(result).toContain('10 tasks');
    expect(result).toContain('completed');

    // Cost summary
    expect(result).toContain('$2.30');
    expect(result).toContain('backend');
  });

  it('handles empty project with zero tasks and costs', async () => {
    setupSelectCalls([
      // Project exists
      chainable([{
        name: 'Empty Project',
        description: null,
        status: 'active',
        createdAt: new Date('2026-02-01'),
        completedAt: null,
        currentMilestone: null,
        clientId: null,
        scopeId: null,
      }]),
      // No tasks
      chainable([]),
      // No milestones
      chainable([]),
      // No questions
      chainable([]),
      // No costs
      chainable([]),
    ]);

    const result = await buildProjectContext('empty-project');

    expect(result).toContain('Empty Project');
    expect(result).toContain('No tasks created yet');
    expect(result).not.toContain('undefined');
    expect(result).not.toContain('NaN');
  });

  it('shows fallback when project has no client', async () => {
    setupSelectCalls([
      chainable([{
        name: 'No Client Project',
        description: null,
        status: 'active',
        createdAt: new Date('2026-02-01'),
        completedAt: null,
        currentMilestone: null,
        clientId: null,
        scopeId: null,
      }]),
      chainable([]),
      chainable([]),
      chainable([]),
      chainable([]),
    ]);

    const result = await buildProjectContext('no-client-project');

    // Should not contain client section at all (no crash)
    expect(result).toContain('No Client Project');
    expect(result).not.toContain('Client:');
  });

  it('shows correct task counts by status', async () => {
    setupSelectCalls([
      chainable([{
        name: 'Task Project',
        description: null,
        status: 'active',
        createdAt: new Date('2026-02-01'),
        completedAt: null,
        currentMilestone: null,
        clientId: null,
        scopeId: null,
      }]),
      // Tasks: 5 completed, 3 in_progress, 2 pending = 10 total
      chainable([
        { status: 'completed', agentType: 'backend', count: 5 },
        { status: 'in_progress', agentType: 'frontend', count: 3 },
        { status: 'pending', agentType: 'qa', count: 2 },
      ]),
      chainable([]),
      chainable([]),
      chainable([]),
    ]);

    const result = await buildProjectContext('task-project');

    expect(result).toContain('Total: 10 tasks');
    expect(result).toContain('completed: 5');
    expect(result).toContain('in_progress: 3');
    expect(result).toContain('pending: 2');
  });

  it('shows blocking questions in context', async () => {
    setupSelectCalls([
      chainable([{
        name: 'Question Project',
        description: null,
        status: 'active',
        createdAt: new Date('2026-02-01'),
        completedAt: null,
        currentMilestone: null,
        clientId: null,
        scopeId: null,
      }]),
      chainable([]),
      chainable([]),
      // 2 pending questions
      chainable([
        { question: 'What API should we use?', createdAt: new Date(), priority: 'high' },
        { question: 'Preferred hosting provider?', createdAt: new Date(), priority: 'medium' },
      ]),
      chainable([]),
    ]);

    const result = await buildProjectContext('question-project');

    expect(result).toContain('Blocking Questions');
    expect(result).toContain('What API should we use?');
    expect(result).toContain('Preferred hosting provider?');
  });

  it('shows per-agent cost breakdown', async () => {
    setupSelectCalls([
      chainable([{
        name: 'Cost Project',
        description: null,
        status: 'active',
        createdAt: new Date('2026-02-01'),
        completedAt: null,
        currentMilestone: null,
        clientId: null,
        scopeId: null,
      }]),
      chainable([]),
      chainable([]),
      chainable([]),
      chainable([
        { agentType: 'backend', totalCost: '2.50', totalHours: '5.0', totalInputTokens: 100000, totalOutputTokens: 50000 },
        { agentType: 'frontend', totalCost: '1.20', totalHours: '3.0', totalInputTokens: 60000, totalOutputTokens: 30000 },
      ]),
    ]);

    const result = await buildProjectContext('cost-project');

    expect(result).toContain('Cost Summary');
    expect(result).toContain('$3.70'); // total
    expect(result).toContain('backend: $2.50');
    expect(result).toContain('frontend: $1.20');
  });
});
