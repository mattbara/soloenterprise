/**
 * Validates generated TypeScript/JavaScript files for basic syntax errors.
 *
 * NOTE: This is a SECONDARY validator. The primary syntax gate is the TypeScript
 * compiler in typescript-validator.ts (used by processWithSyntaxRecovery).
 * This file-validator runs AFTER TS validation and catches non-syntax issues
 * (Drizzle typos, etc.). Bracket warnings from this validator on files that
 * already passed TS compilation are false positives from regex limitations.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';

export interface ValidationResult {
  valid: boolean;
  errors: Array<{
    file: string;
    line?: number;
    message: string;
  }>;
}

/**
 * Options for validateGeneratedFiles.
 */
export interface ValidateOptions {
  /**
   * When true, skips the regex-based bracket balance check.
   * Use this when files have already been validated by the TypeScript compiler
   * (via processWithSyntaxRecovery), since the bracket counter can produce
   * false positives on valid code that the TS compiler correctly accepted.
   */
  skipBracketCheck?: boolean;
}

/**
 * Validate generated files for common syntax issues.
 * This is a quick check, not a full TypeScript compilation.
 */
export async function validateGeneratedFiles(
  taskDir: string,
  files: string[],
  options?: ValidateOptions
): Promise<ValidationResult> {
  const errors: ValidationResult['errors'] = [];

  for (const filePath of files) {
    // Only check TypeScript/JavaScript files
    if (!filePath.match(/\.(ts|tsx|js|jsx)$/)) {
      continue;
    }

    const fullPath = join(taskDir, filePath);

    try {
      const content = await readFile(fullPath, 'utf-8');
      const fileErrors = checkSyntax(content, filePath, options);
      errors.push(...fileErrors);
    } catch (error) {
      errors.push({
        file: filePath,
        message: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check bracket balance (simplified check, excludes <> due to TypeScript generics).
 *
 * Strips comments, strings, template literals, and regex before counting.
 * Template literals with ${expr} are handled by recursively stripping expressions.
 *
 * NOTE: This is a heuristic. The regex-based stripping has known edge cases
 * (deeply nested template expressions, regex with brackets, tagged templates).
 * The TypeScript compiler validation is the authoritative syntax check.
 * This function is useful as a fast pre-check before TS compilation, but
 * its results should NOT override the TS compiler's verdict.
 */
export function checkBracketBalance(content: string): string | null {
  let cleaned = content;

  // 1. Remove single-line comments
  cleaned = cleaned.replace(/\/\/.*$/gm, '');

  // 2. Remove multi-line comments
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');

  // 3. Remove regex literals (simplified: /.../ not preceded by a value)
  cleaned = cleaned.replace(/(?<=[=(:,;!&|?])\s*\/(?!\/)(?:[^/\\]|\\.)*\//g, '""');

  // 4. Replace double-quoted strings
  cleaned = cleaned.replace(/"(?:[^"\\]|\\.)*"/g, '""');

  // 5. Replace single-quoted strings
  cleaned = cleaned.replace(/'(?:[^'\\]|\\.)*'/g, '""');

  // 6. Replace template literals (handle nested ${} by repeatedly stripping)
  //    Loop until no more template literals remain.
  //    The inner regex handles ${expr} where expr doesn't contain nested braces.
  //    Multiple iterations handle cases where inner template literals are stripped
  //    first, exposing outer ones.
  let prev = '';
  let iterations = 0;
  const MAX_ITERATIONS = 10; // Prevent infinite loops on pathological input
  while (prev !== cleaned && iterations < MAX_ITERATIONS) {
    prev = cleaned;
    // Match template literals: backtick-delimited strings that may contain
    // escaped chars, $ not followed by {, or ${...} where ... has no nested braces.
    cleaned = cleaned.replace(/`(?:[^`\\$]|\\.|\$(?!\{)|\$\{[^}]*\})*`/g, '""');
    iterations++;
  }

  // Only check (), {}, [] — NOT <> (TypeScript generics break simple matching)
  const counts = { '(': 0, '{': 0, '[': 0 };
  const closeMap = { ')': '(', '}': '{', ']': '[' } as const;

  for (const char of cleaned) {
    if (char in counts) {
      counts[char as keyof typeof counts]++;
    } else if (char in closeMap) {
      const open = closeMap[char as keyof typeof closeMap];
      counts[open]--;
      if (counts[open] < 0) return `Unmatched '${char}'`;
    }
  }

  const unclosed = Object.entries(counts)
    .filter(([_, n]) => n > 0)
    .map(([b, n]) => `${n}x '${b}'`);

  return unclosed.length > 0 ? `Unclosed: ${unclosed.join(', ')}` : null;
}

/**
 * Check for common syntax issues.
 */
function checkSyntax(
  content: string,
  filePath: string,
  options?: ValidateOptions
): ValidationResult['errors'] {
  const errors: ValidationResult['errors'] = [];

  // Check 1: Balanced brackets (excluding <> - TypeScript generics break simple matching)
  // Skip when files already passed TS compiler validation (bracket warnings would be false positives)
  if (!options?.skipBracketCheck) {
    const bracketError = checkBracketBalance(content);
    if (bracketError) {
      errors.push({ file: filePath, message: bracketError });
    }
  }

  // Check 2: Common typos in Drizzle/SQL
  const typoPatterns = [
    { pattern: /\bsq`/g, message: "Typo: 'sq`' should be 'sql`'" },
    { pattern: /sql<\w+`/g, message: "Missing '>' before template literal: 'sql<type`' should be 'sql<type>`'" },
  ];

  for (const { pattern, message } of typoPatterns) {
    if (pattern.test(content)) {
      errors.push({ file: filePath, message });
    }
  }

  // Check 3: Unterminated strings (line-by-line)
  // DISABLED — the naive quote-counting approach produces too many false positives:
  //   - Apostrophes in JSX text content (e.g. "You're all clear!")
  //   - Quotes in regex patterns
  //   - HTML attributes in JSX
  //   - TypeScript string literal types
  // The TypeScript compiler validation (in syntax-recovery.ts) catches real
  // unterminated strings with 100% accuracy. This heuristic adds no value.

  return errors;
}
