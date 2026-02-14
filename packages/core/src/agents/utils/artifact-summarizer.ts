/**
 * Artifact Summarizer
 *
 * Reduces full file contents to their API surface for use as dependency context
 * in Architect spec generation. Prevents token bloat when downstream tasks
 * load many dependency artifacts.
 *
 * Strategy: Extract only what a consumer needs to INTEGRATE with this file:
 * - Exported types, interfaces, enums
 * - Exported function signatures (name, params, return type)
 * - Exported component props interfaces
 * - Exported constants
 * - Hook return types
 *
 * Strips: Implementation details, internal functions, comments, JSX bodies,
 * function body logic, non-re-export imports.
 */

export interface ArtifactSummary {
  filePath: string;
  originalTokens: number;
  summaryTokens: number;
  reductionPercent: number;
  summary: string;
}

// Files that should NEVER be summarized — they ARE the contract
const NEVER_SUMMARIZE_PATTERNS = [
  /schema\.ts$/,
  /types\.(ts|tsx)$/,
  /index\.(ts|tsx)$/,
  /\.d\.ts$/,
  /\.test\.(ts|tsx)$/,
  /config\.(ts|js|mjs)$/,
];

// Files smaller than this are included in full (not worth summarizing)
const SUMMARY_THRESHOLD_CHARS = 500;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function shouldSummarize(filePath: string, content: string): boolean {
  if (content.length <= SUMMARY_THRESHOLD_CHARS) return false;
  if (NEVER_SUMMARIZE_PATTERNS.some((pattern) => pattern.test(filePath)))
    return false;
  return true;
}

export function summarizeArtifact(
  filePath: string,
  content: string
): ArtifactSummary {
  const originalTokens = estimateTokens(content);

  const ext = filePath.split('.').pop()?.toLowerCase();

  let summary: string;

  switch (ext) {
    case 'ts':
    case 'tsx':
      summary = summarizeTypeScript(filePath, content);
      break;
    case 'css':
    case 'scss':
      summary = summarizeStyles(filePath, content);
      break;
    case 'json':
      summary = summarizeJson(filePath, content);
      break;
    case 'md':
      summary =
        content.split('\n').slice(0, 5).join('\n') + '\n// ... (truncated)';
      break;
    default:
      summary =
        content.split('\n').slice(0, 10).join('\n') + '\n// ... (truncated)';
      break;
  }

  const summaryTokens = estimateTokens(summary);

  return {
    filePath,
    originalTokens,
    summaryTokens,
    reductionPercent: Math.round(
      (1 - summaryTokens / Math.max(originalTokens, 1)) * 100
    ),
    summary,
  };
}

// ---------------------------------------------------------------------------
// TypeScript summarizer — extracts API surface
// ---------------------------------------------------------------------------

function summarizeTypeScript(filePath: string, content: string): string {
  const lines = content.split('\n');
  const summaryLines: string[] = [`// === ${filePath} (API Surface) ===`];

  // PASS 1: Extract exported type/interface/enum definitions (full)
  extractTypeBlocks(lines, summaryLines);

  // PASS 2: Extract exported function/const signatures (no bodies)
  extractFunctionSignatures(lines, summaryLines);

  // PASS 3: Extract re-exports
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^export\s+\{/.test(trimmed) || /^export\s+\*/.test(trimmed)) {
      summaryLines.push(trimmed);
    }
  }

  // Fallback: if nothing was extracted, include first 10 lines
  if (summaryLines.length <= 1) {
    summaryLines.push('// No exports detected — first 10 lines:');
    summaryLines.push(...lines.slice(0, 10));
    summaryLines.push('// ... (truncated)');
  }

  return summaryLines.join('\n');
}

