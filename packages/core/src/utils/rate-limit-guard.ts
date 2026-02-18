/**
 * Rate Limit Guard
 *
 * Detects Anthropic API rate limit (429) and credit limit errors,
 * pauses ALL queues simultaneously, re-enqueues the failing task
 * without burning a retry attempt, and resumes after a cooldown.
 *
 * This prevents the system from hammering a rate-limited API across
 * multiple queues — a single 429 pauses everything.
 */

import { db } from '@soloenterprise/db';
import { tasks, questions } from '@soloenterprise/db/schema';
import { eq } from 'drizzle-orm';
import { getQueue, enqueueTask, QUEUE_NAMES, type AgentType } from '../queue/task-queue';

// ── Detection ──────────────────────────────────────────────────────────

export type RateLimitType = 'rate-limit' | 'credit-limit';

const RATE_LIMIT_PATTERNS = [
  'rate limit',
  'too many requests',
  '429',
  'rate_limit_error',
] as const;

const CREDIT_LIMIT_PATTERNS = [
  'credit balance is too low',
  'usage limit',
  'you have reached your specified api usage limits',
  'billing',
  'quota exceeded',
] as const;

/**
 * Pure function — classify an error message as rate-limit, credit-limit, or null.
 * Returns null if the error is not rate/credit related (falls through to classifyError).
 */
export function isRateLimitError(errorMsg: string): RateLimitType | null {
  const lower = errorMsg.toLowerCase();

  for (const pattern of CREDIT_LIMIT_PATTERNS) {
    if (lower.includes(pattern)) {
      return 'credit-limit';
    }
  }

  for (const pattern of RATE_LIMIT_PATTERNS) {
    if (lower.includes(pattern)) {
      return 'rate-limit';
    }
  }

  return null;
}

// ── State ──────────────────────────────────────────────────────────────

export interface RateLimitState {
  isPaused: boolean;
  pausedAt: number | null;
  consecutiveHits: number;
  resumeScheduledFor: number | null;
}

let isPaused = false;
let pausedAt: number | null = null;
let consecutiveHits = 0;
let resumeTimer: ReturnType<typeof setTimeout> | null = null;
let resumeScheduledFor: number | null = null;
let humanEscalationSent = false;

const RATE_LIMIT_DELAY_MS = 60_000;   // 60s for 429
const CREDIT_LIMIT_DELAY_MS = 180_000; // 180s for credit limits
const HUMAN_ESCALATION_THRESHOLD = 5;

/** Read-only snapshot of current state (for monitoring / tests). */
export function getRateLimitState(): RateLimitState {
  return {
    isPaused,
    pausedAt,
    consecutiveHits,
    resumeScheduledFor,
  };
}

/** Reset all state — for test cleanup only. */
export function resetRateLimitGuard(): void {
  isPaused = false;
  pausedAt = null;
  consecutiveHits = 0;
  resumeScheduledFor = null;
  humanEscalationSent = false;
  if (resumeTimer) {
    clearTimeout(resumeTimer);
    resumeTimer = null;
  }
}

// ── Core Logic ─────────────────────────────────────────────────────────

/**
 * Pause all BullMQ queues. Idempotent — calling while already paused is a no-op.
 */
async function pauseAllQueues(): Promise<void> {
  if (isPaused) return;

  const agentTypes = Object.keys(QUEUE_NAMES) as AgentType[];
  const pausePromises = agentTypes.map(type => {
    try {
      return getQueue(type).pause();
    } catch (err) {
      console.error(`[RateLimitGuard] Failed to pause ${type} queue:`, err);
      return Promise.resolve();
    }
  });
  await Promise.all(pausePromises);

  isPaused = true;
  pausedAt = Date.now();
  console.log(`[RateLimitGuard] All ${agentTypes.length} queues paused`);
}

/**
 * Resume all BullMQ queues and reset guard state.
 * Exported so worker startup can call it as a safety net.
 */
