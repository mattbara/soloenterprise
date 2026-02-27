/**
 * TDD Test Shell Scaffolder
 *
 * Generates tests from spec only (NO source code).
 * Uses expectedEndpoints + zodSchemas to create assertions.
 * Key for Phase 8 TDD workflow: write tests first, then implement.
 */

import type { ZodSchemaOutput } from './zod-from-drizzle';

// ============================================================================
// Types
// ============================================================================

export interface TDDTestInput {
  /** Resource name */
  resourceName: string;
  /** Expected API endpoints to test */
  expectedEndpoints: EndpointSpec[];
  /** Zod schemas for request/response validation */
  zodSchemas?: ZodSchemaOutput;
  /** Test file output path */
  outputPath?: string;
}

export interface EndpointSpec {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  description: string;
  /** Expected HTTP status codes */
  expectedStatus: number[];
  /** Request body shape hint (for POST/PUT) */
  requestBodyHint?: string;
}

export interface ScaffoldedFile {
  path: string;
  content: string;
}

// ============================================================================
// TDD Test Shell Scaffolder
// ============================================================================

/**
 * Generate a test file from spec, not source code.
 * Tests define the contract that implementation must satisfy.
 */
export function scaffoldTDDTestShell(input: TDDTestInput): ScaffoldedFile {
  const { resourceName, expectedEndpoints, zodSchemas, outputPath } = input;
  const pascal = toPascalCase(resourceName);
  const testPath = outputPath ?? `src/routes/__tests__/${resourceName}.test.ts`;

  const parts: string[] = [];

  // Imports
  parts.push("import { describe, it, expect, beforeAll, afterAll } from 'vitest';");
  parts.push('');

  // If zodSchemas provided, import for validation
  if (zodSchemas) {
    parts.push(`// TODO: Import validators once implemented`);
    parts.push(`// import { insert${pascal}Schema, select${pascal}Schema } from '../../validators/${resourceName}';`);
    parts.push('');
  }

  // Test setup
  parts.push(`// TODO: Import app instance once implemented`);
  parts.push(`// import app from '../../routes/${resourceName}';`);
  parts.push('');

  parts.push(`describe('${pascal} API', () => {`);
  parts.push(`  // TODO: Set up test client`);
  parts.push(`  // let testClient: ReturnType<typeof app.request>;`);
  parts.push('');

  // Generate test blocks per endpoint
  for (const endpoint of expectedEndpoints) {
    parts.push(`  describe('${endpoint.method} ${endpoint.path}', () => {`);
    parts.push(`    // ${endpoint.description}`);
    parts.push('');

    for (const status of endpoint.expectedStatus) {
      const testName = getTestNameForStatus(endpoint.method, status);
      parts.push(`    it('${testName}', async () => {`);

      if (endpoint.method === 'GET') {
        parts.push(`      // TODO: Implement test`);
        parts.push(`      // const res = await testClient('${endpoint.path}');`);
        parts.push(`      // expect(res.status).toBe(${status});`);

        if (status === 200 && zodSchemas) {
          parts.push(`      // const json = await res.json();`);
          parts.push(`      // expect(json.data).toBeDefined();`);
        }
      }

      if (endpoint.method === 'POST') {
        parts.push(`      // TODO: Implement test`);
        if (endpoint.requestBodyHint) {
          parts.push(`      // Request body: ${endpoint.requestBodyHint}`);
        }
        parts.push(`      // const res = await testClient('${endpoint.path}', {`);
        parts.push(`      //   method: 'POST',`);
        parts.push(`      //   body: JSON.stringify({ /* TODO: valid body */ }),`);
        parts.push(`      //   headers: { 'Content-Type': 'application/json' },`);
        parts.push(`      // });`);
        parts.push(`      // expect(res.status).toBe(${status});`);
      }

      if (endpoint.method === 'PUT') {
        parts.push(`      // TODO: Implement test`);
        parts.push(`      // const res = await testClient('${endpoint.path}', {`);
        parts.push(`      //   method: 'PUT',`);
        parts.push(`      //   body: JSON.stringify({ /* TODO: partial update */ }),`);
        parts.push(`      //   headers: { 'Content-Type': 'application/json' },`);
        parts.push(`      // });`);
        parts.push(`      // expect(res.status).toBe(${status});`);
      }

      if (endpoint.method === 'DELETE') {
        parts.push(`      // TODO: Implement test`);
        parts.push(`      // const res = await testClient('${endpoint.path}', { method: 'DELETE' });`);
        parts.push(`      // expect(res.status).toBe(${status});`);
      }

      parts.push(`    });`);
      parts.push('');
    }

    parts.push(`  });`);
    parts.push('');
  }

  // Validation tests if schemas provided
  if (zodSchemas) {
    parts.push(`  describe('validation', () => {`);
    parts.push(`    it('should reject invalid create input', async () => {`);
    parts.push(`      // TODO: Send invalid body and expect 400`);
    parts.push(`      // const res = await testClient('${expectedEndpoints[0]?.path ?? '/api/' + resourceName}', {`);
    parts.push(`      //   method: 'POST',`);
    parts.push(`      //   body: JSON.stringify({}),`);
    parts.push(`      //   headers: { 'Content-Type': 'application/json' },`);
    parts.push(`      // });`);
    parts.push(`      // expect(res.status).toBe(400);`);
    parts.push(`    });`);
    parts.push(`  });`);
    parts.push('');
  }

  parts.push(`});`);

  return {
    path: testPath,
    content: parts.join('\n'),
  };
}

// ============================================================================
// Utilities
// ============================================================================

function getTestNameForStatus(method: string, status: number): string {
  switch (status) {
    case 200: return `should return ${status} on success`;
    case 201: return `should return ${status} on creation`;
    case 204: return `should return ${status} on deletion`;
    case 400: return `should return ${status} for invalid input`;
    case 404: return `should return ${status} when not found`;
    case 409: return `should return ${status} on conflict`;
    case 500: return `should return ${status} on server error`;
    default: return `should return ${status}`;
  }
}

function toPascalCase(name: string): string {
  return name.replace(/(^|[-_])([a-z])/g, (_, _p, c) => c.toUpperCase());
}
