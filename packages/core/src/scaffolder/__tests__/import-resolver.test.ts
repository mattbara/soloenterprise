import { describe, it, expect } from 'vitest';
import { resolveImports, formatImportMapForPrompt, formatImportStatements } from '../import-resolver';

const MINI_SCHEMA = `
import { pgTable, uuid, text, pgEnum } from 'drizzle-orm/pg-core';

export const statusEnum = pgEnum('status', ['active', 'inactive']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  status: statusEnum('status').notNull(),
});

export const posts = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
});
`;

describe('import-resolver', () => {
  describe('resolveImports', () => {
    it('should include static drizzle-orm exports', () => {
      const map = resolveImports();
      expect(map.entries.has('eq')).toBe(true);
      expect(map.entries.get('eq')!.from).toBe('drizzle-orm');
      expect(map.entries.has('and')).toBe(true);
      expect(map.entries.has('sql')).toBe(true);
    });

    it('should include static zod exports', () => {
      const map = resolveImports();
      expect(map.entries.has('z')).toBe(true);
      expect(map.entries.get('z')!.from).toBe('zod');
    });

    it('should include static vitest exports', () => {
      const map = resolveImports();
      expect(map.entries.has('describe')).toBe(true);
      expect(map.entries.has('expect')).toBe(true);
      expect(map.entries.has('vi')).toBe(true);
      expect(map.entries.get('describe')!.from).toBe('vitest');
    });

    it('should include react exports', () => {
      const map = resolveImports();
      expect(map.entries.has('useState')).toBe(true);
      expect(map.entries.get('useState')!.from).toBe('react');
    });

    it('should include next.js exports with correct paths', () => {
      const map = resolveImports();
      expect(map.entries.has('useRouter')).toBe(true);
      expect(map.entries.get('useRouter')!.from).toBe('next/navigation');
      expect(map.entries.has('Link')).toBe(true);
      expect(map.entries.get('Link')!.from).toBe('next/link');
    });

    it('should include type-only imports marked correctly', () => {
      const map = resolveImports();
      const metadata = map.entries.get('Metadata');
      expect(metadata).toBeDefined();
      expect(metadata!.isType).toBe(true);
    });

    it('should include db package export', () => {
      const map = resolveImports();
      expect(map.entries.has('db')).toBe(true);
      expect(map.entries.get('db')!.from).toBe('@soloenterprise/db');
    });

    it('should parse schema and add table/enum exports', () => {
      const map = resolveImports(MINI_SCHEMA);

      // Tables
      expect(map.entries.has('users')).toBe(true);
      expect(map.entries.get('users')!.from).toBe('@soloenterprise/db/schema');
      expect(map.entries.has('posts')).toBe(true);
      expect(map.entries.get('posts')!.from).toBe('@soloenterprise/db/schema');

      // Enums
      expect(map.entries.has('statusEnum')).toBe(true);
      expect(map.entries.get('statusEnum')!.from).toBe('@soloenterprise/db/schema');
    });

    it('should add shadcn components with correct paths', () => {
      const map = resolveImports(undefined, ['Button', 'Card', 'DialogContent']);

      expect(map.entries.has('Button')).toBe(true);
      expect(map.entries.get('Button')!.from).toBe('@/components/ui/button');
      expect(map.entries.has('Card')).toBe(true);
      expect(map.entries.get('Card')!.from).toBe('@/components/ui/card');
      expect(map.entries.has('DialogContent')).toBe(true);
      expect(map.entries.get('DialogContent')!.from).toBe('@/components/ui/dialog-content');
    });

    it('should populate byPackage correctly', () => {
      const map = resolveImports(MINI_SCHEMA);

      const drizzleExports = map.byPackage.get('drizzle-orm');
      expect(drizzleExports).toBeDefined();
      expect(drizzleExports).toContain('eq');
      expect(drizzleExports).toContain('and');

      const schemaExports = map.byPackage.get('@soloenterprise/db/schema');
      expect(schemaExports).toBeDefined();
      expect(schemaExports).toContain('users');
      expect(schemaExports).toContain('posts');
      expect(schemaExports).toContain('statusEnum');
    });
  });

  describe('formatImportMapForPrompt', () => {
    it('should format import map as readable text', () => {
      const map = resolveImports(MINI_SCHEMA);
      const formatted = formatImportMapForPrompt(map);

      expect(formatted).toContain('## Available Imports');
      expect(formatted).toContain('**drizzle-orm:**');
      expect(formatted).toContain('eq');
      expect(formatted).toContain('**@soloenterprise/db/schema:**');
      expect(formatted).toContain('users');
    });

    it('should sort packages alphabetically', () => {
      const map = resolveImports();
      const formatted = formatImportMapForPrompt(map);
      const lines = formatted.split('\n').filter(l => l.startsWith('**'));

      // Verify alphabetical order
      const packages = lines.map(l => l.match(/\*\*(.+?):\*\*/)?.[1] ?? '');
      const sorted = [...packages].sort();
      expect(packages).toEqual(sorted);
    });
  });

  describe('formatImportStatements', () => {
    it('should generate correct import statements', () => {
      const map = resolveImports(MINI_SCHEMA);
      const result = formatImportStatements(['eq', 'and', 'users', 'z'], map);

      expect(result).toContain("import { users } from '@soloenterprise/db/schema';");
      expect(result).toContain("import { and, eq } from 'drizzle-orm';");
      expect(result).toContain("import { z } from 'zod';");
    });

    it('should separate type imports', () => {
      const map = resolveImports();
      const result = formatImportStatements(['useRouter', 'Metadata'], map);

      expect(result).toContain("import { useRouter } from 'next/navigation';");
      expect(result).toContain("import type { Metadata } from 'next';");
    });

    it('should skip unknown imports', () => {
      const map = resolveImports();
      const result = formatImportStatements(['nonExistent', 'eq'], map);

      expect(result).not.toContain('nonExistent');
      expect(result).toContain('eq');
    });

    it('should sort imports within each package', () => {
      const map = resolveImports();
      const result = formatImportStatements(['or', 'eq', 'and'], map);

      expect(result).toContain("import { and, eq, or } from 'drizzle-orm';");
    });
  });
});
