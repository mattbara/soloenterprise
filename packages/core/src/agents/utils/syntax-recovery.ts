/**
 * Syntax Error Recovery
 *
 * Implements a fix loop strategy for syntax errors:
 * - Max 2 cheap fix loops per generation (~800 tokens each)
 * - Max 1 expensive full retry (~5,000 tokens)
 * - Max 3 total fix loops (hard ceiling)
 *
 * Uses TypeScript compiler API for precise error detection with line numbers.
 * This saves cost by first trying targeted fixes before regenerating.
 */

import Anthropic from '@anthropic-ai/sdk';
import { parseAgentOutput, type ParsedFile } from './output-parser';
import {
  validateTypeScript,
  formatErrorsForFixPrompt,
  type TSValidationError,
} from './typescript-validator';

// ============================================================================
// Constants
// ============================================================================

export const MAX_FIX_ATTEMPTS_PER_GEN = 2;
export const MAX_FULL_RETRIES = 1;
export const MAX_TOTAL_FIX_LOOPS = 3;

// Model for fix attempts (cheaper, faster)
const FIX_MODEL = 'claude-3-5-haiku-latest';
const FIX_MAX_TOKENS = 4096;

// ============================================================================
// Types
// ============================================================================

export interface SyntaxError {
  file: string;
  line?: number;
  column?: number;
  message: string;
  context?: string;
}

export interface RecoveryAttempts {
  fixLoops: number;
  fullRetries: number;
  fixTokensUsed: number;
}

export interface RecoveryResult {
  success: boolean;
  files: ParsedFile[];
  errors?: SyntaxError[];
  attempts: RecoveryAttempts;
}

// ============================================================================
// TypeScript Validation Wrapper
// ============================================================================

/**
 * Validates files using TypeScript compiler and converts to SyntaxError format.
 */
function validateFilesWithTypeScript(files: ParsedFile[]): SyntaxError[] {
  const tsResult = validateTypeScript(files);

  return tsResult.errors.map((e) => ({
    file: e.file,
    line: e.line,
    column: e.column,
    message: e.message,
    context: e.context,
  }));
}

// ============================================================================
// Syntax Fix Request
// ============================================================================

/**
 * Sends broken files with TypeScript errors to Claude for a targeted fix.
 * Uses detailed error messages with line numbers and surrounding context
 * to help Claude find and fix the exact issue.
 */
