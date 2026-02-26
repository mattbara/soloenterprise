import { describe, it, expect } from 'vitest';
import { validateGeneratedCode } from '../local-validator';
import { buildValidationRetryPrompt } from '../prompt-builder';

describe('Retry Pipeline (end-to-end wiring)', () => {
  const brokenFile = {
    path: 'src/routes/users.ts',
    content: [
      'import { Hono } from "hono";',
      '',
      'const app = new Hono();',
      '',
      'app.get("/users", (c) => {',
      '  return c.json({ users: [] })',
      // missing closing brace
    ].join('\n'),
  };

  const fixedFile = {
    path: 'src/routes/users.ts',
    content: [
      'import { Hono } from "hono";',
      '',
      'const app = new Hono();',
      '',
      'app.get("/users", (c) => {',
      '  return c.json({ users: [] });',
      '});',
    ].join('\n'),
  };

  it('detects syntax error in broken file', () => {
    const result = validateGeneratedCode([brokenFile]);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors[0].file).toBe('src/routes/users.ts');
    expect(result.errors[0].type).toBe('syntax');
  });

  it('formats validation errors into retry prompt', () => {
    const { errors } = validateGeneratedCode([brokenFile]);

    const retryPrompt = buildValidationRetryPrompt({
      scaffoldFiles: [brokenFile],
      errors,
      previousOutput: brokenFile.content,
    });

    // Prompt contains the error section
    expect(retryPrompt).toContain('VALIDATION ERRORS');
    // Prompt references the broken file
    expect(retryPrompt).toContain('src/routes/users.ts');
    // Prompt includes the error type
    expect(retryPrompt).toContain('syntax');
    // Prompt includes the previous broken output
    expect(retryPrompt).toContain('PREVIOUS OUTPUT');
    expect(retryPrompt).toContain(brokenFile.content);
    // Prompt includes the scaffold for reference
    expect(retryPrompt).toContain('ORIGINAL SCAFFOLD');
  });

  it('passes validation after fix', () => {
    const result = validateGeneratedCode([fixedFile]);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('full pipeline: broken → validate → retry prompt → fixed → validate', () => {
    // Step 1: Validate broken code — fails
    const firstPass = validateGeneratedCode([brokenFile]);
    expect(firstPass.valid).toBe(false);

    // Step 2: Build retry prompt with the errors
    const retryPrompt = buildValidationRetryPrompt({
      scaffoldFiles: [brokenFile],
      errors: firstPass.errors,
      previousOutput: brokenFile.content,
    });

    // Step 3: Verify prompt has everything Claude needs to fix the code
    for (const error of firstPass.errors) {
      expect(retryPrompt).toContain(error.message);
      expect(retryPrompt).toContain(error.file);
    }

    // Step 4: Simulate Claude returning fixed code — validate again
    const secondPass = validateGeneratedCode([fixedFile]);
    expect(secondPass.valid).toBe(true);
    expect(secondPass.errors).toHaveLength(0);
  });
});
