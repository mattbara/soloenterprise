/**
 * Tests for Rate Limit Guard
 *
 * Validates detection of rate limit / credit limit errors,
 * queue pause/resume behavior, attempt preservation, and human escalation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────

const mockPause = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockResume = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockEnqueueTask = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const mockDbUpdate = vi.hoisted(() => vi.fn());
const mockDbInsert = vi.hoisted(() => vi.fn());
const mockDbQueryFind = vi.hoisted(() => vi.fn());

vi.mock('../../queue/task-queue', () => ({
  QUEUE_NAMES: {
    orchestrator: 'orchestrator-tasks',
    backend: 'backend-tasks',
    frontend: 'frontend-tasks',
    qa: 'qa-tasks',
    devops: 'devops-tasks',
    feedback: 'feedback-tasks',
    scoper: 'scoper-tasks',
    'client-reporter': 'client-reporter-tasks',
  },
  getQueue: () => ({
    pause: mockPause,
    resume: mockResume,
  }),
  enqueueTask: mockEnqueueTask,
}));

vi.mock('@soloenterprise/db', () => ({
  db: {
    query: {
      tasks: {
        findFirst: mockDbQueryFind,
      },
    },
    update: mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    insert: mockDbInsert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

vi.mock('@soloenterprise/db/schema', () => ({
  tasks: { id: 'id' },
  questions: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ field: a, value: b })),
}));

import {
  isRateLimitError,
  handleRateLimit,
  getRateLimitState,
  resetRateLimitGuard,
  resumeAllQueues,
} from '../rate-limit-guard';

const QUEUE_COUNT = 8; // Number of queues in QUEUE_NAMES

const fakeTask = {
  id: 'task-1',
  projectId: 'proj-1',
  name: 'Test Task',
  agentType: 'backend',
  attemptCount: 1,
  context: {},
};

describe('isRateLimitError', () => {
  it('detects HTTP 429 as rate-limit', () => {
    expect(isRateLimitError('429 Too Many Requests')).toBe('rate-limit');
  });

  it('detects "rate limit" text as rate-limit', () => {
    expect(isRateLimitError('You hit the rate limit for this endpoint')).toBe('rate-limit');
  });

  it('detects rate_limit_error as rate-limit', () => {
    expect(isRateLimitError('{"type":"error","error":{"type":"rate_limit_error"}}')).toBe('rate-limit');
  });

  it('detects "too many requests" as rate-limit', () => {
    expect(isRateLimitError('Error: too many requests, please slow down')).toBe('rate-limit');
  });

  it('detects credit balance error as credit-limit', () => {
    expect(isRateLimitError('Your credit balance is too low to access the Anthropic API.')).toBe('credit-limit');
  });

  it('detects usage limit as credit-limit', () => {
    expect(isRateLimitError('You have reached your specified API usage limits')).toBe('credit-limit');
  });

  it('detects billing error as credit-limit', () => {
    expect(isRateLimitError('Payment required — billing issue on your account')).toBe('credit-limit');
  });

  it('detects quota exceeded as credit-limit', () => {
    expect(isRateLimitError('API quota exceeded for this month')).toBe('credit-limit');
  });

  it('returns null for non-rate-limit errors', () => {
    expect(isRateLimitError('Connection refused ECONNREFUSED')).toBeNull();
  });

  it('returns null for generic errors', () => {
    expect(isRateLimitError('Something unexpected happened')).toBeNull();
  });

  it('is case insensitive', () => {
    expect(isRateLimitError('RATE LIMIT exceeded')).toBe('rate-limit');
    expect(isRateLimitError('BILLING issue')).toBe('credit-limit');
  });

  it('prioritizes credit-limit over rate-limit when both match', () => {
    // "billing" matches credit-limit, "429" matches rate-limit — credit checked first
    expect(isRateLimitError('billing issue caused 429')).toBe('credit-limit');
  });
});

describe('handleRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetRateLimitGuard();
    vi.clearAllMocks();
    mockDbQueryFind.mockResolvedValue(fakeTask);
  });

  afterEach(() => {
    resetRateLimitGuard();
    vi.useRealTimers();
  });

  it('pauses all queues on first rate limit', async () => {
    await handleRateLimit('task-1', 'backend', '429 Too Many Requests', 'rate-limit');

    expect(mockPause).toHaveBeenCalledTimes(QUEUE_COUNT);
    expect(getRateLimitState().isPaused).toBe(true);
  });

  it('does NOT call pause again when already paused (idempotent)', async () => {
    await handleRateLimit('task-1', 'backend', '429 Too Many Requests', 'rate-limit');
    expect(mockPause).toHaveBeenCalledTimes(QUEUE_COUNT);

    mockPause.mockClear();
    await handleRateLimit('task-2', 'frontend', '429 Too Many Requests', 'rate-limit');
    expect(mockPause).not.toHaveBeenCalled();
  });

  it('re-enqueues the task with 60s delay for rate-limit', async () => {
    await handleRateLimit('task-1', 'backend', '429 rate limit', 'rate-limit');

    expect(mockEnqueueTask).toHaveBeenCalledWith('task-1', 'backend', 'medium', 60_000);
  });

  it('re-enqueues the task with 180s delay for credit-limit', async () => {
    await handleRateLimit('task-1', 'backend', 'credit balance is too low', 'credit-limit');

    expect(mockEnqueueTask).toHaveBeenCalledWith('task-1', 'backend', 'medium', 180_000);
  });

  it('does NOT increment attemptCount (resets to pending)', async () => {
    await handleRateLimit('task-1', 'backend', '429', 'rate-limit');

    // The db.update should set status to 'pending', NOT call markTaskFailed
    expect(mockDbUpdate).toHaveBeenCalled();
    const setCall = mockDbUpdate.mock.results[0]?.value.set;
    expect(setCall).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending' })
    );
  });

  it('records rate limit hit in task context', async () => {
    await handleRateLimit('task-1', 'backend', '429 Too Many Requests', 'rate-limit');

    const setCall = mockDbUpdate.mock.results[0]?.value.set;
    const setArg = setCall.mock.calls[0][0];
    expect(setArg.context.rateLimitHits).toHaveLength(1);
    expect(setArg.context.rateLimitHits[0].type).toBe('rate-limit');
  });

  it('resumes all queues after delay elapses', async () => {
    await handleRateLimit('task-1', 'backend', '429', 'rate-limit');
    expect(getRateLimitState().isPaused).toBe(true);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(mockResume).toHaveBeenCalledTimes(QUEUE_COUNT);
    expect(getRateLimitState().isPaused).toBe(false);
    expect(getRateLimitState().consecutiveHits).toBe(0);
  });

  it('extends resume timer when a longer delay arrives', async () => {
    // First: rate-limit (60s)
    await handleRateLimit('task-1', 'backend', '429', 'rate-limit');
    expect(getRateLimitState().resumeScheduledFor).toBeTruthy();

    // Second: credit-limit (180s) — should extend
    const beforeSchedule = getRateLimitState().resumeScheduledFor!;
    await handleRateLimit('task-2', 'frontend', 'credit balance is too low', 'credit-limit');
    expect(getRateLimitState().resumeScheduledFor!).toBeGreaterThan(beforeSchedule);
  });

  it('creates human escalation question at 5 consecutive hits', async () => {
    for (let i = 0; i < 5; i++) {
      await handleRateLimit(`task-${i}`, 'backend', '429', 'rate-limit');
    }

    // db.insert should have been called once for the question
    expect(mockDbInsert).toHaveBeenCalledTimes(1);
    expect(getRateLimitState().consecutiveHits).toBe(5);
  });

  it('does NOT create human escalation before threshold', async () => {
    for (let i = 0; i < 4; i++) {
      await handleRateLimit(`task-${i}`, 'backend', '429', 'rate-limit');
    }

    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it('creates human escalation only once (not on every hit after 5)', async () => {
    for (let i = 0; i < 8; i++) {
      await handleRateLimit(`task-${i}`, 'backend', '429', 'rate-limit');
    }

    expect(mockDbInsert).toHaveBeenCalledTimes(1);
  });

  it('tracks consecutive hits across different agent types', async () => {
    await handleRateLimit('task-1', 'backend', '429', 'rate-limit');
    await handleRateLimit('task-2', 'frontend', '429', 'rate-limit');
    await handleRateLimit('task-3', 'qa', '429', 'rate-limit');

    expect(getRateLimitState().consecutiveHits).toBe(3);
  });
});

describe('resumeAllQueues', () => {
  beforeEach(() => {
    resetRateLimitGuard();
    vi.clearAllMocks();
  });

  it('calls resume on all queues', async () => {
    await resumeAllQueues();
    expect(mockResume).toHaveBeenCalledTimes(QUEUE_COUNT);
  });

  it('resets all state after resume', async () => {
    // Dirty the state
    mockDbQueryFind.mockResolvedValue(fakeTask);
    vi.useFakeTimers();
    await handleRateLimit('task-1', 'backend', '429', 'rate-limit');
    expect(getRateLimitState().isPaused).toBe(true);

    await resumeAllQueues();

    const state = getRateLimitState();
    expect(state.isPaused).toBe(false);
    expect(state.pausedAt).toBeNull();
    expect(state.consecutiveHits).toBe(0);
    expect(state.resumeScheduledFor).toBeNull();

    vi.useRealTimers();
  });
});

describe('resetRateLimitGuard', () => {
  it('resets state for test cleanup', () => {
    resetRateLimitGuard();
    const state = getRateLimitState();
    expect(state.isPaused).toBe(false);
    expect(state.pausedAt).toBeNull();
    expect(state.consecutiveHits).toBe(0);
    expect(state.resumeScheduledFor).toBeNull();
  });
});
