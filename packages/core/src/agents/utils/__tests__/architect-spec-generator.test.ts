/**
 * Tests for architect-spec-generator.ts
 *
 * Verifies that:
 * - ALL tasks get specs (no silent skipping based on profile)
 * - Root/foundational tasks (0 deps) get the foundational prompt enhancement
 * - Tasks with dependencies get dependency artifact context
 * - Tasks that already have specs are skipped
 * - API failures degrade gracefully (return null, don't throw)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — hoisted so vi.mock factories can reference them
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  taskFindFirst: vi.fn(),
  taskFindMany: vi.fn(),
  messagesCreate: vi.fn(),
}));

const capturedUpdates: Array<Record<string, unknown>> = [];

vi.mock('@soloenterprise/db', () => ({
  db: {
    query: {
      tasks: {
        findFirst: mocks.taskFindFirst,
        findMany: mocks.taskFindMany,
      },
    },
    update: () => ({
      set: (data: any) => {
        capturedUpdates.push(data);
        return {
          where: vi.fn().mockResolvedValue(undefined),
        };
      },
    }),
  },
}));

vi.mock('@soloenterprise/db/schema', () => ({
  tasks: { id: 'id', projectId: 'project_id' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: any[]) => args),
  inArray: vi.fn((...args: any[]) => args),
}));

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: mocks.messagesCreate };
    },
  };
});

vi.mock('../context-profiles', () => ({
  selectContextProfile: vi.fn(() => 'simple-endpoint'),
}));

vi.mock('../artifact-summarizer', () => ({
  summarizeArtifact: vi.fn(),
  shouldSummarize: vi.fn(() => false),
  estimateTokens: vi.fn(() => 100),
}));

// Mock fs — include appendFileSync and mkdirSync for TaskLogger
vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readdirSync: vi.fn(() => []),
  statSync: vi.fn(),
  readFileSync: vi.fn(() => ''),
  appendFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { generateTechSpec } from '../architect-spec-generator';
import { selectContextProfile } from '../context-profiles';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides: Partial<{
  id: string;
  name: string;
  description: string;
  agentType: string;
  projectId: string;
  technicalSpec: string | null;
  dependsOn: string[];
  context: Record<string, unknown>;
  status: string;
}> = {}) {
  return {
    id: overrides.id ?? 'task-001',
    name: overrides.name ?? 'Build animation component',
    description: overrides.description ?? 'Create shared animation utilities',
    agentType: overrides.agentType ?? 'frontend',
    projectId: overrides.projectId ?? 'proj-001',
    technicalSpec: overrides.technicalSpec ?? null,
    dependsOn: overrides.dependsOn ?? [],
    context: overrides.context ?? {},
    status: overrides.status ?? 'pending',
  };
}

function mockApiResponse(specText: string) {
  mocks.messagesCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text: specText }],
    usage: { input_tokens: 500, output_tokens: 300 },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateTechSpec', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedUpdates.length = 0;
    // Required: getArchitectClient() checks this before creating the Anthropic instance
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('generates spec for root task with 0 dependencies', async () => {
    const task = makeTask({ dependsOn: [] });
    mocks.taskFindFirst.mockResolvedValueOnce(task);
    mockApiResponse('## Objective\nBuild shared animation component.');

    const result = await generateTechSpec('task-001');

    expect(result).not.toBeNull();
    expect(result!.spec).toContain('Objective');
    expect(result!.tokens).toBe(800); // 500 + 300

    // Verify spec was saved to DB
    expect(capturedUpdates).toHaveLength(1);
    expect(capturedUpdates[0].technicalSpec).toBeTruthy();
    expect(capturedUpdates[0].techSpecGeneratedAt).toBeInstanceOf(Date);
  });

  it('generates spec for simple-endpoint profile with 0 deps (THE BUG FIX)', async () => {
    const task = makeTask({ dependsOn: [] });
    mocks.taskFindFirst.mockResolvedValueOnce(task);
    (selectContextProfile as ReturnType<typeof vi.fn>).mockReturnValueOnce('simple-endpoint');
    mockApiResponse('Simple endpoint spec here');

    const result = await generateTechSpec('task-001');

    // Must NOT be null — this was the bug (needsSpec was false for simple-endpoint + 0 deps)
    expect(result).not.toBeNull();
    expect(result!.spec).toBe('Simple endpoint spec here');
  });

  it('generates spec for bug-fix profile with 0 deps (THE BUG FIX)', async () => {
    const task = makeTask({ description: 'Fix animation timing bug', dependsOn: [] });
    mocks.taskFindFirst.mockResolvedValueOnce(task);
    (selectContextProfile as ReturnType<typeof vi.fn>).mockReturnValueOnce('bug-fix');
    mockApiResponse('Bug fix spec');

    const result = await generateTechSpec('task-001');

    // Must NOT be null — this was also skipped before
    expect(result).not.toBeNull();
    expect(result!.spec).toBe('Bug fix spec');
  });

  it('includes foundational task note in prompt for 0-dep tasks', async () => {
    const task = makeTask({ dependsOn: [] });
    mocks.taskFindFirst.mockResolvedValueOnce(task);
    mockApiResponse('Spec with foundational context');

    await generateTechSpec('task-001');

    const apiCall = mocks.messagesCreate.mock.calls[0][0];
    const userMessage = apiCall.messages[0].content;
    expect(userMessage).toContain('Foundational Task');
    expect(userMessage).toContain('No Upstream Dependencies');
    expect(userMessage).toContain('public API contract');
    expect(userMessage).toContain('List every export');
  });

  it('does NOT include foundational task note when task has dependencies', async () => {
    const task = makeTask({ dependsOn: ['dep-001'] });
    mocks.taskFindFirst.mockResolvedValueOnce(task);
    mocks.taskFindMany.mockResolvedValueOnce([]); // dep tasks query returns no completed deps
    mockApiResponse('Spec with dep context');

    await generateTechSpec('task-001');

    const apiCall = mocks.messagesCreate.mock.calls[0][0];
    const userMessage = apiCall.messages[0].content;
    expect(userMessage).not.toContain('Foundational Task');
  });

  it('skips if task already has a spec', async () => {
    const task = makeTask({ technicalSpec: 'existing spec' });
    mocks.taskFindFirst.mockResolvedValueOnce(task);

    const result = await generateTechSpec('task-001');

    expect(result).toBeNull();
    expect(mocks.messagesCreate).not.toHaveBeenCalled();
  });

  it('returns null if task not found', async () => {
    mocks.taskFindFirst.mockResolvedValueOnce(null);

    const result = await generateTechSpec('nonexistent');

    expect(result).toBeNull();
    expect(mocks.messagesCreate).not.toHaveBeenCalled();
  });

  it('returns null on API failure without throwing', async () => {
    const task = makeTask({ dependsOn: [] });
    mocks.taskFindFirst.mockResolvedValueOnce(task);
    mocks.messagesCreate.mockRejectedValueOnce(new Error('API timeout'));

    const result = await generateTechSpec('task-001');

    expect(result).toBeNull();
    expect(capturedUpdates).toHaveLength(0);
  });

  it('returns null on empty API response', async () => {
    const task = makeTask({ dependsOn: [] });
    mocks.taskFindFirst.mockResolvedValueOnce(task);
    mocks.messagesCreate.mockResolvedValueOnce({
      content: [],
      usage: { input_tokens: 100, output_tokens: 0 },
    });

    const result = await generateTechSpec('task-001');

    expect(result).toBeNull();
  });

  it('still works for database-task profile (already worked before)', async () => {
    const task = makeTask({ description: 'Create user table migration', dependsOn: [] });
    mocks.taskFindFirst.mockResolvedValueOnce(task);
    (selectContextProfile as ReturnType<typeof vi.fn>).mockReturnValueOnce('database-task');
    mockApiResponse('Database migration spec');

    const result = await generateTechSpec('task-001');

    expect(result).not.toBeNull();
    expect(result!.spec).toBe('Database migration spec');
  });

  it('still works for full-feature profile with deps (already worked before)', async () => {
    const task = makeTask({ dependsOn: ['dep-1', 'dep-2'] });
    mocks.taskFindFirst.mockResolvedValueOnce(task);
    (selectContextProfile as ReturnType<typeof vi.fn>).mockReturnValueOnce('full-feature');
    mocks.taskFindMany.mockResolvedValueOnce([]); // no completed deps
    mockApiResponse('Full feature spec');

    const result = await generateTechSpec('task-001');

    expect(result).not.toBeNull();
    expect(result!.spec).toBe('Full feature spec');
  });
});
