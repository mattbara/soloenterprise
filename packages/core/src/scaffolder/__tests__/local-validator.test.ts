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

  // ===========================================================================
  // Common code problem detection — tests which checks the validator catches
  // vs misses, to identify gaps for future hardening.
  // ===========================================================================
  describe('common code problem detection', () => {
    it('should flag import from @soloenterprise/nonexistent-package', () => {
      const importMap = resolveImports();
      const result = validateGeneratedCode(
        [
          {
            path: 'service.ts',
            content: [
              "import { deployProject } from '@soloenterprise/nonexistent-package';",
              'export function run() { return deployProject(); }',
            ].join('\n'),
          },
        ],
        { checkImports: true, importMap },
      );

      expect(result.valid).toBe(false);
      const importErrors = result.errors.filter(e => e.type === 'import');
      expect(importErrors.length).toBeGreaterThan(0);
      expect(importErrors[0].message).toContain('@soloenterprise/nonexistent-package');
    });

    it('should flag import from @/utils/does-not-exist', () => {
      const importMap = resolveImports();
      const result = validateGeneratedCode(
        [
          {
            path: 'helper.ts',
            content: [
              "import { formatDate } from '@/utils/does-not-exist';",
              'export const date = formatDate(new Date());',
            ].join('\n'),
          },
        ],
        { checkImports: true, importMap },
      );

      expect(result.valid).toBe(false);
      const importErrors = result.errors.filter(e => e.type === 'import');
      expect(importErrors.length).toBeGreaterThan(0);
      expect(importErrors[0].message).toContain('utils');
      expect(importErrors[0].message).toContain('known prefixes');
    });

    it('should flag undefined function reference (currently missed — gap)', () => {
      const result = validateGeneratedCode([
        {
          path: 'deploy.ts',
          content: [
            'export async function deploy() {',
            '  const status = validateDeployment();',
            '  return status;',
            '}',
          ].join('\n'),
        },
      ]);

      // TypeScript compiler uses getSyntacticDiagnostics only — no semantic checks.
      // Undefined references are NOT caught. This documents the gap.
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should flag unused variable (currently missed — gap)', () => {
      const result = validateGeneratedCode([
        {
          path: 'utils.ts',
          content: [
            "const unusedConfig = { timeout: 5000, retries: 3 };",
            'export function greet(name: string) {',
            '  return `Hello, ${name}`;',
            '}',
          ].join('\n'),
        },
      ]);

      // noUnusedLocals requires semantic analysis with strict: true.
      // Syntax-only validation does NOT catch unused variables.
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should flag syntax error from missing closing brace', () => {
      const result = validateGeneratedCode([
        {
          path: 'broken.ts',
          content: [
            'export function processOrder(orderId: string) {',
            '  const result = fetch(`/api/orders/${orderId}`);',
            '  if (result) {',
            '    return result;',
            '  // missing closing brace for if',
            '// missing closing brace for function',
          ].join('\n'),
        },
      ]);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].type).toBe('syntax');
    });

    it('should pass valid file with correct imports', () => {
      const importMap = resolveImports();
      const result = validateGeneratedCode(
        [
          {
            path: 'client-form.tsx',
            content: [
              "import { z } from 'zod';",
              "import { useForm } from 'react-hook-form';",
              "import { zodResolver } from '@hookform/resolvers/zod';",
              "import { Button } from '@/components/ui/button';",
              '',
              'const schema = z.object({',
              '  name: z.string().min(1),',
              '  email: z.string().email(),',
              '});',
              '',
              'type FormData = z.infer<typeof schema>;',
              '',
              'export default function ClientForm() {',
              '  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({',
              '    resolver: zodResolver(schema),',
              '  });',
              '  return (',
              '    <form onSubmit={handleSubmit((data) => console.log(data))}>',
              '      <input {...register("name")} />',
              '      {errors.name && <span>{errors.name.message}</span>}',
              '      <Button type="submit">Save</Button>',
              '    </form>',
              '  );',
              '}',
            ].join('\n'),
          },
        ],
        { checkImports: true, importMap },
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
