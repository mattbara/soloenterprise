import { describe, it, expect } from 'vitest';
import { buildScaffoldPrompt, buildValidationRetryPrompt } from '../prompt-builder';
import { resolveImports } from '../import-resolver';

describe('prompt-builder', () => {
  describe('buildScaffoldPrompt', () => {
    it('should include all three sections', () => {
      const importMap = resolveImports();
      const prompt = buildScaffoldPrompt({
        scaffoldFiles: [
          { path: 'src/routes/users.ts', content: '// route scaffold' },
        ],
        requirements: 'Build CRUD for users',
        importMap,
      });

      expect(prompt).toContain('--- SCAFFOLD ---');
      expect(prompt).toContain('--- REQUIREMENTS ---');
      expect(prompt).toContain('--- AVAILABLE IMPORTS ---');
    });

    it('should include scaffold files in file tags', () => {
      const importMap = resolveImports();
      const prompt = buildScaffoldPrompt({
        scaffoldFiles: [
          { path: 'src/routes/users.ts', content: 'const route = new Hono();' },
          { path: 'src/validators/users.ts', content: 'export const schema = z.object({});' },
        ],
        requirements: 'test',
        importMap,
      });

      expect(prompt).toContain('<file path="src/routes/users.ts">');
      expect(prompt).toContain('const route = new Hono();');
      expect(prompt).toContain('<file path="src/validators/users.ts">');
    });

    it('should include requirements', () => {
      const importMap = resolveImports();
      const prompt = buildScaffoldPrompt({
        scaffoldFiles: [],
        requirements: 'Build a user management system with authentication',
        importMap,
      });

      expect(prompt).toContain('Build a user management system with authentication');
    });

    it('should include tech spec when provided', () => {
      const importMap = resolveImports();
      const prompt = buildScaffoldPrompt({
        scaffoldFiles: [],
        requirements: 'test',
        importMap,
        techSpec: '## Architecture\nUse repository pattern',
      });

      expect(prompt).toContain('--- TECHNICAL SPECIFICATION ---');
      expect(prompt).toContain('Use repository pattern');
    });

    it('should include import map from import resolver', () => {
      const importMap = resolveImports();
      const prompt = buildScaffoldPrompt({
        scaffoldFiles: [],
        requirements: 'test',
        importMap,
      });

      expect(prompt).toContain('## Available Imports');
      expect(prompt).toContain('drizzle-orm');
      expect(prompt).toContain('Do NOT invent import paths');
    });

    it('should instruct Claude to fill TODOs', () => {
      const importMap = resolveImports();
      const prompt = buildScaffoldPrompt({
        scaffoldFiles: [{ path: 'test.ts', content: '// TODO: implement' }],
        requirements: 'test',
        importMap,
      });

      expect(prompt).toContain('fill in the TODO comments');
      expect(prompt).toContain('Do NOT change imports');
    });
  });

  describe('buildValidationRetryPrompt', () => {
    it('should include error details', () => {
      const prompt = buildValidationRetryPrompt({
        scaffoldFiles: [{ path: 'test.ts', content: 'const x = 1;' }],
        errors: [
          { file: 'test.ts', line: 5, message: 'Unexpected token', type: 'syntax' },
        ],
        previousOutput: 'broken code here',
      });

      expect(prompt).toContain('--- VALIDATION ERRORS ---');
      expect(prompt).toContain('test.ts');
      expect(prompt).toContain('LINE: 5');
      expect(prompt).toContain('Unexpected token');
    });

    it('should include previous output', () => {
      const prompt = buildValidationRetryPrompt({
        scaffoldFiles: [],
        errors: [],
        previousOutput: 'const x = !!broken!!',
      });

      expect(prompt).toContain('--- YOUR PREVIOUS OUTPUT');
      expect(prompt).toContain('const x = !!broken!!');
    });

    it('should include original scaffold for reference', () => {
      const prompt = buildValidationRetryPrompt({
        scaffoldFiles: [{ path: 'test.ts', content: 'original scaffold content' }],
        errors: [],
        previousOutput: '',
      });

      expect(prompt).toContain('--- ORIGINAL SCAFFOLD');
      expect(prompt).toContain('original scaffold content');
    });
  });
});
