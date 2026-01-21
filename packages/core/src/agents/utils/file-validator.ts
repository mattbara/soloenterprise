/**
 * Validates generated TypeScript/JavaScript files for basic syntax errors.
 * Runs after files are written to catch obvious issues before marking task complete.
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
 * Validate generated files for common syntax issues.
 * This is a quick check, not a full TypeScript compilation.
 */
export async function validateGeneratedFiles(
  taskDir: string,
  files: string[]
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
      const fileErrors = checkSyntax(content, filePath);
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
 */
function checkBracketBalance(content: string): string | null {
  const cleaned = content
    .replace(/\/\/.*$/gm, '')           // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')   // Remove multi-line comments
    .replace(/'[^'\\]*(?:\\.[^'\\]*)*'/g, '""')  // Replace single-quoted strings
    .replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, '""')  // Replace double-quoted strings
    .replace(/`[^`\\]*(?:\\.[^`\\]*)*`/g, '""'); // Replace template literals (simplified)

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
function checkSyntax(content: string, filePath: string): ValidationResult['errors'] {
  const errors: ValidationResult['errors'] = [];
  const lines = content.split('\n');

  // Check 1: Balanced brackets (excluding <> - TypeScript generics break simple matching)
  const bracketError = checkBracketBalance(content);
  if (bracketError) {
    errors.push({ file: filePath, message: bracketError });
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
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];

    // Skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
      continue;
    }

    // Check for unclosed strings (simplified - won't catch multi-line)
    const singleQuotes = (line.match(/'/g) || []).length;
    const doubleQuotes = (line.match(/"/g) || []).length;

    // This is a heuristic - odd number suggests unclosed
    // But skip lines with template literals or regex
    if (!line.includes('`') && !line.includes('/')) {
      if (singleQuotes % 2 !== 0) {
        errors.push({
          file: filePath,
          line: lineNum + 1,
          message: `Possible unterminated string (single quote)`,
        });
      }
      if (doubleQuotes % 2 !== 0) {
        errors.push({
          file: filePath,
          line: lineNum + 1,
          message: `Possible unterminated string (double quote)`,
        });
      }
    }
  }

  return errors;
}
