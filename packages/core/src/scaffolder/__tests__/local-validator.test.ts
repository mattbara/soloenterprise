import { describe, it, expect } from 'vitest';
import { validateGeneratedCode } from '../local-validator';
import { resolveImports } from '../import-resolver';

describe('local-validator', () => {
  describe('syntax validation', () => {
    it('should pass valid TypeScript', () => {
      const result = validateGeneratedCode([
        { path: 'test.ts', content: 'const x: number = 42;\nexport { x };' },
      ]);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect syntax errors', () => {
      const result = validateGeneratedCode([
        { path: 'test.ts', content: 'const x: number = ;' },
      ]);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].type).toBe('syntax');
    });

    it('should handle TSX content', () => {
      const result = validateGeneratedCode([
        { path: 'test.tsx', content: 'const App = () => <div>Hello</div>;\nexport default App;' },
      ]);

      expect(result.valid).toBe(true);
    });

    it('should skip non-TS files when skipNonTS is true', () => {
      const result = validateGeneratedCode(
        [
          { path: 'readme.md', content: '# Hello' },
          { path: 'data.json', content: '{ invalid }' },
        ],
        { skipNonTS: true },
      );

      expect(result.valid).toBe(true);
    });

    it('should validate multiple files', () => {
      const result = validateGeneratedCode([
        { path: 'a.ts', content: 'export const a = 1;' },
        { path: 'b.ts', content: 'export const b = ;' }, // syntax error
      ]);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].file).toBe('b.ts');
    });
  });

  describe('import validation', () => {
    it('should pass known imports', () => {
      const importMap = resolveImports();
      const result = validateGeneratedCode(
        [
          {
            path: 'test.ts',
            content: "import { eq } from 'drizzle-orm';\nimport { z } from 'zod';\nconst x = 1;",
          },
        ],
        { checkImports: true, importMap },
      );

      expect(result.valid).toBe(true);
    });

    it('should flag unknown package imports', () => {
      const importMap = resolveImports();
      const result = validateGeneratedCode(
        [
          {
            path: 'test.ts',
            content: "import { foo } from 'totally-fake-package';\nconst x = 1;",
          },
        ],
        { checkImports: true, importMap },
      );

      expect(result.valid).toBe(false);
      const importErrors = result.errors.filter(e => e.type === 'import');
      expect(importErrors.length).toBeGreaterThan(0);
      expect(importErrors[0].message).toContain('totally-fake-package');
    });

    it('should skip relative imports', () => {
      const importMap = resolveImports();
      const result = validateGeneratedCode(
        [
          {
            path: 'test.ts',
            content: "import { foo } from './local-module';\nconst x = 1;",
          },
        ],
        { checkImports: true, importMap },
      );

      expect(result.valid).toBe(true);
    });

    it('should skip @/ alias imports', () => {
      const importMap = resolveImports();
      const result = validateGeneratedCode(
        [
          {
            path: 'test.ts',
            content: "import { Button } from '@/components/ui/button';\nconst x = 1;",
          },
        ],
        { checkImports: true, importMap },
      );

      expect(result.valid).toBe(true);
    });
  });
});
