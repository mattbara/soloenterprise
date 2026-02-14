/**
 * Tests for file-validator.ts
 *
 * Covers:
 * - checkBracketBalance (exported): direct unit tests for bracket counting
 * - checkSyntax: Drizzle/SQL typo detection
 * - validateGeneratedFiles: integration (skipping non-TS, read errors, multi-file, empty list)
 * - skipBracketCheck option: ensures bracket check is skipped when TS compiler already validated
 * - TS compiler vs bracket counter: confirms TS compiler catches real bracket errors
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateGeneratedFiles, checkBracketBalance } from '../file-validator';

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

import { readFile } from 'fs/promises';

const mockedReadFile = vi.mocked(readFile);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ---------------------------------------------------------------------------
// checkBracketBalance — direct unit tests
// ---------------------------------------------------------------------------
describe('checkBracketBalance', () => {
  // --- Basic balanced/unbalanced ---

  it('returns null for balanced code', () => {
    expect(checkBracketBalance('function foo() { return bar(baz[0]); }')).toBeNull();
  });

  it('reports unclosed parenthesis', () => {
    const result = checkBracketBalance('function foo( { return 1; }');
    expect(result).toContain("'('");
  });

  it('reports unclosed curly brace', () => {
    const result = checkBracketBalance('function foo() { if (true) {');
    expect(result).toContain("'{'");
  });

  it('reports unclosed square bracket', () => {
    const result = checkBracketBalance('const x = [1, 2, 3;');
    expect(result).toContain("'['");
  });

  it('reports unmatched closing bracket', () => {
    const result = checkBracketBalance('const x = 1; }');
    expect(result).toContain("Unmatched '}'");
  });

  it('reports unmatched closing parenthesis', () => {
    const result = checkBracketBalance('const x = fn());');
    expect(result).toContain("Unmatched ')'");
  });

  it('reports unmatched closing square bracket', () => {
    const result = checkBracketBalance('const x = 1];');
    expect(result).toContain("Unmatched ']'");
  });

  it('reports multiple unclosed bracket types', () => {
    const result = checkBracketBalance('function foo( { const arr = [');
    expect(result).not.toBeNull();
    expect(result).toContain("'('");
    expect(result).toContain("'{'");
    expect(result).toContain("'['");
  });

  // --- Comment stripping ---

  it('ignores brackets inside single-line comments', () => {
    const code = [
      'function foo() {',
      '  // this has an unmatched ( bracket',
      '  return 1;',
      '}',
    ].join('\n');
    expect(checkBracketBalance(code)).toBeNull();
  });

  it('ignores brackets inside multi-line comments', () => {
    const code = [
      'function foo() {',
      '  /* unmatched [ and ( in comment */',
      '  return 1;',
      '}',
    ].join('\n');
    expect(checkBracketBalance(code)).toBeNull();
  });

  it('ignores brackets in multi-line comment spanning multiple lines', () => {
    const code = [
      'function foo() {',
      '  /*',
      '   * lots of brackets ( [ {',
      '   * and more } ] )',
      '   */',
      '  return 1;',
      '}',
    ].join('\n');
    expect(checkBracketBalance(code)).toBeNull();
  });

  // --- String stripping ---

  it('ignores brackets inside double-quoted strings', () => {
    expect(checkBracketBalance('const s = "unmatched { and (";')).toBeNull();
  });

  it('ignores brackets inside single-quoted strings', () => {
    expect(checkBracketBalance("const s = 'unmatched { and (';")).toBeNull();
  });

  it('handles escaped quotes in strings', () => {
    expect(checkBracketBalance('const s = "he said \\"(\\"";')).toBeNull();
  });

  it('handles escaped quotes in single-quoted strings', () => {
    expect(checkBracketBalance("const s = 'it\\'s (fine)';")).toBeNull();
  });

  // --- Template literal stripping ---

  it('ignores brackets inside template literals', () => {
    expect(checkBracketBalance('const s = `unmatched { and (`;')).toBeNull();
  });

  it('handles brackets inside template literal expressions ${}', () => {
    expect(checkBracketBalance('const s = `value is ${obj.fn(x)}`;')).toBeNull();
  });

  it('handles multiple sequential template literals', () => {
    const code = [
      'const a = `hello ${name}`;',
      'const b = `count: ${items.length}`;',
    ].join('\n');
    expect(checkBracketBalance(code)).toBeNull();
  });

  it('handles template literal with multiple expressions', () => {
    const code = 'const s = `${a} and ${b(c)} plus ${d[0]}`;';
    expect(checkBracketBalance(code)).toBeNull();
  });

  // --- Mixed brackets ---

  it('handles deeply nested mixed brackets', () => {
    const code = [
      'function run() {',
      '  const arr = [{ a: fn(1) }, { b: fn(2) }];',
      '  return arr;',
      '}',
    ].join('\n');
    expect(checkBracketBalance(code)).toBeNull();
  });

  // --- Real-world test file pattern (the exact scenario from Fix 5) ---

  it('detects missing }); at end of describe block', () => {
    const code = [
      "describe('broken test', () => {",
      "  it('should work', () => {",
      '    expect(true).toBe(true);',
      '  });',
      // Missing }); to close describe
    ].join('\n');
    const result = checkBracketBalance(code);
    expect(result).not.toBeNull();
    expect(result).toContain("'('");
    expect(result).toContain("'{'");
  });

  it('passes for complete test file with describe/it blocks', () => {
    const code = [
      "describe('working test', () => {",
      "  it('should work', () => {",
      '    expect(true).toBe(true);',
      '  });',
      '',
      "  it('should also work', () => {",
      '    expect(1 + 1).toBe(2);',
      '  });',
      '});',
    ].join('\n');
    expect(checkBracketBalance(code)).toBeNull();
  });

  it('detects multiple unclosed parens in test file (Weather Forecast scenario)', () => {
    // Simulates the Weather Forecast test with multiple unclosed describe/it blocks
    const code = [
      "describe('WeatherForecast', () => {",
      "  describe('fetching', () => {",
      "    it('gets data', () => {",
      '      expect(fetch).toHaveBeenCalled();',
      '    });',
      // Missing }); for inner describe
      "  it('handles error', () => {",
      '    expect(true).toBe(true);',
      '  });',
      // Missing }); for outer describe
    ].join('\n');
    const result = checkBracketBalance(code);
    expect(result).not.toBeNull();
  });

  // --- JSX handling (should not false-positive) ---

  it('handles JSX with curly brace expressions', () => {
    const code = [
      'function App() {',
      '  return (',
      '    <div className={condition ? "a" : "b"}>',
      '      {items.map((item) => (',
      '        <span key={item.id}>{item.name}</span>',
      '      ))}',
      '    </div>',
      '  );',
      '}',
    ].join('\n');
    expect(checkBracketBalance(code)).toBeNull();
  });

  it('handles JSX with spread props', () => {
    const code = [
      'function Comp() {',
      '  return <div {...props} onClick={() => { doStuff(); }} />;',
      '}',
    ].join('\n');
    expect(checkBracketBalance(code)).toBeNull();
  });

  // --- Regex stripping ---

  it('ignores brackets inside regex literals', () => {
    const code = 'const re = /[a-z](foo)/;';
    expect(checkBracketBalance(code)).toBeNull();
  });

  // --- Edge cases ---

  it('handles empty string', () => {
    expect(checkBracketBalance('')).toBeNull();
  });

  it('handles code with no brackets', () => {
    expect(checkBracketBalance('const x = 1;\nconst y = 2;')).toBeNull();
  });

  it('handles escaped backslash in string before bracket', () => {
    // String ends at the second quote, bracket is outside
    expect(checkBracketBalance('const s = "path\\\\"; const x = {};')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// checkBracketBalance via validateGeneratedFiles (integration)
// ---------------------------------------------------------------------------
describe('checkBracketBalance via validateGeneratedFiles', () => {
  const taskDir = '/fake/task';

  it('1 — valid balanced code returns valid: true', async () => {
    mockedReadFile.mockResolvedValueOnce(
      'function foo() { return bar(baz[0]); }'
    );

    const result = await validateGeneratedFiles(taskDir, ['index.ts']);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('2 — unclosed parenthesis is reported', async () => {
    mockedReadFile.mockResolvedValueOnce('function foo( { return 1; }');

    const result = await validateGeneratedFiles(taskDir, ['a.ts']);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("'('");
  });

  it('3 — unclosed curly brace is reported', async () => {
    mockedReadFile.mockResolvedValueOnce('function foo() { if (true) {');

    const result = await validateGeneratedFiles(taskDir, ['a.ts']);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain("'{'");
  });

  it('4 — unclosed square bracket is reported', async () => {
    mockedReadFile.mockResolvedValueOnce('const x = [1, 2, 3;');

    const result = await validateGeneratedFiles(taskDir, ['a.ts']);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain("'['");
  });

  it('5 — unmatched closing bracket is reported', async () => {
    mockedReadFile.mockResolvedValueOnce('const x = 1; }');

    const result = await validateGeneratedFiles(taskDir, ['a.ts']);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain("Unmatched '}'");
  });

  it('6 — brackets inside single-line comments are ignored', async () => {
    const code = [
      'function foo() {',
      '  // this has an unmatched ( bracket',
      '  return 1;',
      '}',
    ].join('\n');
    mockedReadFile.mockResolvedValueOnce(code);

    const result = await validateGeneratedFiles(taskDir, ['a.ts']);
    expect(result.valid).toBe(true);
  });

  it('7 — brackets inside multi-line comments are ignored', async () => {
    const code = [
      'function foo() {',
      '  /* unmatched [ and ( in comment */',
      '  return 1;',
      '}',
    ].join('\n');
    mockedReadFile.mockResolvedValueOnce(code);

    const result = await validateGeneratedFiles(taskDir, ['a.ts']);
    expect(result.valid).toBe(true);
  });

  it('8 — brackets inside double-quoted strings are ignored', async () => {
    const code = 'const s = "unmatched { and (";';
    mockedReadFile.mockResolvedValueOnce(code);

    const result = await validateGeneratedFiles(taskDir, ['a.ts']);
    expect(result.valid).toBe(true);
  });

  it('9 — brackets inside single-quoted strings are ignored', async () => {
    const code = "const s = 'unmatched { and (';";
    mockedReadFile.mockResolvedValueOnce(code);

    const result = await validateGeneratedFiles(taskDir, ['a.ts']);
    expect(result.valid).toBe(true);
  });

  it('10 — brackets inside template literals are ignored', async () => {
    const code = 'const s = `unmatched { and (`;';
    mockedReadFile.mockResolvedValueOnce(code);

    const result = await validateGeneratedFiles(taskDir, ['a.ts']);
    expect(result.valid).toBe(true);
  });

  it('11 — brackets inside template literal expressions ${} are handled', async () => {
    const code = 'const s = `value is ${obj.fn(x)}`;';
    mockedReadFile.mockResolvedValueOnce(code);

    const result = await validateGeneratedFiles(taskDir, ['a.ts']);
    expect(result.valid).toBe(true);
  });

  it('12 — iterative template literal stripping handles multiple sequential templates', async () => {
    const code = [
      'const a = `hello ${name}`;',
      'const b = `count: ${items.length}`;',
    ].join('\n');
    mockedReadFile.mockResolvedValueOnce(code);

    const result = await validateGeneratedFiles(taskDir, ['a.ts']);
    expect(result.valid).toBe(true);
  });

  it('13 — mixed brackets balanced correctly', async () => {
    const code = [
      'function run() {',
      '  const arr = [{ a: fn(1) }, { b: fn(2) }];',
      '  return arr;',
      '}',
    ].join('\n');
    mockedReadFile.mockResolvedValueOnce(code);

    const result = await validateGeneratedFiles(taskDir, ['a.ts']);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// skipBracketCheck option
// ---------------------------------------------------------------------------
describe('skipBracketCheck option', () => {
  const taskDir = '/fake/task';

  it('skips bracket check when skipBracketCheck is true', async () => {
    // Code with unclosed bracket — would normally fail
    mockedReadFile.mockResolvedValueOnce('function foo() {');

    const result = await validateGeneratedFiles(taskDir, ['a.ts'], { skipBracketCheck: true });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('still detects Drizzle typos when skipBracketCheck is true', async () => {
    mockedReadFile.mockResolvedValueOnce('const query = sq`SELECT * FROM users`;');

    const result = await validateGeneratedFiles(taskDir, ['a.ts'], { skipBracketCheck: true });
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain("sq`");
  });

  it('still reports file read errors when skipBracketCheck is true', async () => {
    mockedReadFile.mockRejectedValueOnce(new Error('ENOENT'));

    const result = await validateGeneratedFiles(taskDir, ['missing.ts'], { skipBracketCheck: true });
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('Failed to read file');
  });

  it('runs bracket check when skipBracketCheck is false', async () => {
    mockedReadFile.mockResolvedValueOnce('function foo() {');

    const result = await validateGeneratedFiles(taskDir, ['a.ts'], { skipBracketCheck: false });
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain("'{'");
  });

  it('runs bracket check when options not provided', async () => {
    mockedReadFile.mockResolvedValueOnce('function foo() {');

    const result = await validateGeneratedFiles(taskDir, ['a.ts']);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain("'{'");
  });
});

// ---------------------------------------------------------------------------
// checkSyntax — typo detection
// ---------------------------------------------------------------------------
describe('checkSyntax typo detection via validateGeneratedFiles', () => {
  const taskDir = '/fake/task';

  it('14 — detects sq` typo (should be sql`)', async () => {
    const code = 'const query = sq`SELECT * FROM users`;';
    mockedReadFile.mockResolvedValueOnce(code);

    const result = await validateGeneratedFiles(taskDir, ['a.ts']);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain("sq`");
    expect(result.errors[0].message).toContain("sql`");
  });

  it('15 — detects sql<type` missing > typo', async () => {
    const code = 'const query = sql<string`SELECT 1`;';
    mockedReadFile.mockResolvedValueOnce(code);

    const result = await validateGeneratedFiles(taskDir, ['a.ts']);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain("Missing '>'");
  });

  it('16 — clean code has no typo errors', async () => {
    const code = [
      'import { sql } from "drizzle-orm";',
      'const query = sql<string>`SELECT 1`;',
    ].join('\n');
    mockedReadFile.mockResolvedValueOnce(code);

    const result = await validateGeneratedFiles(taskDir, ['a.ts']);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// validateGeneratedFiles — integration
// ---------------------------------------------------------------------------
describe('validateGeneratedFiles integration', () => {
  const taskDir = '/fake/task';

  it('17 — skips non-TypeScript files (.css, .json, etc.)', async () => {
    const result = await validateGeneratedFiles(taskDir, [
      'styles.css',
      'data.json',
      'image.png',
      'readme.md',
    ]);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    // readFile should never be called for non-TS/JS files
    expect(mockedReadFile).not.toHaveBeenCalled();
  });

  it('18 — reports error when file cannot be read', async () => {
    mockedReadFile.mockRejectedValueOnce(new Error('ENOENT: no such file'));

    const result = await validateGeneratedFiles(taskDir, ['missing.ts']);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].file).toBe('missing.ts');
    expect(result.errors[0].message).toContain('Failed to read file');
    expect(result.errors[0].message).toContain('ENOENT');
  });

  it('19 — multiple files validated independently', async () => {
    // First file: valid
    mockedReadFile.mockResolvedValueOnce('const x = 1;');
    // Second file: bracket error
    mockedReadFile.mockResolvedValueOnce('function foo() {');
    // Third file: valid
    mockedReadFile.mockResolvedValueOnce('export default {};');

    const result = await validateGeneratedFiles(taskDir, [
      'good.ts',
      'bad.ts',
      'also-good.tsx',
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].file).toBe('bad.ts');
    expect(mockedReadFile).toHaveBeenCalledTimes(3);
  });

  it('20 — empty file list returns valid', async () => {
    const result = await validateGeneratedFiles(taskDir, []);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(mockedReadFile).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TS compiler catches real bracket errors (confirms primary gate works)
// ---------------------------------------------------------------------------

// Import the real TS validator (not mocked — these tests confirm the TS
// compiler catches the exact scenarios described in Fix 5)
import { validateTypeScript } from '../typescript-validator';

describe('TS compiler catches bracket errors that matter', () => {

  it('TS compiler catches unclosed describe block (Fix 5 scenario)', () => {
    const brokenTestFile = [
      "describe('broken test', () => {",
      "  it('should work', () => {",
      '    expect(true).toBe(true);',
      '  });',
      // Missing }); to close describe
    ].join('\n');

    const result = validateTypeScript([
      { path: 'test-input.test.ts', content: brokenTestFile },
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors[0].file).toBe('test-input.test.ts');
  });

  it('TS compiler catches unclosed it() callback', () => {
    const brokenTestFile = [
      "describe('test', () => {",
      "  it('broken', () => {",
      '    expect(true).toBe(true);',
      // Missing }); for it()
      '});',
    ].join('\n');

    const result = validateTypeScript([
      { path: 'broken-it.test.ts', content: brokenTestFile },
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it('TS compiler catches multiple unclosed blocks (Weather Forecast pattern)', () => {
    const brokenTestFile = [
      "describe('WeatherForecast', () => {",
      "  describe('current', () => {",
      "    it('fetches current weather', () => {",
      '      const data = { temp: 72 };',
      '      expect(data.temp).toBe(72);',
      '    });',
      // Missing }); for inner describe
      "  describe('forecast', () => {",
      "    it('fetches forecast', () => {",
      '      expect(true).toBe(true);',
      '    });',
      '  });',
      // Missing }); for outer describe
    ].join('\n');

    const result = validateTypeScript([
      { path: 'weather-forecast.test.ts', content: brokenTestFile },
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it('TS compiler passes valid test file', () => {
    const validTestFile = [
      "describe('WorkingTest', () => {",
      "  it('passes', () => {",
      '    expect(1 + 1).toBe(2);',
      '  });',
      '',
      "  it('also passes', () => {",
      '    expect(true).toBe(true);',
      '  });',
      '});',
    ].join('\n');

    const result = validateTypeScript([
      { path: 'working.test.ts', content: validTestFile },
    ]);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('TS compiler catches unclosed expect chain', () => {
    const brokenTestFile = [
      "describe('test', () => {",
      "  it('broken expect', () => {",
      '    expect(true).toBe(true',
      '  });',
      '});',
    ].join('\n');

    const result = validateTypeScript([
      { path: 'broken-expect.test.ts', content: brokenTestFile },
    ]);

    expect(result.valid).toBe(false);
  });
});
