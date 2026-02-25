import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseDrizzleSchema, type DrizzleSchemaInfo, type TableInfo, type EnumInfo } from '../drizzle-schema-parser';

// Load the real schema file for testing.
// Navigate from packages/core/ (vitest cwd) to packages/db/src/schema.ts
const SCHEMA_PATH = resolve(process.cwd(), '..', 'db', 'src', 'schema.ts');
let realSchemaSource: string;
try {
  realSchemaSource = readFileSync(SCHEMA_PATH, 'utf-8');
} catch {
  // Fallback for CI or different directory structures
  realSchemaSource = '';
}

// Minimal schema for unit tests (doesn't depend on file system)
const MINIMAL_SCHEMA = `
import { pgTable, uuid, text, timestamp, boolean, jsonb, integer, numeric, varchar, pgEnum, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const statusEnum = pgEnum('status', ['active', 'inactive', 'pending']);

export const roleEnum = pgEnum('role', [
  'admin',
  'user',
  'moderator',
]);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  role: roleEnum('role').notNull().default('user'),
  status: statusEnum('status').notNull().default('active'),
  age: integer('age'),
  balance: numeric('balance', { precision: 10, scale: 2 }),
  isVerified: boolean('is_verified').notNull().default(false),
  metadata: jsonb('metadata').$type<{ bio?: string; avatar?: string }>().default({}),
  tags: text('tags').array(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  emailIdx: uniqueIndex('users_email_idx').on(table.email),
}));

export const posts = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: text('content').notNull(),
  published: boolean('published').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const comments = pgTable('comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id').notNull().references(() => posts.id),
  parentId: uuid('parent_id').references((): any => comments.id),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
`;

