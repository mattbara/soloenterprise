/**
 * Tests for TypeScript compiler validation.
 *
 * Validates that validateTypeScript() correctly detects syntax errors using
 * the real TypeScript compiler API (in-memory, syntax-only). Also tests
 * formatErrorsForFixPrompt() and hasSevereSyntaxErrors().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateTypeScript,
  formatErrorsForFixPrompt,
  hasSevereSyntaxErrors,
  TSValidationError,
} from '../typescript-validator';

// Suppress console output
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ============================================================================
// validateTypeScript
// ============================================================================

describe('validateTypeScript', () => {
  // --------------------------------------------------------------------------
  // 1. Valid TypeScript — returns valid: true, no errors
  // --------------------------------------------------------------------------
  it('returns valid: true for correct TypeScript', () => {
    const result = validateTypeScript([
      {
        path: 'example.ts',
        content: `
          const x: number = 42;
          function greet(name: string): string {
            return \`Hello, \${name}\`;
          }
          export { greet };
        `,
      },
    ]);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // --------------------------------------------------------------------------
  // 2. Valid TSX (JSX) — returns valid: true
  // --------------------------------------------------------------------------
  it('returns valid: true for correct TSX', () => {
    const result = validateTypeScript([
      {
        path: 'component.tsx',
        content: `
          interface Props { name: string; }
          export function Hello({ name }: Props) {
            return <div className="greeting">Hello, {name}</div>;
          }
        `,
      },
    ]);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // --------------------------------------------------------------------------
  // 3. Syntax error: unclosed parenthesis — returns error with correct file
  // --------------------------------------------------------------------------
  it('detects unclosed parenthesis and reports correct file', () => {
    const result = validateTypeScript([
      {
        path: 'broken.ts',
        content: `function foo(a: string {
  return a;
}`,
      },
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors[0].file).toBe('broken.ts');
  });

  // --------------------------------------------------------------------------
  // 4. Syntax error: unexpected token
  // --------------------------------------------------------------------------
  it('detects unexpected token errors', () => {
    const result = validateTypeScript([
      {
        path: 'bad-syntax.ts',
        content: `const x = @invalid;`,
      },
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  // --------------------------------------------------------------------------
  // 5. Multiple syntax errors across multiple files
  // --------------------------------------------------------------------------
  it('reports errors from multiple files', () => {
    const result = validateTypeScript([
      {
        path: 'file-a.ts',
        content: `function foo( { return 1; }`,
      },
      {
        path: 'file-b.ts',
        content: `const x: = 5;`,
      },
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);

    const filesWithErrors = new Set(result.errors.map((e) => e.file));
    expect(filesWithErrors.has('file-a.ts')).toBe(true);
    expect(filesWithErrors.has('file-b.ts')).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 6. Non-TS files (.css, .json) are skipped
  // --------------------------------------------------------------------------
  it('skips non-TypeScript files', () => {
    const result = validateTypeScript([
      {
        path: 'styles.css',
        content: `.broken { color: !!!red; }`,
      },
      {
        path: 'data.json',
        content: `{this is not valid json`,
      },
    ]);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // --------------------------------------------------------------------------
  // 7. Empty files array → valid: true
  // --------------------------------------------------------------------------
  it('returns valid: true for empty files array', () => {
    const result = validateTypeScript([]);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // --------------------------------------------------------------------------
  // 8. Error includes context (surrounding lines)
  // --------------------------------------------------------------------------
  it('includes context with surrounding lines in error', () => {
    const result = validateTypeScript([
      {
        path: 'with-context.ts',
        content: [
          'const a = 1;',
          'const b = 2;',
          'const c = 3;',
          'function broken( {',
          '  return 1;',
          '}',
          'const d = 4;',
        ].join('\n'),
      },
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);

    const error = result.errors[0];
    expect(error.context).toBeDefined();
    expect(error.context).toContain('>>>');
    // Context should include line numbers
    expect(error.context).toMatch(/\d+:/);
  });

  // --------------------------------------------------------------------------
  // 9. Error has correct line and column numbers
  // --------------------------------------------------------------------------
  it('reports correct 1-indexed line and column numbers', () => {
    // Error is on line 3 (1-indexed)
    const result = validateTypeScript([
      {
        path: 'line-check.ts',
        content: [
          'const a = 1;',    // line 1
          'const b = 2;',    // line 2
          'const c: = 3;',   // line 3 — syntax error at '='
        ].join('\n'),
      },
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);

    const error = result.errors[0];
    expect(error.line).toBe(3);
    expect(error.column).toBeGreaterThanOrEqual(1);
  });

  // --------------------------------------------------------------------------
  // 10. Valid complex code with generics, async/await, destructuring
  // --------------------------------------------------------------------------
  it('validates complex TypeScript with generics, async/await, destructuring', () => {
    const result = validateTypeScript([
      {
        path: 'complex.ts',
        content: `
          interface Result<T> {
            data: T;
            error?: string;
          }

          type Handler<T> = (input: T) => Promise<Result<T>>;

          async function processItems<T extends { id: string }>(
            items: T[],
            handler: Handler<T>
          ): Promise<Result<T>[]> {
            const results: Result<T>[] = [];

            for (const item of items) {
              const { data, error } = await handler(item);
              if (!error) {
                results.push({ data });
              }
            }

            const [first, ...rest] = results;
            const merged = { first, rest, count: results.length };

            return results;
          }

          const mapped = [1, 2, 3].map((n) => n * 2);
          const obj = { a: 1, b: 2, ...{ c: 3 } };
          const { a, ...remaining } = obj;

          export { processItems };
        `,
      },
    ]);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // --------------------------------------------------------------------------
  // Mixed: valid + invalid files
  // --------------------------------------------------------------------------
  it('only reports errors for broken files, not valid ones', () => {
    const result = validateTypeScript([
      {
        path: 'good.ts',
        content: `export const x = 1;`,
      },
      {
        path: 'bad.ts',
        content: `export const y: = ;`,
      },
    ]);

    expect(result.valid).toBe(false);
    const errorFiles = result.errors.map((e) => e.file);
    expect(errorFiles).not.toContain('good.ts');
    expect(errorFiles).toContain('bad.ts');
  });

  // --------------------------------------------------------------------------
  // Mixed TS and non-TS: only TS files are checked
  // --------------------------------------------------------------------------
  it('checks .ts and .tsx but skips .css and .md', () => {
    const result = validateTypeScript([
      { path: 'valid.ts', content: 'const x = 1;' },
      { path: 'valid.tsx', content: 'const el = <div />;' },
      { path: 'broken.css', content: '!!! not css' },
      { path: 'broken.md', content: '### not markdown {{{' },
    ]);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  // --------------------------------------------------------------------------
  // Error includes TS error code
  // --------------------------------------------------------------------------
  it('includes TypeScript diagnostic code in errors', () => {
    const result = validateTypeScript([
      {
        path: 'code-check.ts',
        content: `const x: = 5;`,
      },
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBeTypeOf('number');
    expect(result.errors[0].code).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------
  // Error severity is always 'error'
  // --------------------------------------------------------------------------
  it('marks all syntax errors with severity "error"', () => {
    const result = validateTypeScript([
      {
        path: 'severity.ts',
        content: `function f( { }`,
      },
    ]);

    expect(result.valid).toBe(false);
    for (const err of result.errors) {
      expect(err.severity).toBe('error');
    }
  });
});

// ============================================================================
// formatErrorsForFixPrompt
// ============================================================================

describe('formatErrorsForFixPrompt', () => {
  // --------------------------------------------------------------------------
  // 11. Formats single error with all fields
  // --------------------------------------------------------------------------
  it('formats a single error with all fields', () => {
    const errors: TSValidationError[] = [
      {
        file: 'test.ts',
        line: 5,
        column: 10,
        message: "')' expected.",
        code: 1005,
        severity: 'error',
        context: '>>>    5: function foo( {',
      },
    ];

    const output = formatErrorsForFixPrompt(errors);

    expect(output).toContain('FILE: test.ts');
    expect(output).toContain('LINE: 5, COLUMN: 10');
    expect(output).toContain("ERROR: ')' expected. (TS1005)");
    expect(output).toContain('CONTEXT:');
    expect(output).toContain('>>>    5: function foo( {');
  });

  // --------------------------------------------------------------------------
  // 12. Formats multiple errors separated by ---
  // --------------------------------------------------------------------------
  it('separates multiple errors with ---', () => {
    const errors: TSValidationError[] = [
      {
        file: 'a.ts',
        line: 1,
        column: 1,
        message: 'Error A',
        code: 1001,
        severity: 'error',
        context: 'line A',
      },
      {
        file: 'b.ts',
        line: 2,
        column: 2,
        message: 'Error B',
        code: 1002,
        severity: 'error',
        context: 'line B',
      },
    ];

    const output = formatErrorsForFixPrompt(errors);

    expect(output).toContain('FILE: a.ts');
    expect(output).toContain('FILE: b.ts');
    expect(output).toContain('\n---\n');
  });

  // --------------------------------------------------------------------------
  // 13. Includes context when present
  // --------------------------------------------------------------------------
  it('includes CONTEXT section when context is provided', () => {
    const errors: TSValidationError[] = [
      {
        file: 'ctx.ts',
        line: 3,
        column: 1,
        message: 'Syntax error',
        code: 1000,
        severity: 'error',
        context: '>>>    3: broken line',
      },
    ];

    const output = formatErrorsForFixPrompt(errors);

    expect(output).toContain('CONTEXT:\n>>>    3: broken line');
  });

  // --------------------------------------------------------------------------
  // 14. Omits context section when not present
  // --------------------------------------------------------------------------
  it('omits CONTEXT section when context is undefined', () => {
    const errors: TSValidationError[] = [
      {
        file: 'no-ctx.ts',
        line: 1,
        column: 1,
        message: 'Some error',
        code: 1000,
        severity: 'error',
      },
    ];

    const output = formatErrorsForFixPrompt(errors);

    expect(output).not.toContain('CONTEXT:');
    expect(output).toContain('FILE: no-ctx.ts');
    expect(output).toContain('ERROR: Some error (TS1000)');
  });
});

// ============================================================================
// hasSevereSyntaxErrors
// ============================================================================

describe('hasSevereSyntaxErrors', () => {
  // --------------------------------------------------------------------------
  // 15. Returns false for empty array
  // --------------------------------------------------------------------------
  it('returns false for empty error array', () => {
    expect(hasSevereSyntaxErrors([])).toBe(false);
  });

  // --------------------------------------------------------------------------
  // 16. Returns true for non-empty array
  // --------------------------------------------------------------------------
  it('returns true when errors exist', () => {
    const errors: TSValidationError[] = [
      {
        file: 'err.ts',
        line: 1,
        column: 1,
        message: 'Unexpected token',
        code: 1005,
        severity: 'error',
      },
    ];

    expect(hasSevereSyntaxErrors(errors)).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Returns true for multiple errors
  // --------------------------------------------------------------------------
  it('returns true for multiple errors', () => {
    const errors: TSValidationError[] = [
      {
        file: 'a.ts',
        line: 1,
        column: 1,
        message: 'Error 1',
        code: 1001,
        severity: 'error',
      },
      {
        file: 'b.ts',
        line: 2,
        column: 2,
        message: 'Error 2',
        code: 1002,
        severity: 'error',
      },
    ];

    expect(hasSevereSyntaxErrors(errors)).toBe(true);
  });
});

// ============================================================================
// Integration: validateTypeScript → formatErrorsForFixPrompt
// ============================================================================

describe('integration: validate then format', () => {
  it('formats real validation errors correctly', () => {
    const result = validateTypeScript([
      {
        path: 'broken.ts',
        content: `function foo( {\n  return 1;\n}`,
      },
    ]);

    expect(result.valid).toBe(false);

    const formatted = formatErrorsForFixPrompt(result.errors);

    expect(formatted).toContain('FILE: broken.ts');
    expect(formatted).toContain('LINE:');
    expect(formatted).toContain('ERROR:');
    expect(formatted).toContain('CONTEXT:');
    expect(formatted).toContain('>>>');
  });
});
