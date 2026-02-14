/**
 * Unit tests for output-parser.ts
 *
 * Tests parseAgentOutput (file extraction, question detection, path normalization)
 * and validateParsedFiles (validation rules).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseAgentOutput, validateParsedFiles } from '../output-parser';

// Suppress console.log noise from the parser's debug logging
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// ---------------------------------------------------------------------------
// parseAgentOutput — file extraction
// ---------------------------------------------------------------------------
describe('parseAgentOutput — file extraction', () => {
  it('extracts a single file with double-quoted path', () => {
    const response = `Here is the file:\n<file path="src/index.ts">console.log("hello");</file>`;
    const result = parseAgentOutput(response);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe('src/index.ts');
    expect(result.files[0].content).toBe('console.log("hello");');
  });

  it('extracts a single file with single-quoted path', () => {
    const response = `<file path='src/utils.ts'>export const add = (a: number, b: number) => a + b;</file>`;
    const result = parseAgentOutput(response);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe('src/utils.ts');
    expect(result.files[0].content).toBe('export const add = (a: number, b: number) => a + b;');
  });

  it('extracts multiple files', () => {
    const response = [
      '<file path="src/a.ts">const a = 1;</file>',
      'Some explanation text here.',
      '<file path="src/b.ts">const b = 2;</file>',
      '<file path="src/c.ts">const c = 3;</file>',
    ].join('\n');

    const result = parseAgentOutput(response);

    expect(result.files).toHaveLength(3);
    expect(result.files.map(f => f.path)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
  });

  it('handles empty response (no files)', () => {
    const result = parseAgentOutput('');

    expect(result.files).toHaveLength(0);
    expect(result.hasQuestions).toBe(false);
    expect(result.rawResponse).toBe('');
  });

  it('handles file tags without matching close tag (no files extracted)', () => {
    const response = `<file path="src/broken.ts">content without closing tag`;
    const result = parseAgentOutput(response);

    // The primary regex won't match because there's no </file>.
    // Fallback also requires </file>. So 0 files.
    expect(result.files).toHaveLength(0);
  });

  it('handles files inside markdown code blocks', () => {
    const response = [
      'Here are the files:',
      '```xml',
      '<file path="src/service.ts">export class Service {}</file>',
      '```',
    ].join('\n');

    const result = parseAgentOutput(response);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe('src/service.ts');
    expect(result.files[0].content).toBe('export class Service {}');
  });

  it('uses fallback pattern for file tags without quotes on path', () => {
    const response = `<file path=src/noquote.ts>const x = 1;</file>`;
    const result = parseAgentOutput(response);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe('src/noquote.ts');
    expect(result.files[0].content).toBe('const x = 1;');
  });
});

// ---------------------------------------------------------------------------
// parseAgentOutput — path normalization
// ---------------------------------------------------------------------------
describe('parseAgentOutput — path normalization', () => {
  it('removes leading slash from path', () => {
    const response = `<file path="/etc/passwd">bad</file>`;
    const result = parseAgentOutput(response);

    expect(result.files[0].path).toBe('etc/passwd');
  });

  it('removes ../ traversal sequences from path', () => {
    const response = `<file path="../../etc/shadow">bad</file>`;
    const result = parseAgentOutput(response);

    expect(result.files[0].path).toBe('etc/shadow');
  });

  it('removes double slashes from path', () => {
    const response = `<file path="src//utils//helper.ts">ok</file>`;
    const result = parseAgentOutput(response);

    expect(result.files[0].path).toBe('src/utils/helper.ts');
  });

  it('handles combined normalization issues', () => {
    const response = `<file path="/../../src//file.ts">content</file>`;
    const result = parseAgentOutput(response);

    expect(result.files[0].path).toBe('src/file.ts');
  });
});

// ---------------------------------------------------------------------------
// parseAgentOutput — content trimming
// ---------------------------------------------------------------------------
describe('parseAgentOutput — content trimming', () => {
  it('removes leading and trailing newlines but preserves internal indentation', () => {
    const response = `<file path="src/fmt.ts">\nfunction foo() {\n  return 1;\n}\n</file>`;
    const result = parseAgentOutput(response);

    // Leading \n and trailing \n stripped; internal newlines + indentation preserved
    expect(result.files[0].content).toBe('function foo() {\n  return 1;\n}');
  });

  it('extracts file with empty content', () => {
    const response = `<file path="src/empty.ts"></file>`;
    const result = parseAgentOutput(response);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].content).toBe('');
    expect(result.files[0].path).toBe('src/empty.ts');
  });
});

// ---------------------------------------------------------------------------
// parseAgentOutput — question detection (via extractQuestions)
// ---------------------------------------------------------------------------
describe('parseAgentOutput — question detection', () => {
  it('detects ## Questions section with real questions when no files generated', () => {
    const response = [
      'I have some concerns about this task.',
      '',
      '## Questions',
      '1. What database engine should we use for this feature?',
      '2. Should we implement caching or is latency not a concern?',
    ].join('\n');

    const result = parseAgentOutput(response);

    expect(result.files).toHaveLength(0);
    expect(result.hasQuestions).toBe(true);
    expect(result.questionsContent).toBeTruthy();
    expect(result.questionsContent).toContain('database engine');
  });

  it('ignores ## Questions section when files ARE generated and content says "None"', () => {
    const response = [
      '<file path="src/app.ts">const app = express();</file>',
      '',
      '## Questions',
      'None.',
    ].join('\n');

    const result = parseAgentOutput(response);

    expect(result.files).toHaveLength(1);
    expect(result.hasQuestions).toBe(false);
    expect(result.questionsContent).toBeNull();
  });

  it('ignores "None" / "N/A" / "No questions" in Questions section', () => {
    const noneVariants = ['None', 'N/A', 'No questions', 'No questions.'];

    for (const variant of noneVariants) {
      const response = [
        `## Questions`,
        variant,
        '',
        'That is all.',
      ].join('\n');

      const result = parseAgentOutput(response);
      expect(result.hasQuestions).toBe(false, `Should reject: "${variant}"`);
    }
  });

  it('detects numbered question patterns when no files', () => {
    const response = [
      'I need some clarification before building this:',
      '',
      '1. What authentication provider should we use?',
      '2. How should we handle rate limiting?',
      '3. Where should logs be stored?',
    ].join('\n');

    const result = parseAgentOutput(response);

    expect(result.files).toHaveLength(0);
    expect(result.hasQuestions).toBe(true);
    expect(result.questionsContent).toBeTruthy();
  });

  it('detects multiple question marks (>=3) when no files', () => {
    const response = [
      'There are several unknowns here.',
      'Should we use PostgreSQL or MySQL for this feature?',
      'What is the expected throughput? Is it bursty or steady?',
      'Do we need to support websockets for real-time updates?',
    ].join('\n');

    const result = parseAgentOutput(response);

    expect(result.files).toHaveLength(0);
    expect(result.hasQuestions).toBe(true);
    expect(result.questionsContent).toBeTruthy();
  });

  it('returns hasQuestions=false when files exist even if response has question marks', () => {
    const response = [
      '<file path="src/handler.ts">export function handler() { return "ok"; }</file>',
      '',
      'Should we add more error handling? What about retries? Is this enough?',
    ].join('\n');

    const result = parseAgentOutput(response);

    expect(result.files).toHaveLength(1);
    expect(result.hasQuestions).toBe(false);
  });

  it('detects "Before I proceed" / "I need to know" patterns when no files', () => {
    const response = [
      'Before I proceed:',
      'I need to understand the expected data volume and whether we need pagination or infinite scroll for the listing page.',
    ].join('\n');

    const result = parseAgentOutput(response);

    expect(result.files).toHaveLength(0);
    expect(result.hasQuestions).toBe(true);
    expect(result.questionsContent).toBeTruthy();
  });

  it('treats content less than 20 chars as not valid questions', () => {
    const response = [
      '## Questions',
      'Just a short note.',
    ].join('\n');

    const result = parseAgentOutput(response);

    // "Just a short note." is 18 chars — under the 20-char threshold
    expect(result.hasQuestions).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseAgentOutput — questionsAreInformational (phantom question discard)
// ---------------------------------------------------------------------------
describe('parseAgentOutput — questionsAreInformational', () => {
  it('marks questions as informational when files AND ## Questions header both present', () => {
    const response = [
      '## Understanding',
      'Building a weather dashboard.',
      '',
      '## Questions',
      'Should we add ARIA live regions for screen reader support?',
      'Should this component support RTL layouts?',
      '',
      '<file path="src/components/WeatherDashboard.tsx">',
      'export function WeatherDashboard() {',
      '  return <div aria-live="polite">Weather data here</div>;',
      '}',
      '</file>',
      '',
      '<file path="src/components/WeatherCard.tsx">',
      'export function WeatherCard({ temp }: { temp: number }) {',
      '  return <div>{temp}°F</div>;',
      '}',
      '</file>',
    ].join('\n');

    const result = parseAgentOutput(response);

    expect(result.files).toHaveLength(2);
    expect(result.hasQuestions).toBe(true);
    expect(result.questionsContent).toBeTruthy();
    expect(result.questionsAreInformational).toBe(true);
  });

  it('does NOT mark questions as informational when no files generated', () => {
    const response = [
      '## Understanding',
      'I need more information.',
      '',
      '## Questions',
      '1. Which API endpoint should I call for the data?',
      '2. What authentication method should I use?',
      '3. Should the component support offline mode?',
    ].join('\n');

    const result = parseAgentOutput(response);

    expect(result.files).toHaveLength(0);
    expect(result.hasQuestions).toBe(true);
    expect(result.questionsAreInformational).toBe(false);
  });

  it('is false when files present but no questions detected', () => {
    const response = '<file path="src/clean.ts">export const clean = true;</file>';
    const result = parseAgentOutput(response);

    expect(result.files).toHaveLength(1);
    expect(result.hasQuestions).toBe(false);
    expect(result.questionsAreInformational).toBe(false);
  });

  it('is false when neither files nor questions present', () => {
    const response = 'Here is a simple explanation with no code or questions.';
    const result = parseAgentOutput(response);

    expect(result.files).toHaveLength(0);
    expect(result.hasQuestions).toBe(false);
    expect(result.questionsAreInformational).toBe(false);
  });

  it('handles the real-world phantom question pattern (7 files + questions)', () => {
    // Simulates the exact pattern seen in Weather Forecast test run
    const questionSection = [
      '## Questions',
      'Should we add ARIA live regions for dynamic weather updates?',
      'Would it be beneficial to add a loading skeleton component?',
      'Should the forecast display support accessibility for color-blind users?',
    ].join('\n');

    const files = Array.from({ length: 7 }, (_, i) =>
      `<file path="src/components/weather/Component${i}.tsx">\nexport function Component${i}() { return <div>Component ${i}</div>; }\n</file>`
    ).join('\n\n');

    const response = `## Understanding\nBuilding weather forecast UI.\n\n${questionSection}\n\n${files}`;

    const result = parseAgentOutput(response);

    expect(result.files).toHaveLength(7);
    expect(result.hasQuestions).toBe(true);
    expect(result.questionsAreInformational).toBe(true);
  });

  it('is false when "Questions" section says "None" even with files', () => {
    const response = [
      '## Questions',
      'None.',
      '',
      '<file path="src/app.ts">const app = 1;</file>',
    ].join('\n');

    const result = parseAgentOutput(response);

    expect(result.files).toHaveLength(1);
    expect(result.hasQuestions).toBe(false);
    expect(result.questionsAreInformational).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateParsedFiles
// ---------------------------------------------------------------------------
describe('validateParsedFiles', () => {
  it('valid files pass validation', () => {
    const result = validateParsedFiles([
      { path: 'src/index.ts', content: 'console.log("ok");' },
      { path: 'src/utils/helper.ts', content: 'export const x = 1;' },
    ]);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('empty path fails', () => {
    const result = validateParsedFiles([
      { path: '', content: 'some content' },
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('empty path'));
  });

  it('path with ".." is flagged as suspicious', () => {
    const result = validateParsedFiles([
      { path: '../etc/passwd', content: 'root' },
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('Suspicious path'));
  });

  it('empty content is flagged', () => {
    const result = validateParsedFiles([
      { path: 'src/empty.ts', content: '' },
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('empty content'));
  });

  it('missing file extension is flagged', () => {
    const result = validateParsedFiles([
      { path: 'Dockerfile', content: 'FROM node:20' },
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('missing extension'));
  });

  it('accumulates multiple errors across files', () => {
    const result = validateParsedFiles([
      { path: '', content: 'content' },           // empty path
      { path: '../bad/path.ts', content: 'ok' },   // suspicious + traversal
      { path: 'noext', content: '' },               // no extension + empty content
    ]);

    expect(result.valid).toBe(false);
    // At minimum: empty path, suspicious path, missing extension, empty content
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });
});