describe('drizzle-schema-parser', () => {
  describe('parseEnums', () => {
    it('should parse enum definitions', () => {
      const result = parseDrizzleSchema(MINIMAL_SCHEMA);

      expect(result.enums).toHaveLength(2);

      const statusEnum = result.enums.find(e => e.name === 'statusEnum');
      expect(statusEnum).toBeDefined();
      expect(statusEnum!.dbName).toBe('status');
      expect(statusEnum!.values).toEqual(['active', 'inactive', 'pending']);

      const roleEnum = result.enums.find(e => e.name === 'roleEnum');
      expect(roleEnum).toBeDefined();
      expect(roleEnum!.dbName).toBe('role');
      expect(roleEnum!.values).toEqual(['admin', 'user', 'moderator']);
    });
  });

  describe('parseTables', () => {
    it('should parse table definitions', () => {
      const result = parseDrizzleSchema(MINIMAL_SCHEMA);

      expect(result.tables).toHaveLength(3);
      expect(result.tables.map(t => t.name)).toEqual(['users', 'posts', 'comments']);
    });

    it('should parse column types correctly', () => {
      const result = parseDrizzleSchema(MINIMAL_SCHEMA);
      const users = result.tables.find(t => t.name === 'users')!;

      const id = users.columns.find(c => c.name === 'id')!;
      expect(id.type).toBe('uuid');
      expect(id.isPrimaryKey).toBe(true);
      expect(id.hasDefault).toBe(true);

      const name = users.columns.find(c => c.name === 'name')!;
      expect(name.type).toBe('text');
      expect(name.isNotNull).toBe(true);
      expect(name.hasDefault).toBe(false);

      const email = users.columns.find(c => c.name === 'email')!;
      expect(email.type).toBe('varchar');
      expect(email.isNotNull).toBe(true);

      const age = users.columns.find(c => c.name === 'age')!;
      expect(age.type).toBe('integer');
      expect(age.isNotNull).toBe(false);

      const balance = users.columns.find(c => c.name === 'balance')!;
      expect(balance.type).toBe('numeric');

      const isVerified = users.columns.find(c => c.name === 'isVerified')!;
      expect(isVerified.type).toBe('boolean');
      expect(isVerified.isNotNull).toBe(true);
      expect(isVerified.hasDefault).toBe(true);

      const metadata = users.columns.find(c => c.name === 'metadata')!;
      expect(metadata.type).toBe('jsonb');
      expect(metadata.tsType).toBe('{ bio?: string; avatar?: string }');
      expect(metadata.hasDefault).toBe(true);

      const createdAt = users.columns.find(c => c.name === 'createdAt')!;
      expect(createdAt.type).toBe('timestamp');
      expect(createdAt.isNotNull).toBe(true);
      expect(createdAt.hasDefault).toBe(true);
    });

    it('should detect enum columns', () => {
      const result = parseDrizzleSchema(MINIMAL_SCHEMA);
      const users = result.tables.find(t => t.name === 'users')!;

      const role = users.columns.find(c => c.name === 'role')!;
      expect(role.type).toBe('enum');
      expect(role.enumName).toBe('roleEnum');
      expect(role.isNotNull).toBe(true);
      expect(role.hasDefault).toBe(true);

      const status = users.columns.find(c => c.name === 'status')!;
      expect(status.type).toBe('enum');
      expect(status.enumName).toBe('statusEnum');
    });

    it('should detect array columns', () => {
      const result = parseDrizzleSchema(MINIMAL_SCHEMA);
      const users = result.tables.find(t => t.name === 'users')!;

      const tags = users.columns.find(c => c.name === 'tags')!;
      expect(tags.type).toBe('text');
      expect(tags.isArray).toBe(true);
    });

    it('should detect references', () => {
      const result = parseDrizzleSchema(MINIMAL_SCHEMA);
      const posts = result.tables.find(t => t.name === 'posts')!;

      const authorId = posts.columns.find(c => c.name === 'authorId')!;
      expect(authorId.references).toBe('users');
      expect(authorId.isNotNull).toBe(true);
    });

    it('should handle self-referencing with (): any => cast pattern', () => {
      const result = parseDrizzleSchema(MINIMAL_SCHEMA);
      const comments = result.tables.find(t => t.name === 'comments')!;

      const parentId = comments.columns.find(c => c.name === 'parentId')!;
      expect(parentId.references).toBe('comments');
      expect(parentId.isNotNull).toBe(false);
    });

    it('should parse db column names', () => {
      const result = parseDrizzleSchema(MINIMAL_SCHEMA);
      const users = result.tables.find(t => t.name === 'users')!;

      const isVerified = users.columns.find(c => c.name === 'isVerified')!;
      expect(isVerified.dbName).toBe('is_verified');

      const createdAt = users.columns.find(c => c.name === 'createdAt')!;
      expect(createdAt.dbName).toBe('created_at');
    });
  });

  describe('real schema parsing', () => {
    // Skip if real schema file is not available
    const runRealSchema = realSchemaSource.length > 0;

    it.skipIf(!runRealSchema)('should parse all tables from real schema.ts', () => {
      const result = parseDrizzleSchema(realSchemaSource);

      // Real schema has 13 tables
      const expectedTables = [
        'projects', 'tasks', 'questions', 'fileLocks', 'artifacts',
        'deployments', 'agentSessions', 'clients', 'projectBriefs',
        'projectScopes', 'milestones', 'clientReports', 'costTracking',
      ];

      expect(result.tables.length).toBe(expectedTables.length);

      for (const tableName of expectedTables) {
        const table = result.tables.find(t => t.name === tableName);
        expect(table, `Expected table '${tableName}' to exist`).toBeDefined();
        expect(table!.columns.length).toBeGreaterThan(0);
      }
    });

    it.skipIf(!runRealSchema)('should parse all enums from real schema.ts', () => {
      const result = parseDrizzleSchema(realSchemaSource);

      const expectedEnums = [
        'projectStatusEnum', 'taskStatusEnum', 'taskPriorityEnum',
        'agentTypeEnum', 'questionStatusEnum', 'questionPriorityEnum',
        'artifactTypeEnum', 'environmentEnum',
      ];

      expect(result.enums.length).toBe(expectedEnums.length);

      for (const enumName of expectedEnums) {
        const found = result.enums.find(e => e.name === enumName);
        expect(found, `Expected enum '${enumName}' to exist`).toBeDefined();
        expect(found!.values.length).toBeGreaterThan(0);
      }
    });

    it.skipIf(!runRealSchema)('should correctly parse projects table columns', () => {
      const result = parseDrizzleSchema(realSchemaSource);
      const projects = result.tables.find(t => t.name === 'projects')!;

      expect(projects.dbName).toBe('projects');

      const id = projects.columns.find(c => c.name === 'id')!;
      expect(id.type).toBe('uuid');
      expect(id.isPrimaryKey).toBe(true);
      expect(id.hasDefault).toBe(true);

      const name = projects.columns.find(c => c.name === 'name')!;
      expect(name.type).toBe('text');
      expect(name.isNotNull).toBe(true);

      const status = projects.columns.find(c => c.name === 'status')!;
      expect(status.type).toBe('enum');
      expect(status.enumName).toBe('projectStatusEnum');

      const config = projects.columns.find(c => c.name === 'config')!;
      expect(config.type).toBe('jsonb');
    });

    it.skipIf(!runRealSchema)('should correctly parse tasks table with complex types', () => {
      const result = parseDrizzleSchema(realSchemaSource);
      const tasks = result.tables.find(t => t.name === 'tasks')!;

      // Tasks has self-reference (parentTaskId)
      const parentTaskId = tasks.columns.find(c => c.name === 'parentTaskId')!;
      expect(parentTaskId.references).toBe('tasks');

      // Tasks has array columns
      const dependsOn = tasks.columns.find(c => c.name === 'dependsOn')!;
      expect(dependsOn.isArray).toBe(true);

      const filesToModify = tasks.columns.find(c => c.name === 'filesToModify')!;
      expect(filesToModify.isArray).toBe(true);

      // Tasks has jsonb with $type<>
      const context = tasks.columns.find(c => c.name === 'context')!;
      expect(context.type).toBe('jsonb');
    });
  });
});