export async function resumeAllQueues(): Promise<void> {
  const agentTypes = Object.keys(QUEUE_NAMES) as AgentType[];
  const resumePromises = agentTypes.map(type => {
    try {
      return getQueue(type).resume();
    } catch (err) {
      console.error(`[RateLimitGuard] Failed to resume ${type} queue:`, err);
      return Promise.resolve();
    }
  });
  await Promise.all(resumePromises);

  isPaused = false;
  pausedAt = null;
  consecutiveHits = 0;
  resumeScheduledFor = null;
  humanEscalationSent = false;
  if (resumeTimer) {
    clearTimeout(resumeTimer);
    resumeTimer = null;
  }
  console.log(`[RateLimitGuard] All ${agentTypes.length} queues resumed`);
}

/**
 * Schedule queue resume after a delay. If already scheduled with a shorter delay,
 * extend the timer to the new (longer) delay.
 */
function scheduleResume(delayMs: number): void {
  const newResumeTime = Date.now() + delayMs;

  // If a resume is already scheduled and the new one is sooner or equal, skip
  if (resumeScheduledFor && newResumeTime <= resumeScheduledFor) {
    return;
  }

  // Clear existing timer if extending
  if (resumeTimer) {
    clearTimeout(resumeTimer);
  }

  resumeScheduledFor = newResumeTime;
  resumeTimer = setTimeout(async () => {
    console.log(`[RateLimitGuard] Cooldown elapsed, resuming all queues...`);
    await resumeAllQueues();
  }, delayMs);

  console.log(`[RateLimitGuard] Resume scheduled in ${Math.round(delayMs / 1000)}s`);
}

/**
 * Handle a detected rate limit error.
 *
 * 1. Pauses all queues (idempotent)
 * 2. Resets the failing task to `pending` WITHOUT incrementing attemptCount
 * 3. Re-enqueues the task with a delay
 * 4. Schedules queue resume after cooldown
 * 5. At 5 consecutive hits, creates a human escalation question (once)
 */
export async function handleRateLimit(
  taskId: string,
  agentType: AgentType,
  errorMsg: string,
  limitType: RateLimitType,
): Promise<void> {
  consecutiveHits++;
  const delayMs = limitType === 'credit-limit' ? CREDIT_LIMIT_DELAY_MS : RATE_LIMIT_DELAY_MS;

  console.log(
    `[RateLimitGuard] ${limitType} detected (hit #${consecutiveHits}) for task ${taskId} ` +
    `on ${agentType} queue — ${errorMsg.substring(0, 120)}`
  );

  // 1. Pause all queues
  await pauseAllQueues();

  // 2. Reset task to pending without incrementing attemptCount
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
  });

  if (task) {
    // Record the rate limit in context for audit trail
    const rateLimitHits = (task.context as any)?.rateLimitHits ?? [];
    rateLimitHits.push({
      type: limitType,
      error: errorMsg.substring(0, 300),
      timestamp: new Date().toISOString(),
    });

    await db.update(tasks).set({
      status: 'pending',
      context: {
        ...(task.context as object),
        rateLimitHits,
      },
      updatedAt: new Date(),
    }).where(eq(tasks.id, taskId));
  }

  // 3. Re-enqueue with delay (enqueueTask sets status to 'queued')
  await enqueueTask(taskId, agentType, 'medium', delayMs);

  // 4. Schedule resume
  scheduleResume(delayMs);

  // 5. Human escalation at threshold (once)
  if (consecutiveHits >= HUMAN_ESCALATION_THRESHOLD && !humanEscalationSent && task) {
    humanEscalationSent = true;
    await db.insert(questions).values({
      projectId: task.projectId,
      taskId: task.id,
      question: `API ${limitType} detected ${consecutiveHits} times across queues. All queues are paused and will auto-resume, but persistent limits may need manual intervention.`,
      context: `Last error: ${errorMsg.substring(0, 300)}\n\nThis is an account-level issue affecting all agents, not a task-specific failure.`,
      askedByAgent: task.agentType,
      priority: 'blocking',
      isBlocking: false, // Non-blocking — queues will auto-resume, this is informational
      suggestedAnswers: [
        'Check API billing/quota',
        'Wait for rate limit to clear',
        'Reduce concurrent workers',
      ],
    });
    console.log(`[RateLimitGuard] Human escalation created after ${consecutiveHits} consecutive hits`);
  }
}
