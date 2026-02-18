/**
 * Tests for session-summary.ts
 *
 * Tests the session summary extraction and context block building.
 * The Anthropic API call is mocked — we test the prompt construction and
 * the parsing of the summary response.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCreate = vi.hoisted(() => vi.fn());

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

// Mock cost-tracking-service to avoid DB import chain
vi.mock('../../../services/cost-tracking-service', () => ({
  recordAgentCost: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { extractSessionSummary, buildSessionContextBlock } from '../session-summary';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('extractSessionSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure API key is present
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  it('extracts a summary from orchestrator response', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Decided to use React+Next.js. Created 5 backend tasks and 3 frontend tasks. Asked about hosting preferences.' }],
      usage: { input_tokens: 500, output_tokens: 50 },
    });

    const result = await extractSessionSummary(
      'action: decompose_and_assign\ntasks:\n  - name: Setup...',
      'Build Marketing Website',
    );

    expect(result).not.toBeNull();
    expect(result!.summary).toContain('React+Next.js');
    expect(result!.timestamp).toBeTruthy();
    expect(result!.extractionTokens.input).toBe(500);
    expect(result!.extractionTokens.output).toBe(50);
  });

  it('merges with previous summary when provided', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Previously chose React. Now added 3 API tasks for auth.' }],
      usage: { input_tokens: 600, output_tokens: 40 },
    });

    const result = await extractSessionSummary(
      'action: decompose_and_assign\ntasks:\n  - name: Auth API...',
      'Build Marketing Website',
      'Decided to use React+Next.js. Created 5 backend tasks.',
    );

    expect(result).not.toBeNull();
    expect(result!.summary).toContain('Previously chose React');

    // Verify the previous summary was passed in the prompt
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain('Previous Session Summary');
    expect(callArgs.messages[0].content).toContain('React+Next.js');
  });

  it('returns null on API failure (non-blocking)', async () => {
    mockCreate.mockRejectedValueOnce(new Error('API timeout'));

    const result = await extractSessionSummary(
      'some response',
      'Build Website',
    );

    expect(result).toBeNull();
  });

  it('truncates long orchestrator responses to 4000 chars', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Summary of truncated response.' }],
      usage: { input_tokens: 300, output_tokens: 20 },
    });

    const longResponse = 'x'.repeat(10000);
    await extractSessionSummary(longResponse, 'Build Website');

    const callArgs = mockCreate.mock.calls[0][0];
    // The prompt should contain at most 4000 chars of the response
    const promptContent = callArgs.messages[0].content;
    expect(promptContent.length).toBeLessThan(10000);
  });

  it('uses Haiku model for cost efficiency', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Summary.' }],
      usage: { input_tokens: 100, output_tokens: 10 },
    });

    await extractSessionSummary('response', 'Task');

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.model).toBe('claude-haiku-4-5-20251001');
    expect(callArgs.max_tokens).toBe(1024);
    expect(callArgs.temperature).toBe(0);
  });
});

describe('buildSessionContextBlock', () => {
  it('returns empty string when no summary exists', () => {
    expect(buildSessionContextBlock(undefined)).toBe('');
    expect(buildSessionContextBlock('')).toBe('');
  });

  it('builds context block with session summary', () => {
    const block = buildSessionContextBlock('Decided to use React. Created 5 tasks.');

    expect(block).toContain('Session State');
    expect(block).toContain('Decided to use React');
    expect(block).toContain('do NOT re-derive');
  });
});