export async function requestSyntaxFix(
  client: Anthropic,
  brokenFiles: ParsedFile[],
  syntaxErrors: TSValidationError[],
  agentName: string
): Promise<{ fixedResponse: string; tokensUsed: number }> {
  // Format errors with full context (line numbers, surrounding code)
  const errorDetails = formatErrorsForFixPrompt(syntaxErrors);

  // Only include files that have errors
  const errorFilePaths = new Set(syntaxErrors.map((e) => e.file));
  const filesToFix = brokenFiles.filter((f) => errorFilePaths.has(f.path));

  const fileContents = filesToFix
    .map((f) => `<file path="${f.path}">\n${f.content}\n</file>`)
    .join('\n\n');

  const fixPrompt = `The following TypeScript/React code has syntax errors. Fix ONLY the syntax errors.

ERRORS FOUND:
${errorDetails}

BROKEN CODE:
${fileContents}

INSTRUCTIONS:
1. Look at the LINE and COLUMN numbers above
2. Look at the CONTEXT showing the surrounding code (>>> marks the error line)
3. Find the exact syntax error (missing bracket, unclosed tag, etc.)
4. Fix ONLY that error - do not change any logic or add features
5. Return the complete fixed file(s) using <file path="...">...</file> format

Return ONLY the fixed file(s). No explanations.`;

  console.log(
    `[${agentName}] Requesting syntax fix for ${syntaxErrors.length} error(s) with line context`
  );

  const response = await client.messages.create({
    model: FIX_MODEL,
    max_tokens: FIX_MAX_TOKENS,
    temperature: 0,
    messages: [{ role: 'user', content: fixPrompt }],
  });

  const textContent = response.content.find((c) => c.type === 'text');
  const fixedCode = textContent?.type === 'text' ? textContent.text : '';

  const tokensUsed =
    (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

  console.log(`[${agentName}] Syntax fix response: ${fixedCode.length} chars`);
  console.log(
    `[${agentName}] Fix attempt tokens: ${response.usage?.input_tokens ?? 0} in, ${response.usage?.output_tokens ?? 0} out`
  );

  return { fixedResponse: fixedCode, tokensUsed };
}

// ============================================================================
// File Merging
// ============================================================================

/**
 * Merges fixed files back into the original file list.
 * Fixed files replace originals; unchanged files are preserved.
 */
export function mergeFixedFiles(
  originalFiles: ParsedFile[],
  fixedResponse: string
): ParsedFile[] {
  const fixedParsed = parseAgentOutput(fixedResponse);

  if (fixedParsed.files.length === 0) {
    console.log('[SyntaxRecovery] No files extracted from fix response, keeping originals');
    return originalFiles;
  }

  // Replace broken files with fixed versions
  return originalFiles.map((original) => {
    const fixed = fixedParsed.files.find((f) => f.path === original.path);
    if (fixed) {
      console.log(`[SyntaxRecovery] Replaced ${original.path} with fixed version`);
      return fixed;
    }
    return original;
  });
}

// ============================================================================
// Recovery Loop
// ============================================================================

/**
 * Main recovery loop that implements the fix strategy:
 * 1. Validate with TypeScript compiler (get precise line numbers)
 * 2. Try cheap fix loops (max 2 per generation)
 * 3. If exhausted, try full regeneration (max 1)
 * 4. If still failing, give up
 *
 * The validateFn parameter is still called for any additional validation
 * (like writing files to disk), but syntax checking uses TypeScript compiler.
 */
export async function processWithSyntaxRecovery(
  client: Anthropic,
  agentName: string,
  initialFiles: ParsedFile[],
  validateFn: (files: ParsedFile[]) => Promise<SyntaxError[]>,
  generateFreshFn: () => Promise<ParsedFile[]>
): Promise<RecoveryResult> {
  let currentFiles = initialFiles;
  let fixAttemptsThisGen = 0;
  let fullRetries = 0;
  let totalFixLoops = 0;
  let totalFixTokens = 0;

  while (true) {
    // Validate syntax using TypeScript compiler (in-memory, precise errors)
    const tsResult = validateTypeScript(currentFiles);
    const syntaxErrors = tsResult.errors;

    // Log detailed TypeScript errors
    console.log(`[${agentName}] TypeScript validation: ${syntaxErrors.length} error(s)`);
    for (const err of syntaxErrors) {
      console.log(`[${agentName}]   ${err.file}:${err.line}:${err.column} - ${err.message}`);
    }

    // Success - no syntax errors
    if (syntaxErrors.length === 0) {
      // Also run the original validateFn for any additional validation (disk writes, etc.)
      const additionalErrors = await validateFn(currentFiles);
      const nonSyntaxErrors = additionalErrors.filter(
        (e) =>
          !e.message.includes('Unclosed') &&
          !e.message.includes('Unexpected') &&
          !e.message.includes('SyntaxError') &&
          !e.message.includes('Parse error') &&
          !e.message.includes('Unterminated')
      );

      if (nonSyntaxErrors.length > 0) {
        console.log(
          `[${agentName}] Additional validation found ${nonSyntaxErrors.length} non-syntax issue(s)`
        );
      }

      console.log(
        `[${agentName}] Syntax valid after ${totalFixLoops} fix loops, ${fullRetries} retries`
      );
      return {
        success: true,
        files: currentFiles,
        attempts: { fixLoops: totalFixLoops, fullRetries, fixTokensUsed: totalFixTokens },
      };
    }

    console.log(
      `[${agentName}] Found ${syntaxErrors.length} syntax error(s), fixAttemptsThisGen=${fixAttemptsThisGen}, fullRetries=${fullRetries}, totalFixLoops=${totalFixLoops}`
    );

    // Decide next action
    if (fixAttemptsThisGen < MAX_FIX_ATTEMPTS_PER_GEN && totalFixLoops < MAX_TOTAL_FIX_LOOPS) {
      // Try cheap fix with TypeScript errors (includes line numbers + context)
      console.log(
        `[${agentName}] Attempting syntax fix (loop ${totalFixLoops + 1}/${MAX_TOTAL_FIX_LOOPS})`
      );

      try {
        const { fixedResponse, tokensUsed } = await requestSyntaxFix(
          client,
          currentFiles,
          syntaxErrors,
          agentName
        );

        totalFixTokens += tokensUsed;
        currentFiles = mergeFixedFiles(currentFiles, fixedResponse);
        fixAttemptsThisGen++;
        totalFixLoops++;
      } catch (err) {
        console.error(`[${agentName}] Fix request failed:`, err);
        // Continue to next strategy
        fixAttemptsThisGen = MAX_FIX_ATTEMPTS_PER_GEN;
      }
    } else if (fullRetries < MAX_FULL_RETRIES) {
      // Fresh generation
      console.log(
        `[${agentName}] Fix loops exhausted, attempting full retry (${fullRetries + 1}/${MAX_FULL_RETRIES})`
      );

      try {
        currentFiles = await generateFreshFn();
        fullRetries++;
        fixAttemptsThisGen = 0; // Reset fix counter for new generation
      } catch (err) {
        console.error(`[${agentName}] Full retry failed:`, err);
        // Give up
        return {
          success: false,
          files: currentFiles,
          errors: syntaxErrors.map((e) => ({
            file: e.file,
            line: e.line,
            column: e.column,
            message: e.message,
            context: e.context,
          })),
          attempts: { fixLoops: totalFixLoops, fullRetries, fixTokensUsed: totalFixTokens },
        };
      }
    } else {
      // Give up
      console.log(`[${agentName}] All recovery attempts exhausted, failing task`);
      return {
        success: false,
        files: currentFiles,
        errors: syntaxErrors.map((e) => ({
          file: e.file,
          line: e.line,
          column: e.column,
          message: e.message,
          context: e.context,
        })),
        attempts: { fixLoops: totalFixLoops, fullRetries, fixTokensUsed: totalFixTokens },
      };
    }
  }
}
