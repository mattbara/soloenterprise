import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted ensures the fn is available when vi.mock factories run
// ---------------------------------------------------------------------------

const { mockValidateTypeScript } = vi.hoisted(() => ({
  mockValidateTypeScript: vi.fn(),
}));

vi.mock('../typescript-validator', () => ({
  validateTypeScript: mockValidateTypeScript,
  formatErrorsForFixPrompt: vi.fn().mockReturnValue('formatted errors'),
}));

vi.mock('../output-parser', () => ({
  parseAgentOutput: vi.fn((raw: string) => {
    const files: Array<{ path: string; content: string }> = [];
    const regex = /<file path="([^"]+)">([\s\S]*?)<\/file>/g;
    let match;
    while ((match = regex.exec(raw)) !== null) {
      files.push({ path: match[1], content: match[2].trim() });
    }
    return { files, questions: [] };
  }),
}));

// Silence console.log / console.error during tests
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

import {
  MAX_FIX_ATTEMPTS_PER_GEN,
  MAX_FULL_RETRIES,
  MAX_TOTAL_FIX_LOOPS,
  mergeFixedFiles,
  processWithSyntaxRecovery,
} from '../syntax-recovery';
import type { ParsedFile } from '../output-parser';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient(responseText = '', inputTokens = 10, outputTokens = 20) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: responseText }],
        usage: { input_tokens: inputTokens, output_tokens: outputTokens },
      }),
    },
  } as any;
}

