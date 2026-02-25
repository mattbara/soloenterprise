/**
 * Type Generator
 *
 * Converts Zod schema output → TypeScript interface strings.
 * Generates CreateXInput, UpdateXInput, XResponse per table,
 * plus shared utility types (PaginatedResponse<T>, ApiError).
 */

import type { ZodSchemaOutput } from './zod-from-drizzle';

// ============================================================================
// Types
// ============================================================================

export interface TypeGenerationResult {
  /** Per-table type definitions */
  tableTypes: TableTypeOutput[];
  /** Full source code string including shared types */
  sourceCode: string;
}

export interface TableTypeOutput {
  tableName: string;
  createInputType: string;
  updateInputType: string;
  responseType: string;
}

// ============================================================================
// Shared Types
// ============================================================================

const SHARED_TYPES = `// Shared utility types

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}
`;

// ============================================================================
// Generation
// ============================================================================

/**
 * Generate TypeScript type strings from Zod schema output.
 */
export function generateTypes(schemas: ZodSchemaOutput[]): TypeGenerationResult {
  const tableTypes: TableTypeOutput[] = [];
  const codeBlocks: string[] = [];

  // Add shared types first
  codeBlocks.push(SHARED_TYPES);

  for (const schema of schemas) {
    const { tableName } = schema;

    const createInputType = `export type Create${tableName}Input = z.infer<typeof insert${tableName}Schema>;`;
    const updateInputType = `export type Update${tableName}Input = z.infer<typeof update${tableName}Schema>;`;
    const responseType = `export type ${tableName}Response = z.infer<typeof select${tableName}Schema>;`;

    codeBlocks.push(`// --- ${tableName} ---`);
    codeBlocks.push(createInputType);
    codeBlocks.push(updateInputType);
    codeBlocks.push(responseType);
    codeBlocks.push('');

    tableTypes.push({
      tableName,
      createInputType,
      updateInputType,
      responseType,
    });
  }

  return {
    tableTypes,
    sourceCode: codeBlocks.join('\n'),
  };
}

/**
 * Generate types for a single table.
 */
export function generateTypesForTable(schema: ZodSchemaOutput): TableTypeOutput {
  const { tableName } = schema;

  return {
    tableName,
    createInputType: `export type Create${tableName}Input = z.infer<typeof insert${tableName}Schema>;`,
    updateInputType: `export type Update${tableName}Input = z.infer<typeof update${tableName}Schema>;`,
    responseType: `export type ${tableName}Response = z.infer<typeof select${tableName}Schema>;`,
  };
}
