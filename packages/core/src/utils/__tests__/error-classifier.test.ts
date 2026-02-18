/**
 * Tests for Error Classifier
 *
 * Validates 3-tier error classification:
 * - transient (retryable): network, 5xx, rate limits
 * - permanent (non-retryable): auth errors, client errors
 * - escalate (non-retryable): billing/quota — needs human attention
 */

import { describe, it, expect } from 'vitest';
import { classifyError, isRetryableError, getRetryDelay } from '../error-classifier';

describe('classifyError', () => {
  describe('retryable (transient) errors', () => {
    it('classifies connection refused as retryable', () => {
      const result = classifyError('connect ECONNREFUSED 127.0.0.1:5432');
      expect(result.retryable).toBe(true);
      expect(result.category).toBe('transient');
    });

    it('classifies connection reset as retryable', () => {
      const result = classifyError('read ECONNRESET');
      expect(result.retryable).toBe(true);
      expect(result.category).toBe('transient');
    });

    it('classifies timeout as retryable', () => {
      const result = classifyError('connect ETIMEDOUT 10.0.0.1:443');
      expect(result.retryable).toBe(true);
      expect(result.category).toBe('transient');
    });

    it('classifies "Connection error" as retryable', () => {
      const result = classifyError('Connection error.');
      expect(result.retryable).toBe(true);
      expect(result.category).toBe('transient');
    });

    it('classifies socket hang up as retryable', () => {
      const result = classifyError('socket hang up');
      expect(result.retryable).toBe(true);
      expect(result.category).toBe('transient');
    });

    it('classifies HTTP 502 as retryable', () => {
      const result = classifyError('502 Bad Gateway');
      expect(result.retryable).toBe(true);
      expect(result.category).toBe('transient');
    });

    it('classifies HTTP 503 as retryable', () => {
      const result = classifyError('503 Service Unavailable');
      expect(result.retryable).toBe(true);
      expect(result.category).toBe('transient');
    });

    it('classifies HTTP 429 rate limit as retryable', () => {
      const result = classifyError('429 Too Many Requests');
      expect(result.retryable).toBe(true);
      expect(result.category).toBe('transient');
    });

    it('classifies Anthropic overloaded as retryable', () => {
      const result = classifyError('The API is temporarily overloaded, please retry');
      expect(result.retryable).toBe(true);
      expect(result.category).toBe('transient');
    });

    it('classifies DNS failure as retryable', () => {
      const result = classifyError('getaddrinfo EAI_AGAIN api.anthropic.com');
      expect(result.retryable).toBe(true);
      expect(result.category).toBe('transient');
    });
  });

  describe('escalate (billing/quota) errors', () => {
    it('classifies credit limit error as escalate', () => {
      const result = classifyError(
        '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}'
      );
      expect(result.retryable).toBe(false);
      expect(result.category).toBe('escalate');
    });

    it('classifies API usage limit as escalate', () => {
      const result = classifyError(
        '400 {"type":"error","error":{"type":"invalid_request_error","message":"You have reached your specified API usage limits. You will regain access on 2026-03-01."}}'
      );
      expect(result.retryable).toBe(false);
      expect(result.category).toBe('escalate');
    });

    it('classifies billing error as escalate', () => {
      const result = classifyError('Payment required — billing issue on your account');
      expect(result.retryable).toBe(false);
      expect(result.category).toBe('escalate');
    });

    it('classifies quota exceeded as escalate', () => {
      const result = classifyError('Request failed: quota exceeded for this billing period');
      expect(result.retryable).toBe(false);
      expect(result.category).toBe('escalate');
    });

    it('prioritizes escalate over non-retryable when both patterns match', () => {
      // Message contains "credit balance is too low" (escalate) AND "invalid_request_error" (non-retryable)
      const result = classifyError(
        '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low"}}'
      );
      expect(result.retryable).toBe(false);
      expect(result.category).toBe('escalate');
    });
  });

  describe('non-retryable (permanent) errors', () => {
    it('classifies invalid API key as non-retryable', () => {
      const result = classifyError('401 invalid_api_key');
      expect(result.retryable).toBe(false);
      expect(result.category).toBe('permanent');
    });

    it('classifies 403 forbidden as non-retryable', () => {
      const result = classifyError('403 Forbidden');
      expect(result.retryable).toBe(false);
      expect(result.category).toBe('permanent');
    });

    it('classifies invalid_request_error as non-retryable', () => {
      const result = classifyError('400 invalid_request_error: prompt is too long');
      expect(result.retryable).toBe(false);
      expect(result.category).toBe('permanent');
    });
  });

  describe('unknown errors', () => {
    it('defaults unknown errors to retryable', () => {
      const result = classifyError('Something completely unexpected happened');
      expect(result.retryable).toBe(true);
      expect(result.category).toBe('unknown');
    });
  });
});

describe('isRetryableError', () => {
  it('returns true for connection errors', () => {
    expect(isRetryableError('Connection error.')).toBe(true);
  });

  it('returns false for credit limit errors', () => {
    expect(isRetryableError('Your credit balance is too low')).toBe(false);
  });
});

describe('getRetryDelay', () => {
  it('returns 30s for first attempt', () => {
    expect(getRetryDelay(1)).toBe(30_000);
  });

  it('returns 60s for second attempt', () => {
    expect(getRetryDelay(2)).toBe(60_000);
  });

  it('returns 120s for third attempt', () => {
    expect(getRetryDelay(3)).toBe(120_000);
  });

  it('doubles delay with each attempt', () => {
    const delay1 = getRetryDelay(1);
    const delay2 = getRetryDelay(2);
    const delay3 = getRetryDelay(3);
    expect(delay2).toBe(delay1 * 2);
    expect(delay3).toBe(delay2 * 2);
  });
});
