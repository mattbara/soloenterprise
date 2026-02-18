/**
 * Error Classifier
 *
 * 3-tier classification: retryable (transient) → non-retryable (permanent) → escalate (billing/quota).
 * Used by the worker to decide whether a failed task should be auto-retried,
 * immediately failed, or escalated to human review.
 */

/** Patterns that indicate transient, retryable errors */
const RETRYABLE_PATTERNS = [
  // Network/connection errors
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EAI_AGAIN',        // DNS resolution failure (transient)
  'Connection error',
  'connection error',
  'socket hang up',
  'network timeout',
  'fetch failed',

  // HTTP 429 rate limiting (Wave 4 will intercept these before retry via rate-limit-guard)
  'rate limit',
  'too many requests',
  '429',

  // HTTP 5xx server errors
  'Internal Server Error',
  '500',
  '502',
  '503',
  '504',
  'Bad Gateway',
  'Service Unavailable',
  'Gateway Timeout',

  // Anthropic API transient errors
  'overloaded',
  'temporarily unavailable',
  'server_error',
] as const;

/** Patterns that require immediate escalation to human — retrying won't help and the account needs attention */
const ESCALATE_PATTERNS = [
  'credit balance is too low',
  'usage limit',
  'billing',
  'quota exceeded',
  'You have reached your specified API usage limits',
] as const;

/** Patterns that indicate permanent, non-retryable errors */
const NON_RETRYABLE_PATTERNS = [
  // Authentication/authorization errors
  'invalid api key',
  'invalid_api_key',
  'unauthorized',
  'forbidden',
  '401',
  '403',

  // Client errors that won't fix themselves
  'invalid_request_error',
  '404',
  'not found',
] as const;

export interface ErrorClassification {
  retryable: boolean;
  reason: string;
  category: 'transient' | 'permanent' | 'escalate' | 'unknown';
}

/**
 * Classify an error message into one of three tiers.
 *
 * Priority order:
 * 1. Escalate patterns (billing/quota — needs human attention, not retries)
 * 2. Non-retryable patterns (auth errors, client errors — permanent failures)
 * 3. Retryable patterns (network, 5xx, rate limits — transient)
 * 4. Unknown — defaults to retryable
 */
export function classifyError(errorMessage: string): ErrorClassification {
  const lower = errorMessage.toLowerCase();

  // Check escalate patterns first (highest priority — account-level issues)
  for (const pattern of ESCALATE_PATTERNS) {
    if (lower.includes(pattern.toLowerCase())) {
      return {
        retryable: false,
        reason: `Matches escalate pattern: "${pattern}"`,
        category: 'escalate',
      };
    }
  }

  // Check non-retryable patterns (permanent failures)
  for (const pattern of NON_RETRYABLE_PATTERNS) {
    if (lower.includes(pattern.toLowerCase())) {
      return {
        retryable: false,
        reason: `Matches non-retryable pattern: "${pattern}"`,
        category: 'permanent',
      };
    }
  }

  // Check retryable patterns
  for (const pattern of RETRYABLE_PATTERNS) {
    if (lower.includes(pattern.toLowerCase())) {
      return {
        retryable: true,
        reason: `Matches retryable pattern: "${pattern}"`,
        category: 'transient',
      };
    }
  }

  // Unknown errors default to retryable (better to retry once than to give up)
  return {
    retryable: true,
    reason: 'Unknown error type — defaulting to retryable',
    category: 'unknown',
  };
}

/**
 * Convenience function: is this error retryable?
 */
export function isRetryableError(errorMessage: string): boolean {
  return classifyError(errorMessage).retryable;
}

/**
 * Calculate backoff delay for a retry attempt.
 * Uses exponential backoff: 30s, 60s, 120s, ...
 */
export function getRetryDelay(attemptNumber: number): number {
  const baseDelay = 30_000; // 30 seconds
  return baseDelay * Math.pow(2, attemptNumber - 1);
}
