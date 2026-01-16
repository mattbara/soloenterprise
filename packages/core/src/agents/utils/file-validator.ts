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
 * Check for common syntax issues.
 */
function checkSyntax(content: string, filePath: string): ValidationResult['errors'] {
  const errors: ValidationResult['errors'] = [];
  const lines = content.split('\n');

  // Check 1: Balanced brackets
  const bracketPairs: Record<string, string> = { '(': ')', '{': '}', '[': ']', '<': '>' };
  const stack: string[] = [];
  let inString = false;
  let stringChar = '';
  let inTemplateLiteral = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const prevChar = content[i - 1];

    // Track string state (simplified)
    if ((char === '"' || char === "'") && prevChar !== '\\') {
      if (!inString && !inTemplateLiteral) {
        inString = true;
        stringChar = char;
      } else if (inString && char === stringChar) {
        inString = false;
      }
    }

    if (char === '`' && prevChar !== '\\') {
      inTemplateLiteral = !inTemplateLiteral;
    }

    // Only check brackets outside strings
    if (!inString && !inTemplateLiteral) {
      if (bracketPairs[char]) {
        stack.push(bracketPairs[char]);
      } else if (Object.values(bracketPairs).includes(char)) {
        const expected = stack.pop();
        if (expected !== char) {
          errors.push({
            file: filePath,
            message: `Mismatched bracket: expected '${expected || 'none'}', found '${char}'`,
          });
        }
      }
    }
  }

  if (stack.length > 0) {
    errors.push({
      file: filePath,
      message: `Unclosed brackets: missing ${stack.reverse().join(', ')}`,
    });
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
