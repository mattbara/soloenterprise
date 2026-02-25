import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseDrizzleSchema } from '../drizzle-schema-parser';
import { generateZodSchemas, generateZodSchemasForTable } from '../zod-from-drizzle';

const SCHEMA_PATH = resolve(process.cwd(), '..', 'db', 'src', 'schema.ts');
let realSchemaSource: string;
try {
  realSchemaSource = readFileSync(SCHEMA_PATH, 'utf-8');
} catch {
  realSchemaSource = '';
}

const MINI_SCHEMA = `
import { pgTable, uuid, text, timestamp, boolean, jsonb, integer, pgEnum } from 'drizzle-orm/pg-core';

export const statusEnum = pgEnum('status', ['active', 'inactive', 'pending']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  status: statusEnum('status').notNull().default('active'),
  age: integer('age'),
  isVerified: boolean('is_verified').notNull().default(false),
  metadata: jsonb('metadata').$type<{ bio?: string }>().default({}),
  tags: text('tags').array(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
`;

describe('zod-from-drizzle', () => {
  describe('generateZodSchemas', () => {
    it('should generate schemas for all tables', () => {
      const schema = parseDrizzleSchema(MINI_SCHEMA);
      const result = generateZodSchemas(schema);

      expect(result.schemas).toHaveLength(1);
      expect(result.schemas[0].tableName).toBe('Users');
    });

    it('should generate valid insert schema skipping PK + defaults', () => {
      const schema = parseDrizzleSchema(MINI_SCHEMA);
      const result = generateZodSchemas(schema);
      const insert = result.schemas[0].insertSchema;

      // Should NOT have id (PK with default)
      expect(insert).not.toContain('id:');

      // Required fields
      expect(insert).toContain('name: z.string(),');
      expect(insert).toContain('email: z.string(),');

      // Optional fields (has default or nullable)
      expect(insert).toContain('status: z.enum([').and.toContain('.optional()');
      expect(insert).toContain('isVerified: z.boolean().optional()');
      expect(insert).toContain('age: z.number().int().optional()');
      expect(insert).toContain('createdAt:');
    });

    it('should generate correct enum Zod types', () => {
      const schema = parseDrizzleSchema(MINI_SCHEMA);
      const result = generateZodSchemas(schema);
      const insert = result.schemas[0].insertSchema;

      expect(insert).toContain("z.enum(['active', 'inactive', 'pending'])");
    });

    it('should generate correct array column types', () => {
      const schema = parseDrizzleSchema(MINI_SCHEMA);
      const result = generateZodSchemas(schema);
      const insert = result.schemas[0].insertSchema;

      expect(insert).toContain('tags: z.array(z.string()).optional()');
    });

    it('should generate jsonb as z.unknown()', () => {
      const schema = parseDrizzleSchema(MINI_SCHEMA);
      const result = generateZodSchemas(schema);
      const insert = result.schemas[0].insertSchema;

      expect(insert).toContain('metadata: z.unknown().optional()');
    });

    it('should generate update schema as partial', () => {
      const schema = parseDrizzleSchema(MINI_SCHEMA);
      const result = generateZodSchemas(schema);

      expect(result.schemas[0].updateSchema).toBe('insertUsersSchema.partial()');
    });

    it('should generate select schema with all columns', () => {
      const schema = parseDrizzleSchema(MINI_SCHEMA);
      const result = generateZodSchemas(schema);
      const select = result.schemas[0].selectSchema;

      // Select has all columns including id
      expect(select).toContain('id: z.string().uuid()');
      expect(select).toContain('name: z.string()');
      expect(select).toContain('email: z.string()');

      // Nullable columns should have .nullable()
      expect(select).toContain('age: z.number().int().nullable()');
    });

    it('should generate query params with limit, offset, and enum filters', () => {
      const schema = parseDrizzleSchema(MINI_SCHEMA);
      const result = generateZodSchemas(schema);
      const query = result.schemas[0].queryParamsSchema;

      expect(query).toContain('limit: z.coerce.number().int().min(1).max(100).default(20)');
      expect(query).toContain('offset: z.coerce.number().int().min(0).default(0)');
      expect(query).toContain('status: z.enum(');
    });

    it('should produce valid source code with imports', () => {
      const schema = parseDrizzleSchema(MINI_SCHEMA);
      const result = generateZodSchemas(schema);

      expect(result.sourceCode).toContain("import { z } from 'zod'");
      expect(result.sourceCode).toContain('export const insertUsersSchema');
      expect(result.sourceCode).toContain('export const updateUsersSchema');
      expect(result.sourceCode).toContain('export const selectUsersSchema');
      expect(result.sourceCode).toContain('export const queryUsersParamsSchema');
    });
  });

  describe('generateZodSchemasForTable', () => {
    it('should generate schema for a specific table', () => {
      const schema = parseDrizzleSchema(MINI_SCHEMA);
      const result = generateZodSchemasForTable('users', schema);

      expect(result).not.toBeNull();
      expect(result!.tableName).toBe('Users');
      expect(result!.insertSchema).toContain('name: z.string()');
    });

    it('should return null for unknown table', () => {
      const schema = parseDrizzleSchema(MINI_SCHEMA);
      const result = generateZodSchemasForTable('nonexistent', schema);

      expect(result).toBeNull();
    });
  });

  describe('complex types', () => {
    const COMPLEX_SCHEMA = `
import { pgTable, uuid, text, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core';

export const typeEnum = pgEnum('type', ['a', 'b']);

export const items = pgTable('items', {
  id: uuid('id').primaryKey().defaultRandom(),
  data: jsonb('data').$type<{ nested: { deep: string } }>(),
  refs: uuid('refs').array(),
  parentId: uuid('parent_id').references((): any => items.id),
  type: typeEnum('type').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
    `;

    it('should handle self-referencing tables', () => {
      const schema = parseDrizzleSchema(COMPLEX_SCHEMA);
      const result = generateZodSchemas(schema);

      expect(result.schemas).toHaveLength(1);
      const insert = result.schemas[0].insertSchema;
      expect(insert).toContain('parentId: z.string().uuid().optional()');
    });

    it('should handle uuid arrays', () => {
      const schema = parseDrizzleSchema(COMPLEX_SCHEMA);
      const result = generateZodSchemas(schema);
      const insert = result.schemas[0].insertSchema;

      expect(insert).toContain('refs: z.array(z.string().uuid()).optional()');
    });

    it('should handle jsonb with complex $type', () => {
      const schema = parseDrizzleSchema(COMPLEX_SCHEMA);
      const result = generateZodSchemas(schema);
      const insert = result.schemas[0].insertSchema;

      expect(insert).toContain('data: z.unknown().optional()');
    });
  });

  describe('real schema', () => {
    const runRealSchema = realSchemaSource.length > 0;

    it.skipIf(!runRealSchema)('should generate schemas for all 13 tables', () => {
      const schema = parseDrizzleSchema(realSchemaSource);
      const result = generateZodSchemas(schema);

      expect(result.schemas.length).toBe(13);
    });

    it.skipIf(!runRealSchema)('should generate valid Zod code for tasks table', () => {
      const schema = parseDrizzleSchema(realSchemaSource);
      const result = generateZodSchemasForTable('tasks', schema);

      expect(result).not.toBeNull();
      expect(result!.tableName).toBe('Tasks');
      expect(result!.insertSchema).toContain('projectId: z.string().uuid()');
      expect(result!.insertSchema).toContain('name: z.string()');
      expect(result!.insertSchema).toContain('description: z.string()');
      expect(result!.insertSchema).toContain("agentType: z.enum([");
    });
  });
});
