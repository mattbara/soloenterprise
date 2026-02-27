/**
 * Prompt Builder
 *
 * Formats scaffold output into the prompt shape agents send to Claude.
 * Separates scaffold (context), requirements (task), and available imports.
 */

import type { ImportMap } from './import-resolver';
import { formatImportMapForPrompt } from './import-resolver';
import type { ValidationError } from './local-validator';

// ============================================================================
// Types
// ============================================================================

export interface ScaffoldPromptInput {
  /** Generated scaffold files with TODO markers */
  scaffoldFiles: Array<{ path: string; content: string }>;
  /** Original task requirements (description, acceptance criteria, etc.) */
  requirements: string;
  /** Import map for available imports section */
  importMap: ImportMap;
  /** Optional tech spec from architect */
  techSpec?: string;
}

export interface ValidationRetryInput {
  /** Original scaffold files */
  scaffoldFiles: Array<{ path: string; content: string }>;
  /** Validation errors to fix */
  errors: ValidationError[];
  /** The previous (broken) output from Claude */
  previousOutput: string;
}

// ============================================================================
// Prompt Builder
// ============================================================================

/**
 * Build the scaffold-aware prompt for Claude API calls.
 * Format: SCAFFOLD → REQUIREMENTS → AVAILABLE IMPORTS
 */
export function buildScaffoldPrompt(input: ScaffoldPromptInput): string {
  const { scaffoldFiles, requirements, importMap, techSpec } = input;
  const parts: string[] = [];

  // Section 1: Scaffold files
  parts.push('--- SCAFFOLD ---');
  parts.push('');
  parts.push('The following files have been pre-generated with correct imports, types, and structure.');
  parts.push('Your job: fill in the TODO comments with working implementation.');
  parts.push('Do NOT change imports, function signatures, or file structure unless absolutely necessary.');
  parts.push('');

  for (const file of scaffoldFiles) {
    parts.push(`<file path="${file.path}">`);
    parts.push(file.content);
    parts.push('</file>');
    parts.push('');
  }

  // Section 2: Requirements
  parts.push('--- REQUIREMENTS ---');
  parts.push('');
  parts.push(requirements);
  parts.push('');

  // Section 3: Tech spec (if available)
  if (techSpec) {
    parts.push('--- TECHNICAL SPECIFICATION ---');
    parts.push('');
    parts.push(techSpec);
    parts.push('');
  }

  // Section 4: Available imports
  parts.push('--- AVAILABLE IMPORTS ---');
  parts.push('');
  parts.push(formatImportMapForPrompt(importMap));
  parts.push('');
  parts.push('Use ONLY imports listed above. Do NOT invent import paths.');

  return parts.join('\n');
}

/**
 * Build a retry prompt for validation failures.
 * Includes the errors and asks Claude to fix only the broken parts.
 */
export function buildValidationRetryPrompt(input: ValidationRetryInput): string {
  const { scaffoldFiles, errors, previousOutput } = input;
  const parts: string[] = [];

  parts.push('--- VALIDATION ERRORS ---');
  parts.push('');
  parts.push('The code you generated has the following errors. Fix ONLY the errors listed below.');
  parts.push('Do NOT rewrite working code. Output the COMPLETE corrected files.');
  parts.push('');

  for (const error of errors) {
    parts.push(`FILE: ${error.file}`);
    if (error.line) parts.push(`LINE: ${error.line}`);
    parts.push(`ERROR: ${error.message}`);
    parts.push(`TYPE: ${error.type}`);
    parts.push('');
  }

  parts.push('--- YOUR PREVIOUS OUTPUT (with errors) ---');
  parts.push('');
  parts.push(previousOutput);
  parts.push('');

  parts.push('--- ORIGINAL SCAFFOLD (reference) ---');
  parts.push('');
  for (const file of scaffoldFiles) {
    parts.push(`<file path="${file.path}">`);
    parts.push(file.content);
    parts.push('</file>');
    parts.push('');
  }

  parts.push('Please output the corrected files using the <file path="...">content</file> format.');

  return parts.join('\n');
}
