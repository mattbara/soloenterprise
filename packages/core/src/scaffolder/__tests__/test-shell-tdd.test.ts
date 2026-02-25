import { describe, it, expect } from 'vitest';
import { scaffoldTDDTestShell, type TDDTestInput, type EndpointSpec } from '../test-shell-tdd';
import { parseDrizzleSchema } from '../drizzle-schema-parser';
import { generateZodSchemasForTable } from '../zod-from-drizzle';

const MINI_SCHEMA = `
import { pgTable, uuid, text, pgEnum } from 'drizzle-orm/pg-core';

export const statusEnum = pgEnum('status', ['active', 'inactive']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  status: statusEnum('status').notNull().default('active'),
});
`;

describe('test-shell-tdd', () => {
  const baseEndpoints: EndpointSpec[] = [
    { method: 'GET', path: '/api/users', description: 'List users', expectedStatus: [200] },
    { method: 'GET', path: '/api/users/:id', description: 'Get user by ID', expectedStatus: [200, 404] },
    { method: 'POST', path: '/api/users', description: 'Create user', expectedStatus: [201, 400], requestBodyHint: 'name, email required' },
    { method: 'PUT', path: '/api/users/:id', description: 'Update user', expectedStatus: [200, 404] },
    { method: 'DELETE', path: '/api/users/:id', description: 'Delete user', expectedStatus: [200, 404] },
  ];

  it('should generate test file at correct path', () => {
    const result = scaffoldTDDTestShell({
      resourceName: 'users',
      expectedEndpoints: baseEndpoints,
    });

    expect(result.path).toBe('src/routes/__tests__/users.test.ts');
  });

  it('should use custom output path if provided', () => {
    const result = scaffoldTDDTestShell({
      resourceName: 'users',
      expectedEndpoints: baseEndpoints,
      outputPath: 'custom/path.test.ts',
    });

    expect(result.path).toBe('custom/path.test.ts');
  });

  it('should include vitest imports', () => {
    const result = scaffoldTDDTestShell({
      resourceName: 'users',
      expectedEndpoints: baseEndpoints,
    });

    expect(result.content).toContain("import { describe, it, expect, beforeAll, afterAll } from 'vitest'");
  });

  it('should generate describe blocks for each endpoint', () => {
    const result = scaffoldTDDTestShell({
      resourceName: 'users',
      expectedEndpoints: baseEndpoints,
    });

    expect(result.content).toContain("describe('GET /api/users'");
    expect(result.content).toContain("describe('POST /api/users'");
    expect(result.content).toContain("describe('PUT /api/users/:id'");
    expect(result.content).toContain("describe('DELETE /api/users/:id'");
  });

  it('should generate test cases for each expected status code', () => {
    const result = scaffoldTDDTestShell({
      resourceName: 'users',
      expectedEndpoints: baseEndpoints,
    });

    expect(result.content).toContain('should return 200 on success');
    expect(result.content).toContain('should return 201 on creation');
    expect(result.content).toContain('should return 400 for invalid input');
    expect(result.content).toContain('should return 404 when not found');
  });

  it('should include request body hints in POST test', () => {
    const result = scaffoldTDDTestShell({
      resourceName: 'users',
      expectedEndpoints: baseEndpoints,
    });

    expect(result.content).toContain('name, email required');
  });

  it('should include validation tests when zodSchemas provided', () => {
    const schema = parseDrizzleSchema(MINI_SCHEMA);
    const zodSchemas = generateZodSchemasForTable('users', schema)!;

    const result = scaffoldTDDTestShell({
      resourceName: 'users',
      expectedEndpoints: baseEndpoints,
      zodSchemas,
    });

    expect(result.content).toContain("describe('validation'");
    expect(result.content).toContain('should reject invalid create input');
  });

  it('should NOT include validation tests without zodSchemas', () => {
    const result = scaffoldTDDTestShell({
      resourceName: 'users',
      expectedEndpoints: baseEndpoints,
    });

    expect(result.content).not.toContain("describe('validation'");
  });

  it('should contain TODO markers for implementation', () => {
    const result = scaffoldTDDTestShell({
      resourceName: 'users',
      expectedEndpoints: baseEndpoints,
    });

    expect(result.content).toContain('// TODO:');
  });
});