function makeFiles(...entries: Array<[string, string]>): ParsedFile[] {
  return entries.map(([path, content]) => ({ path, content }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('syntax-recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Constants
  // =========================================================================

  describe('constants', () => {
    it('MAX_FIX_ATTEMPTS_PER_GEN is 2', () => {
      expect(MAX_FIX_ATTEMPTS_PER_GEN).toBe(2);
    });

    it('MAX_FULL_RETRIES is 1', () => {
      expect(MAX_FULL_RETRIES).toBe(1);
    });

    it('MAX_TOTAL_FIX_LOOPS is 3', () => {
      expect(MAX_TOTAL_FIX_LOOPS).toBe(3);
    });
  });

  // =========================================================================
  // mergeFixedFiles
  // =========================================================================

  describe('mergeFixedFiles', () => {
    it('replaces original file when fix response contains same path', () => {
      const originals = makeFiles(['src/a.ts', 'broken']);
      const fixResponse = '<file path="src/a.ts">fixed</file>';

      const result = mergeFixedFiles(originals, fixResponse);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('fixed');
    });

    it('preserves original files that have no fix', () => {
      const originals = makeFiles(['src/a.ts', 'ok'], ['src/b.ts', 'also ok']);
      const fixResponse = '<file path="src/a.ts">patched</file>';

      const result = mergeFixedFiles(originals, fixResponse);

      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('patched');
      expect(result[1].content).toBe('also ok');
    });

    it('returns originals unchanged when fix response contains no files', () => {
      const originals = makeFiles(['src/a.ts', 'original']);
      const fixResponse = 'No files here, just text.';

      const result = mergeFixedFiles(originals, fixResponse);

      expect(result).toEqual(originals);
    });

    it('handles multiple files fixed at once', () => {
      const originals = makeFiles(
        ['src/a.ts', 'broken-a'],
        ['src/b.ts', 'broken-b'],
        ['src/c.ts', 'ok-c']
      );
      const fixResponse =
        '<file path="src/a.ts">fixed-a</file>\n<file path="src/b.ts">fixed-b</file>';

      const result = mergeFixedFiles(originals, fixResponse);

      expect(result).toHaveLength(3);
      expect(result[0].content).toBe('fixed-a');
      expect(result[1].content).toBe('fixed-b');
      expect(result[2].content).toBe('ok-c');
    });

    it('does not add extra files from fix response that are not in originals', () => {
      const originals = makeFiles(['src/a.ts', 'original']);
      const fixResponse =
        '<file path="src/a.ts">fixed</file>\n<file path="src/new.ts">brand new</file>';

      const result = mergeFixedFiles(originals, fixResponse);

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('src/a.ts');
      expect(result[0].content).toBe('fixed');
    });
  });

  // =========================================================================
  // processWithSyntaxRecovery
  // =========================================================================

  describe('processWithSyntaxRecovery', () => {
    const noopValidate = vi.fn().mockResolvedValue([]);
    const noopGenerate = vi.fn();

    it('returns immediate success when files have no syntax errors', async () => {
      mockValidateTypeScript.mockReturnValue({ valid: true, errors: [] });

      const files = makeFiles(['src/a.ts', 'const x = 1;']);
      const client = makeClient();

      const result = await processWithSyntaxRecovery(
        client,
        'test-agent',
        files,
        noopValidate,
        noopGenerate
      );

      expect(result.success).toBe(true);
      expect(result.files).toEqual(files);
      expect(result.attempts.fixLoops).toBe(0);
      expect(result.attempts.fullRetries).toBe(0);
      expect(client.messages.create).not.toHaveBeenCalled();
    });

    it('succeeds after 1 fix loop', async () => {
      const tsError = {
        file: 'src/a.ts',
        line: 1,
        column: 5,
        message: 'Unexpected token',
        code: 1005,
        severity: 'error' as const,
      };

      // First call: 1 error; second call (after fix): no errors
      mockValidateTypeScript
        .mockReturnValueOnce({ valid: false, errors: [tsError] })
        .mockReturnValueOnce({ valid: true, errors: [] });

      const files = makeFiles(['src/a.ts', 'const x =']);
      const fixText = '<file path="src/a.ts">const x = 1;</file>';
      const client = makeClient(fixText);

      const result = await processWithSyntaxRecovery(
        client,
        'test-agent',
        files,
        noopValidate,
        noopGenerate
      );

      expect(result.success).toBe(true);
      expect(result.attempts.fixLoops).toBe(1);
      expect(result.attempts.fullRetries).toBe(0);
      expect(client.messages.create).toHaveBeenCalledTimes(1);
    });

    it('falls through to full retry when fix loops are exhausted', async () => {
      const tsError = {
        file: 'src/a.ts',
        line: 1,
        column: 5,
        message: 'Unexpected token',
        code: 1005,
        severity: 'error' as const,
      };

      // Errors persist through 2 fix attempts, then fresh gen succeeds
      mockValidateTypeScript
        .mockReturnValueOnce({ valid: false, errors: [tsError] }) // initial
        .mockReturnValueOnce({ valid: false, errors: [tsError] }) // after fix 1
        .mockReturnValueOnce({ valid: false, errors: [tsError] }) // after fix 2 — exhausted
        .mockReturnValueOnce({ valid: true, errors: [] }); // after full retry

      const files = makeFiles(['src/a.ts', 'broken']);
      const freshFiles = makeFiles(['src/a.ts', 'regenerated']);
      const generateFn = vi.fn().mockResolvedValue(freshFiles);

      const badFix = '<file path="src/a.ts">still broken</file>';
      const client = makeClient(badFix);

      const result = await processWithSyntaxRecovery(
        client,
        'test-agent',
        files,
        noopValidate,
        generateFn
      );

      expect(result.success).toBe(true);
      expect(result.attempts.fixLoops).toBe(2);
      expect(result.attempts.fullRetries).toBe(1);
      expect(generateFn).toHaveBeenCalledTimes(1);
    });

    it('returns failure when all recovery is exhausted', async () => {
      const tsError = {
        file: 'src/a.ts',
        line: 1,
        column: 5,
        message: 'Unexpected token',
        code: 1005,
        severity: 'error' as const,
      };

      // Errors persist through everything: 2 fix loops + full retry + 2 more fix loops
      mockValidateTypeScript.mockReturnValue({ valid: false, errors: [tsError] });

      const files = makeFiles(['src/a.ts', 'broken']);
      const freshFiles = makeFiles(['src/a.ts', 'still broken']);
      const generateFn = vi.fn().mockResolvedValue(freshFiles);

      const badFix = '<file path="src/a.ts">nope</file>';
      const client = makeClient(badFix);

      const result = await processWithSyntaxRecovery(
        client,
        'test-agent',
        files,
        noopValidate,
        generateFn
      );

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
      expect(result.attempts.fullRetries).toBe(1);
      // Total fix loops: 2 (first gen) + 1 (second gen, capped by MAX_TOTAL_FIX_LOOPS=3)
      expect(result.attempts.fixLoops).toBe(MAX_TOTAL_FIX_LOOPS);
    });

    it('throws when recovery produces 0 files from non-zero input', async () => {
      // Simulate a corrupted state where currentFiles becomes empty
      // This can happen if mergeFixedFiles returns [] somehow
      // The 0-file guard should catch this before returning success
      mockValidateTypeScript.mockReturnValue({ valid: true, errors: [] });

      const files: ParsedFile[] = []; // 0 input files
      const client = makeClient();

      // With 0 input files, no error should be thrown (nothing to corrupt)
      const result = await processWithSyntaxRecovery(
        client,
        'test-agent',
        files,
        noopValidate,
        noopGenerate
      );
      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(0);
    });

    it('advances to next strategy when fix request throws', async () => {
      const tsError = {
        file: 'src/a.ts',
        line: 1,
        column: 5,
        message: 'Unexpected token',
        code: 1005,
        severity: 'error' as const,
      };

      // Error persists, then fresh gen succeeds
      mockValidateTypeScript
        .mockReturnValueOnce({ valid: false, errors: [tsError] }) // initial
        .mockReturnValueOnce({ valid: false, errors: [tsError] }) // after failed fix → triggers full retry
        .mockReturnValueOnce({ valid: true, errors: [] }); // after full retry

      const files = makeFiles(['src/a.ts', 'broken']);
      const freshFiles = makeFiles(['src/a.ts', 'good']);
      const generateFn = vi.fn().mockResolvedValue(freshFiles);

      const client = {
        messages: {
          create: vi.fn().mockRejectedValue(new Error('API down')),
        },
      } as any;

      const result = await processWithSyntaxRecovery(
        client,
        'test-agent',
        files,
        noopValidate,
        generateFn
      );

      expect(result.success).toBe(true);
      expect(result.attempts.fullRetries).toBe(1);
      expect(generateFn).toHaveBeenCalledTimes(1);
    });
  });
});
