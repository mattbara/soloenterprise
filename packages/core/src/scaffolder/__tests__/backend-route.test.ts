import { describe, it, expect } from 'vitest';
import { scaffoldBackendRoute } from '../backend-route';
import { resolveImports } from '../import-resolver';
import { parseDrizzleSchema } from '../drizzle-schema-parser';
import { generateZodSchemasForTable } from '../zod-from-drizzle';
import { generateTypesForTable } from '../type-generator';

const MINI_SCHEMA = `
import { pgTable, uuid, text, timestamp, boolean, pgEnum } from 'drizzle-orm/pg-core';

export const statusEnum = pgEnum('status', ['active', 'inactive']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  status: statusEnum('status').notNull().default('active'),
  isVerified: boolean('is_verified').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
`;

describe('backend-route scaffolder', () => {
  function getTestInput() {
    const schema = parseDrizzleSchema(MINI_SCHEMA);
    const importMap = resolveImports(MINI_SCHEMA);
    const zodSchemas = generateZodSchemasForTable('users', schema)!;
    const types = generateTypesForTable(zodSchemas);

    return {
      resourceName: 'users',
      methods: ['GET', 'POST', 'PUT', 'DELETE'] as ('GET' | 'POST' | 'PUT' | 'DELETE')[],
      basePath: '/api/users',
      zodSchemas,
      types,
      importMap,
    };
  }

  it('should generate 3 files: validators, types, route', () => {
    const files = scaffoldBackendRoute(getTestInput());
    expect(files).toHaveLength(3);

    const paths = files.map(f => f.path);
    expect(paths).toContain('src/validators/users.ts');
    expect(paths).toContain('src/types/users.ts');
    expect(paths).toContain('src/routes/users.ts');
  });

  it('should generate validators with correct Zod schemas', () => {
    const files = scaffoldBackendRoute(getTestInput());
    const validators = files.find(f => f.path.includes('validators'))!;

    expect(validators.content).toContain("import { z } from 'zod'");
    expect(validators.content).toContain('export const insertUsersSchema');
    expect(validators.content).toContain('export const updateUsersSchema');
    expect(validators.content).toContain('export const selectUsersSchema');
    expect(validators.content).toContain('export const queryUsersParamsSchema');
    expect(validators.content).toContain('Create');
    expect(validators.content).toContain('Update');
  });

  it('should generate route with correct imports and TODO markers', () => {
    const files = scaffoldBackendRoute(getTestInput());
    const route = files.find(f => f.path.includes('routes'))!;

    expect(route.content).toContain("import { Hono } from 'hono'");
    expect(route.content).toContain("import { eq } from 'drizzle-orm'");
    expect(route.content).toContain('// TODO:');
    expect(route.content).toContain("app.get('/api/users'");
    expect(route.content).toContain("app.post('/api/users'");
    expect(route.content).toContain("app.put('/api/users/:id'");
    expect(route.content).toContain("app.delete('/api/users/:id'");
    expect(route.content).toContain('export default app');
  });

  it('should only include requested methods', () => {
    const input = getTestInput();
    const files = scaffoldBackendRoute({ ...input, methods: ['GET', 'POST'] });
    const route = files.find(f => f.path.includes('routes'))!;

    expect(route.content).toContain("app.get(");
    expect(route.content).toContain("app.post(");
    expect(route.content).not.toContain("app.put(");
    expect(route.content).not.toContain("app.delete(");
  });

  it('should include db import from import map', () => {
    const files = scaffoldBackendRoute(getTestInput());
    const route = files.find(f => f.path.includes('routes'))!;

    expect(route.content).toContain("'@soloenterprise/db'");
  });
});
