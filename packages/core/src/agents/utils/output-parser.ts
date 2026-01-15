/**
 * Output Parser
 *
 * Parses Claude's response to extract generated files from XML-like file blocks.
 * Expected format: <file path="src/services/user-service.ts">// file contents</file>
 */

export interface ParsedFile {
  path: string;
  content: string;
}

export interface ParseResult {
  files: ParsedFile[];
  hasQuestions: boolean;
  questionsContent: string | null;
  rawResponse: string;
}

/**
 * Extracts file blocks from Claude's response.
 *
 * Handles multiple formats:
 * - <file path="...">content</file>
 * - Nested in code blocks
 * - Multiple files in a single response
 */
export function parseAgentOutput(response: string): ParseResult {
  const files: ParsedFile[] = [];

  // Regex to match <file path="...">content</file> blocks
  // Handles multiline content and various whitespace
  const fileBlockRegex = /<file\s+path=["']([^"']+)["']\s*>([\s\S]*?)<\/file>/g;

  let match;
  while ((match = fileBlockRegex.exec(response)) !== null) {
    const [, filePath, content] = match;

    if (filePath && content !== undefined) {
      // Trim leading/trailing whitespace from content but preserve internal formatting
      const trimmedContent = trimFileContent(content);

      files.push({
        path: normalizePath(filePath),
        content: trimmedContent,
      });
    }
  }

  // Check for questions section - pass whether files were generated
  // If files exist, be more strict about question detection
  const questionsResult = extractQuestions(response, files.length > 0);

  return {
    files,
    hasQuestions: questionsResult.hasQuestions,
    questionsContent: questionsResult.content,
    rawResponse: response,
  };
}

/**
 * Trims file content while preserving code structure.
 * Removes leading/trailing newlines but keeps internal indentation.
 */
function trimFileContent(content: string): string {
  // Remove leading newline (common after opening tag)
  let trimmed = content.replace(/^\n/, '');

  // Remove trailing newline (common before closing tag)
  trimmed = trimmed.replace(/\n$/, '');

  return trimmed;
}

/**
 * Normalizes file paths to prevent directory traversal attacks.
 */
function normalizePath(path: string): string {
  // Remove leading slashes
  let normalized = path.replace(/^\/+/, '');

  // Remove any ../ sequences to prevent directory traversal
  normalized = normalized.replace(/\.\.\//g, '');

  // Remove any double slashes
  normalized = normalized.replace(/\/+/g, '/');

  return normalized;
}

/**
 * Extracts questions section from the response.
 *
 * If files were generated (hasFiles=true), we're strict:
 *   - Only look for explicit ## Questions header
 *   - Must contain actual question marks
 *   - Must pass validation (not "None", etc.)
 *
 * If no files (hasFiles=false), the agent couldn't proceed:
 *   - Check multiple question formats more broadly
 */
function extractQuestions(response: string, hasFiles: boolean): { hasQuestions: boolean; content: string | null } {
  // Look for ## Questions section (preferred format)
  const questionsHeaderRegex = /##\s*Questions?\s*\n([\s\S]*?)(?=\n##|\n```xml|$)/i;
  const headerMatch = questionsHeaderRegex.exec(response);

  if (headerMatch && headerMatch[1]) {
    const questionsContent = headerMatch[1].trim();

    if (hasFiles) {
      // Files generated = task likely complete
      // Only flag if there are ACTUAL question marks AND valid content
      const hasRealQuestions = (questionsContent.match(/\?/g) || []).length >= 1;
      if (hasRealQuestions && isValidQuestionsContent(questionsContent)) {
        return { hasQuestions: true, content: questionsContent };
      }
      // Files exist but no real questions - task is complete
      return { hasQuestions: false, content: null };
    }

    // No files - check if content is valid
    if (isValidQuestionsContent(questionsContent)) {
      return { hasQuestions: true, content: questionsContent };
    }
  }

  // If files were generated, don't use broader detection - task is done
  if (hasFiles) {
    return { hasQuestions: false, content: null };
  }

  // No files generated - agent couldn't proceed, check for questions more broadly

  // Look for "Questions:" or "Clarification needed:" or similar sections
  const sectionRegex = /(?:questions|clarification needed|before i proceed|i need to know|please clarify|could you clarify|i have (?:some |a few )?questions?):\s*\n?([\s\S]*?)(?=\n\n\n|$)/i;
  const sectionMatch = sectionRegex.exec(response);

  if (sectionMatch && sectionMatch[1]) {
    const questionsContent = sectionMatch[1].trim();
    if (isValidQuestionsContent(questionsContent)) {
      return { hasQuestions: true, content: questionsContent };
    }
  }

  // Look for numbered questions pattern (1. What...? 2. How...?)
  const numberedQuestionsRegex = /(?:^|\n)\s*(?:\d+\.|[-•])\s*[^?\n]*\?\s*(?:\n|$)/gm;
  const numberedMatches = response.match(numberedQuestionsRegex);

  if (numberedMatches && numberedMatches.length >= 2) {
    const questionsContent = numberedMatches.map(q => q.trim()).join('\n');
    return { hasQuestions: true, content: questionsContent };
  }

  // Count question marks - multiple questions likely means clarification needed
  const questionMarks = (response.match(/\?/g) || []).length;

  if (questionMarks >= 3) {
    const questionSentences = response.match(/[^.!?\n]*\?/g);
    if (questionSentences && questionSentences.length >= 2) {
      const questionsContent = questionSentences
        .map(q => q.trim())
        .filter(q => q.length > 10)
        .join('\n• ');
      if (questionsContent.length > 20) {
        return { hasQuestions: true, content: '• ' + questionsContent };
      }
    }
  }

  return {
    hasQuestions: false,
    content: null,
  };
}

/**
 * Validates that questions content is meaningful.
 * Returns false for "None", "N/A", "No questions", etc.
 */
function isValidQuestionsContent(content: string): boolean {
  if (content.length === 0) return false;

  // Too short to be real questions
  if (content.length < 20) return false;

  const trimmed = content.trim();
  const lower = trimmed.toLowerCase();

  // Common "no questions" patterns
  const noQuestionsPatterns = [
    /^none\.?$/i,
    /^n\/a\.?$/i,
    /^no questions?\.?$/i,
    /^no clarification/i,
    /^straightforward/i,
    /^clear requirements/i,
    /^requirements are clear/i,
    /^the requirements are clear/i,
    /^no additional/i,
    /^nothing to clarify/i,
    /^all clear/i,
    /^understood/i,
    /^i understand/i,
    /^no further/i,
  ];

  for (const pattern of noQuestionsPatterns) {
    if (pattern.test(trimmed)) {
      return false;
    }
  }

  // Also check if it contains "no questions" anywhere
  if (lower.includes('no questions')) return false;

  return true;
}

/**
 * Validates parsed files for common issues.
 */
export function validateParsedFiles(files: ParsedFile[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  for (const file of files) {
    // Check for empty paths
    if (!file.path || file.path.trim() === '') {
      errors.push('Found file with empty path');
    }

    // Check for suspicious paths
    if (file.path.includes('..')) {
      errors.push(`Suspicious path detected: ${file.path}`);
    }

    // Check for empty content (warning, not necessarily an error)
    if (!file.content || file.content.trim() === '') {
      errors.push(`File has empty content: ${file.path}`);
    }

    // Check for common file extensions
    const hasValidExtension = /\.[a-zA-Z0-9]+$/.test(file.path);
    if (!hasValidExtension) {
      errors.push(`File missing extension: ${file.path}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
