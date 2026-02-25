/**
 * Backend Route Scaffolder
 *
 * Generates Hono route files with Zod validation, service stubs, and type imports.
 * Produces 3 files: route handler, validators, types.
 */

import type { ImportMap } from './import-resolver';
import { formatImportStatements } from './import-resolver';
import type { ZodSchemaOutput } from './zod-from-drizzle';
import type { TableTypeOutput } from './type-generator';

// ============================================================================
// Types
// ============================================================================

export interface RouteScaffoldInput {
  /** Table/resource name (e.g., 'users') */
  resourceName: string;
  /** HTTP methods to scaffold */
  methods: Array<'GET' | 'POST' | 'PUT' | 'DELETE'>;
  /** Base path (e.g., '/api/users') */
  basePath: string;
  /** Zod schemas for validation */
  zodSchemas: ZodSchemaOutput;
  /** Type definitions */
  types: TableTypeOutput;
  /** Import map for correct imports */
  importMap: ImportMap;
}

export interface ScaffoldedFile {
  path: string;
  content: string;
}

// ============================================================================
// Route Scaffolder
// ============================================================================

/**
 * Generate a Hono route file with CRUD handlers.
 */
export function scaffoldBackendRoute(input: RouteScaffoldInput): ScaffoldedFile[] {
  const { resourceName, methods, basePath, zodSchemas, types, importMap } = input;
  const pascal = toPascalCase(resourceName);
  const files: ScaffoldedFile[] = [];

  // 1. Validators file
  files.push({
    path: `src/validators/${resourceName}.ts`,
    content: generateValidatorsFile(zodSchemas, pascal),
  });

  // 2. Types file
  files.push({
    path: `src/types/${resourceName}.ts`,
    content: generateTypesFile(types, pascal),
  });

  // 3. Route handler
  files.push({
    path: `src/routes/${resourceName}.ts`,
    content: generateRouteFile(resourceName, pascal, methods, basePath, importMap),
  });

  return files;
}

// ============================================================================
// File Generators
// ============================================================================

function generateValidatorsFile(zodSchemas: ZodSchemaOutput, pascal: string): string {
  return `import { z } from 'zod';

export const insert${pascal}Schema = ${zodSchemas.insertSchema};

export const update${pascal}Schema = ${zodSchemas.updateSchema};

export const select${pascal}Schema = ${zodSchemas.selectSchema};

export const query${pascal}ParamsSchema = ${zodSchemas.queryParamsSchema};

export type Create${pascal}Input = z.infer<typeof insert${pascal}Schema>;
export type Update${pascal}Input = z.infer<typeof update${pascal}Schema>;
export type ${pascal}Response = z.infer<typeof select${pascal}Schema>;
`;
}

function generateTypesFile(types: TableTypeOutput, pascal: string): string {
  return `import type { z } from 'zod';
import type { insert${pascal}Schema, update${pascal}Schema, select${pascal}Schema } from '../validators/${toKebabCase(pascal)}';

${types.createInputType}
${types.updateInputType}
${types.responseType}

export interface Paginated${pascal}Response {
  data: ${pascal}Response[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}
`;
}

function generateRouteFile(
  resourceName: string,
  pascal: string,
  methods: string[],
  basePath: string,
  importMap: ImportMap,
): string {
  const dbImports = formatImportStatements(['db'], importMap);
  const schemaImports = formatImportStatements([resourceName], importMap);

  const parts: string[] = [];

  parts.push(`import { Hono } from 'hono';`);
  parts.push(dbImports);

  // Only include schema import if we have it
  if (schemaImports) {
    parts.push(schemaImports);
  }
  parts.push(`import { eq } from 'drizzle-orm';`);
  parts.push(`import { insert${pascal}Schema, update${pascal}Schema, query${pascal}ParamsSchema } from '../validators/${resourceName}';`);
  parts.push('');
  parts.push(`const app = new Hono();`);
  parts.push('');

  if (methods.includes('GET')) {
    parts.push(`// GET ${basePath} — List all`);
    parts.push(`app.get('${basePath}', async (c) => {`);
    parts.push(`  const query = query${pascal}ParamsSchema.parse(c.req.query());`);
    parts.push(`  // TODO: Implement list query with pagination`);
    parts.push(`  // const results = await db.select().from(${resourceName}).limit(query.limit).offset(query.offset);`);
    parts.push(`  return c.json({ data: [], total: 0, limit: query.limit, offset: query.offset, hasMore: false });`);
    parts.push(`});`);
    parts.push('');

    parts.push(`// GET ${basePath}/:id — Get by ID`);
    parts.push(`app.get('${basePath}/:id', async (c) => {`);
    parts.push(`  const id = c.req.param('id');`);
    parts.push(`  // TODO: Implement get by ID`);
    parts.push(`  // const result = await db.select().from(${resourceName}).where(eq(${resourceName}.id, id)).limit(1);`);
    parts.push(`  return c.json({ data: null });`);
    parts.push(`});`);
    parts.push('');
  }

  if (methods.includes('POST')) {
    parts.push(`// POST ${basePath} — Create`);
    parts.push(`app.post('${basePath}', async (c) => {`);
    parts.push(`  const body = insert${pascal}Schema.parse(await c.req.json());`);
    parts.push(`  // TODO: Implement create`);
    parts.push(`  // const [created] = await db.insert(${resourceName}).values(body).returning();`);
    parts.push(`  return c.json({ data: body }, 201);`);
    parts.push(`});`);
    parts.push('');
  }

  if (methods.includes('PUT')) {
    parts.push(`// PUT ${basePath}/:id — Update`);
    parts.push(`app.put('${basePath}/:id', async (c) => {`);
    parts.push(`  const id = c.req.param('id');`);
    parts.push(`  const body = update${pascal}Schema.parse(await c.req.json());`);
    parts.push(`  // TODO: Implement update`);
    parts.push(`  // const [updated] = await db.update(${resourceName}).set(body).where(eq(${resourceName}.id, id)).returning();`);
    parts.push(`  return c.json({ data: body });`);
    parts.push(`});`);
    parts.push('');
  }

  if (methods.includes('DELETE')) {
    parts.push(`// DELETE ${basePath}/:id — Delete`);
    parts.push(`app.delete('${basePath}/:id', async (c) => {`);
    parts.push(`  const id = c.req.param('id');`);
    parts.push(`  // TODO: Implement delete`);
    parts.push(`  // await db.delete(${resourceName}).where(eq(${resourceName}.id, id));`);
    parts.push(`  return c.json({ success: true });`);
    parts.push(`});`);
    parts.push('');
  }

  parts.push(`export default app;`);

  return parts.join('\n');
}

// ============================================================================
// Utilities
// ============================================================================

function toPascalCase(name: string): string {
  return name.replace(/(^|_)([a-z])/g, (_, _p, c) => c.toUpperCase());
}

function toKebabCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}