function extractTypeBlocks(lines: string[], out: string[]): void {
  let inTypeBlock = false;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (!inTypeBlock && /^export\s+(type|interface|enum)\s+/.test(trimmed)) {
      inTypeBlock = true;
      braceDepth = 0;
    }

    if (inTypeBlock) {
      out.push(lines[i]);
      braceDepth += (lines[i].match(/{/g) || []).length;
      braceDepth -= (lines[i].match(/}/g) || []).length;

      // Single-line type alias with no braces (e.g. `export type Foo = string;`)
      if (braceDepth === 0 && !lines[i].includes('{') && trimmed.endsWith(';')) {
        inTypeBlock = false;
      }
      // Multi-line block closed
      if (braceDepth <= 0 && lines[i].includes('}')) {
        inTypeBlock = false;
        out.push('');
      }
    }
  }
}

function extractFunctionSignatures(lines: string[], out: string[]): void {
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Skip types/interfaces (already handled in pass 1)
    if (/^export\s+(type|interface|enum)\s+/.test(trimmed)) continue;
    // Skip re-exports (handled in pass 3)
    if (/^export\s+(\{|\*)/.test(trimmed)) continue;

    // Exported function
    if (
      /^export\s+(async\s+)?function\s+\w+/.test(trimmed) ||
      /^export\s+default\s+(async\s+)?function/.test(trimmed)
    ) {
      let signature = '';
      for (let j = i; j < lines.length && j < i + 5; j++) {
        signature += lines[j] + '\n';
        if (lines[j].includes('{')) {
          signature = signature.replace(/\{[^]*$/, '{ /* ... */ }');
          break;
        }
      }
      out.push(signature.trim());
      out.push('');
      continue;
    }

    // Exported const
    if (/^export\s+const\s+\w+/.test(trimmed)) {
      let signature = trimmed;

      if (trimmed.includes('=>')) {
        // Single-line arrow function
        signature = trimmed.replace(/=>\s*\{[^]*$/, '=> { /* ... */ }');
        signature = signature.replace(/=>\s*\([^]*$/, '=> ( /* ... */ )');
      } else if (trimmed.includes('= (') || trimmed.endsWith('= (')) {
        // Multi-line arrow function — capture up to =>
        let fullSig = '';
        for (let j = i; j < lines.length && j < i + 8; j++) {
          fullSig += lines[j].trim() + ' ';
          if (lines[j].includes('=>')) {
            fullSig = fullSig.replace(/=>\s*\{[^]*$/, '=> { /* ... */ }');
            fullSig = fullSig.replace(/=>\s*\([^]*$/, '=> ( /* ... */ )');
            break;
          }
        }
        signature = fullSig.trim();
      } else if (!trimmed.endsWith(';')) {
        // Multi-line const value — just show the declaration line
        signature = trimmed + ' // ...';
      }

      out.push(signature);
      out.push('');
      continue;
    }

    // Exported class
    if (/^export\s+(abstract\s+)?class\s+\w+/.test(trimmed)) {
      // Capture the class declaration line
      let classLine = trimmed;
      if (!trimmed.includes('{')) {
        for (let j = i + 1; j < lines.length && j < i + 3; j++) {
          classLine += ' ' + lines[j].trim();
          if (lines[j].includes('{')) break;
        }
      }
      classLine = classLine.replace(/\{[^]*$/, '{ /* ... */ }');
      out.push(classLine);
      out.push('');
      continue;
    }
  }
}

// ---------------------------------------------------------------------------
// CSS/SCSS summarizer — extract class names only
// ---------------------------------------------------------------------------

function summarizeStyles(filePath: string, content: string): string {
  const classNames = content.match(/\.([\w-]+)\s*\{/g) || [];
  const names = classNames.map((c) => c.replace('{', '').trim());
  if (names.length === 0) return `// ${filePath} — no class names detected`;
  return `// ${filePath} — CSS classes: ${names.join(', ')}`;
}

// ---------------------------------------------------------------------------
// JSON summarizer — top-level keys only
// ---------------------------------------------------------------------------

function summarizeJson(filePath: string, content: string): string {
  try {
    const parsed = JSON.parse(content);
    const keys = Object.keys(parsed);
    return `// ${filePath} — keys: ${keys.join(', ')}`;
  } catch {
    return `// ${filePath} — (unparseable JSON)`;
  }
}
