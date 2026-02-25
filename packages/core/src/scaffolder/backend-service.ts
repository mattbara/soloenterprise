/**
 * Backend Service Scaffolder
 *
 * Generates CRUD service stubs with Drizzle query patterns.
 */

import type { ImportMap } from './import-resolver';
import { formatImportStatements } from './import-resolver';

// ============================================================================
// Types
// ============================================================================

export interface ServiceScaffoldInput {
  /** Table/resource name (e.g., 'users') */
  resourceName: string;
  /** Import map for correct imports */
  importMap: ImportMap;
  /** Whether to include soft-delete pattern */
  softDelete?: boolean;
}

export interface ScaffoldedFile {
  path: string;
  content: string;
}

// ============================================================================
// Service Scaffolder
// ============================================================================

/**
 * Generate a CRUD service file with Drizzle query patterns.
 */
export function scaffoldBackendService(input: ServiceScaffoldInput): ScaffoldedFile {
  const { resourceName, importMap, softDelete } = input;
  const pascal = toPascalCase(resourceName);

  const dbImports = formatImportStatements(['db'], importMap);
  const schemaImports = formatImportStatements([resourceName], importMap);

  const parts: string[] = [];

  parts.push(dbImports);
  if (schemaImports) {
    parts.push(schemaImports);
  }
  parts.push(`import { eq } from 'drizzle-orm';`);
  parts.push(`import type { Create${pascal}Input, Update${pascal}Input } from '../validators/${resourceName}';`);
  parts.push('');

  // List
  parts.push(`export async function list${pascal}s(limit = 20, offset = 0) {`);
  parts.push(`  // TODO: Add filters and sorting`);
  parts.push(`  const results = await db.select().from(${resourceName}).limit(limit).offset(offset);`);
  parts.push(`  return results;`);
  parts.push(`}`);
  parts.push('');

  // Get by ID
  parts.push(`export async function get${pascal}ById(id: string) {`);
  parts.push(`  const [result] = await db.select().from(${resourceName}).where(eq(${resourceName}.id, id)).limit(1);`);
  parts.push(`  return result ?? null;`);
  parts.push(`}`);
  parts.push('');

  // Create
  parts.push(`export async function create${pascal}(input: Create${pascal}Input) {`);
  parts.push(`  const [created] = await db.insert(${resourceName}).values(input).returning();`);
  parts.push(`  return created;`);
  parts.push(`}`);
  parts.push('');

  // Update
  parts.push(`export async function update${pascal}(id: string, input: Update${pascal}Input) {`);
  parts.push(`  const [updated] = await db.update(${resourceName}).set({`);
  parts.push(`    ...input,`);
  parts.push(`    // TODO: Add updatedAt if table has it`);
  parts.push(`  }).where(eq(${resourceName}.id, id)).returning();`);
  parts.push(`  return updated ?? null;`);
  parts.push(`}`);
  parts.push('');

  // Delete
  if (softDelete) {
    parts.push(`export async function delete${pascal}(id: string) {`);
    parts.push(`  // Soft delete`);
    parts.push(`  const [deleted] = await db.update(${resourceName}).set({`);
    parts.push(`    // TODO: Set archived/deleted flag`);
    parts.push(`  }).where(eq(${resourceName}.id, id)).returning();`);
    parts.push(`  return deleted ?? null;`);
    parts.push(`}`);
  } else {
    parts.push(`export async function delete${pascal}(id: string) {`);
    parts.push(`  const [deleted] = await db.delete(${resourceName}).where(eq(${resourceName}.id, id)).returning();`);
    parts.push(`  return deleted ?? null;`);
    parts.push(`}`);
  }

  return {
    path: `src/services/${resourceName}-service.ts`,
    content: parts.join('\n'),
  };
}

function toPascalCase(name: string): string {
  return name.replace(/(^|_)([a-z])/g, (_, _p, c) => c.toUpperCase());
}
