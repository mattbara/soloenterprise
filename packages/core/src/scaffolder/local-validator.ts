/**
 * Local Validator
 *
 * Validates generated scaffold files using the existing TypeScript validator
 * and optionally checks imports against the ImportMap.
 */

import { validateTypeScript, type TSValidationResult, type TSValidationError } from '../agents/utils/typescript-validator';
import type { ImportMap } from './import-resolver';

// ============================================================================
// Types
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  file: string;
  line?: number;
  message: string;
  type: 'syntax' | 'import';
}

export interface ValidationOptions {
  /** Validate imports against the ImportMap */
  checkImports?: boolean;
  /** Import map to validate against */
  importMap?: ImportMap;
  /** Skip files that aren't TypeScript */
  skipNonTS?: boolean;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate generated code files.
 * Combines TypeScript syntax checking with optional import validation.
 */
export function validateGeneratedCode(
  files: Array<{ path: string; content: string }>,
  options: ValidationOptions = {},
): ValidationResult {
  const errors: ValidationError[] = [];

  // Filter to TS/TSX files only if requested
  const tsFiles = options.skipNonTS
    ? files.filter(f => /\.(tsx?|jsx?)$/.test(f.path))
    : files;

  // 1. TypeScript syntax validation
  if (tsFiles.length > 0) {
    const syntaxResult = validateTypeScript(tsFiles);
    for (const err of syntaxResult.errors) {
      errors.push({
        file: err.file,
        line: err.line,
        message: err.message,
        type: 'syntax',
      });
    }
  }

  // 2. Import validation (optional)
  if (options.checkImports && options.importMap) {
    for (const file of tsFiles) {
      const importErrors = validateImports(file.path, file.content, options.importMap);
      errors.push(...importErrors);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate that import sources in a file exist in the ImportMap.
 * Only checks imports from packages (not relative imports).
 */
function validateImports(
  filePath: string,
  content: string,
  importMap: ImportMap,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Extract import statements
  const importRegex = /import\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g;
  const lines = content.split('\n');

  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importSource = match[1];

    // Skip relative imports — we can't validate those without full project context
    if (importSource.startsWith('.') || importSource.startsWith('/')) continue;

    // Skip @/ path aliases — those are project-specific
    if (importSource.startsWith('@/')) continue;

    // Check if we know about this package
    const knownPackage = importMap.byPackage.has(importSource);
    if (!knownPackage) {
      // Find the line number
      const fullMatchText = match[0];
      const lineNum = lines.findIndex(l => l.includes(fullMatchText)) + 1;

      errors.push({
        file: filePath,
        line: lineNum || undefined,
        message: `Unknown import source: '${importSource}'. Not found in ImportMap.`,
        type: 'import',
      });
    }
  }

  return errors;
}
