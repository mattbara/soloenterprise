/**
 * Zod Schema Generator from Drizzle Schema
 *
 * Generates Zod validation schema strings from parsed Drizzle schema info.
 * Produces insert, update, select, and query param schemas per table.
 * All output is string-based — no Zod runtime dependency needed.
 */

import type { DrizzleSchemaInfo, TableInfo, ColumnInfo, EnumInfo, DrizzleColumnType } from './drizzle-schema-parser';

// ============================================================================
// Types
// ============================================================================

export interface ZodSchemaOutput {
  /** Table name (PascalCase) */
  tableName: string;
  /** z.object({...}) for inserting — skips PK + defaulted columns, nullable for optional */
  insertSchema: string;
  /** .partial() of insertSchema */
  updateSchema: string;
  /** All columns present */
  selectSchema: string;
  /** Pagination + enum filters */
  queryParamsSchema: string;
}

export interface ZodGenerationResult {
  schemas: ZodSchemaOutput[];
  /** Full source code string including imports */
  sourceCode: string;
}

// ============================================================================
// Column Type → Zod Mapping
// ============================================================================

function columnToZod(col: ColumnInfo, enums: EnumInfo[]): string {
  let base: string;

  switch (col.type) {
    case 'uuid':
      base = 'z.string().uuid()';
      break;
    case 'text':
      base = col.isArray ? 'z.array(z.string())' : 'z.string()';
      break;
    case 'varchar':
      base = 'z.string()';
      break;
    case 'integer':
      base = 'z.number().int()';
      break;
    case 'numeric':
      base = 'z.string()'; // numeric stored as string for precision
      break;
    case 'boolean':
      base = 'z.boolean()';
      break;
    case 'timestamp':
      base = 'z.string().datetime({ offset: true })';
      break;
    case 'jsonb':
      if (col.tsType) {
        // Use z.unknown() for complex types — Claude will refine
        base = 'z.unknown()';
      } else {
        base = 'z.unknown()';
      }
      break;
    case 'enum': {
      const enumDef = enums.find(e => e.name === col.enumName);
      if (enumDef) {
        const values = enumDef.values.map(v => `'${v}'`).join(', ');
        base = `z.enum([${values}])`;
      } else {
        base = 'z.string()';
      }
      break;
    }
    default:
      base = 'z.string()';
  }

  // Handle array columns (except text arrays already handled above)
  if (col.isArray && col.type !== 'text') {
    base = `z.array(${base})`;
  }

  return base;
}

// ============================================================================
// Schema Generation
// ============================================================================

function toPascalCase(name: string): string {
  return name.replace(/(^|_)([a-z])/g, (_, _p, c) => c.toUpperCase());
}

/**
 * Generate insert schema — skip PK + defaulted, optional for nullable without notNull.
 */
function generateInsertSchema(table: TableInfo, enums: EnumInfo[]): string {
  const fields: string[] = [];

  for (const col of table.columns) {
    // Skip primary keys with defaults (auto-generated)
    if (col.isPrimaryKey && col.hasDefault) continue;

    const zodType = columnToZod(col, enums);

    if (col.hasDefault || (!col.isNotNull && !col.isPrimaryKey)) {
      // Optional: has default or is nullable
      fields.push(`  ${col.name}: ${zodType}.optional(),`);
    } else {
      fields.push(`  ${col.name}: ${zodType},`);
    }
  }

  return `z.object({\n${fields.join('\n')}\n})`;
}

/**
 * Generate update schema — partial of insert.
 */
function generateUpdateSchema(pascalName: string): string {
  return `insert${pascalName}Schema.partial()`;
}

/**
 * Generate select schema — all columns present.
 */
function generateSelectSchema(table: TableInfo, enums: EnumInfo[]): string {
  const fields: string[] = [];

  for (const col of table.columns) {
    let zodType = columnToZod(col, enums);

    // In select, nullable columns are .nullable()
    if (!col.isNotNull && !col.isPrimaryKey) {
      zodType += '.nullable()';
    }

    fields.push(`  ${col.name}: ${zodType},`);
  }

  return `z.object({\n${fields.join('\n')}\n})`;
}

/**
 * Generate query params schema — limit, offset, and enum filters.
 */
function generateQueryParamsSchema(table: TableInfo, enums: EnumInfo[]): string {
  const fields: string[] = [
    '  limit: z.coerce.number().int().min(1).max(100).default(20),',
    '  offset: z.coerce.number().int().min(0).default(0),',
  ];

  // Add enum columns as optional filters
  for (const col of table.columns) {
    if (col.type === 'enum') {
      const zodType = columnToZod(col, enums);
      fields.push(`  ${col.name}: ${zodType}.optional(),`);
    }
  }

  return `z.object({\n${fields.join('\n')}\n})`;
}

/**
 * Generate Zod schemas for all tables in the schema.
 */
export function generateZodSchemas(schema: DrizzleSchemaInfo): ZodGenerationResult {
  const schemas: ZodSchemaOutput[] = [];
  const codeBlocks: string[] = [];

  codeBlocks.push("import { z } from 'zod';\n");

  for (const table of schema.tables) {
    const pascalName = toPascalCase(table.name);

    const insertSchema = generateInsertSchema(table, schema.enums);
    const updateSchema = generateUpdateSchema(pascalName);
    const selectSchema = generateSelectSchema(table, schema.enums);
    const queryParamsSchema = generateQueryParamsSchema(table, schema.enums);

    const insertVarName = `insert${pascalName}Schema`;
    const updateVarName = `update${pascalName}Schema`;
    const selectVarName = `select${pascalName}Schema`;
    const queryVarName = `query${pascalName}ParamsSchema`;

    codeBlocks.push(`// --- ${pascalName} ---`);
    codeBlocks.push(`export const ${insertVarName} = ${insertSchema};\n`);
    codeBlocks.push(`export const ${updateVarName} = ${updateSchema};\n`);
    codeBlocks.push(`export const ${selectVarName} = ${selectSchema};\n`);
    codeBlocks.push(`export const ${queryVarName} = ${queryParamsSchema};\n`);

    schemas.push({
      tableName: pascalName,
      insertSchema,
      updateSchema,
      selectSchema,
      queryParamsSchema,
    });
  }

  return {
    schemas,
    sourceCode: codeBlocks.join('\n'),
  };
}

/**
 * Generate Zod schemas for a specific table only.
 */
export function generateZodSchemasForTable(
  tableName: string,
  schema: DrizzleSchemaInfo,
): ZodSchemaOutput | null {
  const table = schema.tables.find(t => t.name === tableName);
  if (!table) return null;

  const pascalName = toPascalCase(tableName);

  return {
    tableName: pascalName,
    insertSchema: generateInsertSchema(table, schema.enums),
    updateSchema: generateUpdateSchema(pascalName),
    selectSchema: generateSelectSchema(table, schema.enums),
    queryParamsSchema: generateQueryParamsSchema(table, schema.enums),
  };
}
