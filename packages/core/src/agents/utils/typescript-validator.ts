/**
 * TypeScript Compiler Validation
 *
 * Uses the actual TypeScript compiler API to validate generated files.
 * Returns detailed errors with line numbers and surrounding context,
 * enabling Claude to fix syntax errors precisely.
 */

import ts from 'typescript';

// ============================================================================
// Types
// ============================================================================

export interface TSValidationError {
  file: string;
  line: number;
  column: number;
  message: string;
  code: number;
  severity: 'error' | 'warning';
  context?: string; // Surrounding lines for fix prompt
}

export interface TSValidationResult {
  valid: boolean;
  errors: TSValidationError[];
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate TypeScript/TSX files using the actual TypeScript compiler.
 * Returns detailed errors with line numbers and context.
 *
 * Only checks syntax errors (not type errors) since we don't have
 * access to the full type definitions for the codebase.
 */
export function validateTypeScript(
  files: Array<{ path: string; content: string }>
): TSValidationResult {
  const errors: TSValidationError[] = [];

  // Create in-memory file map
  const fileMap = new Map<string, string>();
  for (const file of files) {
    fileMap.set(file.path, file.content);
  }

  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    jsx: ts.JsxEmit.ReactJSX,
    strict: false, // We just want syntax errors, not type errors
    noEmit: true,
    skipLibCheck: true,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    esModuleInterop: true,
    allowJs: true,
    checkJs: false,
  };

  // Custom compiler host that reads from our in-memory files
  const host: ts.CompilerHost = {
    getSourceFile: (fileName, languageVersion) => {
      const content = fileMap.get(fileName);
      if (content !== undefined) {
        return ts.createSourceFile(fileName, content, languageVersion, true);
      }
      return undefined;
    },
    getDefaultLibFileName: () => 'lib.d.ts',
    writeFile: () => {},
    getCurrentDirectory: () => '/',
    getCanonicalFileName: (f) => f,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    fileExists: (fileName) => fileMap.has(fileName),
    readFile: (fileName) => fileMap.get(fileName),
  };

  // Only check .ts, .tsx, .js, .jsx files
  const filesToCheck = files.filter((f) =>
    /\.(tsx?|jsx?)$/.test(f.path)
  );

  if (filesToCheck.length === 0) {
    return { valid: true, errors: [] };
  }

  const program = ts.createProgram(
    filesToCheck.map((f) => f.path),
    compilerOptions,
    host
  );

  // Get ONLY syntax diagnostics (not semantic - we don't have type definitions)
  for (const file of filesToCheck) {
    const sourceFile = program.getSourceFile(file.path);
    if (!sourceFile) continue;

    const syntaxDiagnostics = program.getSyntacticDiagnostics(sourceFile);

    for (const diag of syntaxDiagnostics) {
      if (diag.file && diag.start !== undefined) {
        const { line, character } = diag.file.getLineAndCharacterOfPosition(diag.start);
        const message = ts.flattenDiagnosticMessageText(diag.messageText, '\n');

        // Get surrounding context (3 lines before and after)
        const lines = file.content.split('\n');
        const startLine = Math.max(0, line - 3);
        const endLine = Math.min(lines.length - 1, line + 3);
        const contextLines = lines.slice(startLine, endLine + 1).map((l, i) => {
          const lineNum = startLine + i + 1;
          const marker = lineNum === line + 1 ? '>>> ' : '    ';
          return `${marker}${lineNum.toString().padStart(4)}: ${l}`;
        });

        errors.push({
          file: file.path,
          line: line + 1, // 1-indexed
          column: character + 1,
          message,
          code: diag.code,
          severity: 'error',
          context: contextLines.join('\n'),
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Formatting for Fix Prompts
// ============================================================================

/**
 * Format errors for the fix prompt - includes context to help Claude
 * understand exactly where the error is and what the surrounding code looks like.
 */
export function formatErrorsForFixPrompt(errors: TSValidationError[]): string {
  return errors
    .map((e) => {
      let result = `FILE: ${e.file}\n`;
      result += `LINE: ${e.line}, COLUMN: ${e.column}\n`;
      result += `ERROR: ${e.message} (TS${e.code})\n`;
      if (e.context) {
        result += `CONTEXT:\n${e.context}\n`;
      }
      return result;
    })
    .join('\n---\n');
}

/**
 * Quick check if any errors are severe syntax errors that must be fixed.
 * All TypeScript syntax errors are considered severe.
 */
export function hasSevereSyntaxErrors(errors: TSValidationError[]): boolean {
  return errors.length > 0;
}
