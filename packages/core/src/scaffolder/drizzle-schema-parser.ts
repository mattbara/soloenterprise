/**
 * Drizzle Schema Parser
 *
 * Regex-based parser for Drizzle ORM schema files.
 * Extracts table definitions, column types, constraints, and enum definitions.
 * Used by scaffolders to generate type-safe code with correct imports.
 */

// ============================================================================
// Types
// ============================================================================

export interface ColumnInfo {
  name: string;
  dbName: string;
  type: DrizzleColumnType;
  isNotNull: boolean;
  hasDefault: boolean;
  isPrimaryKey: boolean;
  isArray: boolean;
  /** For references: the target table name */
  references?: string;
  /** For enums: the enum name used */
  enumName?: string;
  /** For $type<>: the TypeScript type annotation */
  tsType?: string;
}

export type DrizzleColumnType =
  | 'uuid'
  | 'text'
  | 'varchar'
  | 'integer'
  | 'numeric'
  | 'boolean'
  | 'timestamp'
  | 'jsonb'
  | 'enum';

export interface TableInfo {
  name: string;
  dbName: string;
  columns: ColumnInfo[];
}

export interface EnumInfo {
  name: string;
  dbName: string;
  values: string[];
}

export interface DrizzleSchemaInfo {
  tables: TableInfo[];
  enums: EnumInfo[];
}

// ============================================================================
// Column Type Detection
// ============================================================================

const COLUMN_TYPE_MAP: Record<string, DrizzleColumnType> = {
  uuid: 'uuid',
  text: 'text',
  varchar: 'varchar',
  integer: 'integer',
  numeric: 'numeric',
  boolean: 'boolean',
  timestamp: 'timestamp',
  jsonb: 'jsonb',
};

function detectColumnType(definition: string, enumNames: Set<string>): { type: DrizzleColumnType; enumName?: string } {
  // Check if it's using a known enum
  for (const enumName of enumNames) {
    if (definition.includes(`${enumName}(`)) {
      return { type: 'enum', enumName };
    }
  }

  // Check standard column types
  for (const [funcName, colType] of Object.entries(COLUMN_TYPE_MAP)) {
    // Match function call pattern: type('column_name')
    if (new RegExp(`\\b${funcName}\\s*\\(`).test(definition)) {
      return { type: colType };
    }
  }

  return { type: 'text' }; // fallback
}

// ============================================================================
// Parsing
// ============================================================================

/**
 * Parse a Drizzle schema source file and extract table/enum information.
 */
export function parseDrizzleSchema(source: string): DrizzleSchemaInfo {
  const enums = parseEnums(source);
  const enumNames = new Set(enums.map(e => e.name));
  const tables = parseTables(source, enumNames);
  return { tables, enums };
}

/**
 * Parse pgEnum definitions from schema source.
 */
function parseEnums(source: string): EnumInfo[] {
  const enums: EnumInfo[] = [];

  // Match: export const fooEnum = pgEnum('foo_bar', ['val1', 'val2', ...]);
  const enumRegex = /export\s+const\s+(\w+)\s*=\s*pgEnum\s*\(\s*['"]([^'"]+)['"]\s*,\s*\[([\s\S]*?)\]\s*\)/g;

  let match;
  while ((match = enumRegex.exec(source)) !== null) {
    const [, name, dbName, valuesBlock] = match;

    // Extract quoted values
    const values: string[] = [];
    const valueRegex = /['"]([^'"]+)['"]/g;
    let valMatch;
    while ((valMatch = valueRegex.exec(valuesBlock)) !== null) {
      values.push(valMatch[1]);
    }

    enums.push({ name, dbName, values });
  }

  return enums;
}

/**
 * Parse pgTable definitions from schema source.
 */
function parseTables(source: string, enumNames: Set<string>): TableInfo[] {
  const tables: TableInfo[] = [];

  // Match table definitions: export const tableName = pgTable('db_name', { ... })
  // We need to find the matching closing brace for the columns object
  const tableStartRegex = /export\s+const\s+(\w+)\s*=\s*pgTable\s*\(\s*['"]([^'"]+)['"]\s*,\s*\{/g;

  let tableMatch;
  while ((tableMatch = tableStartRegex.exec(source)) !== null) {
    const [, name, dbName] = tableMatch;
    const startIdx = tableMatch.index + tableMatch[0].length;

    // Find the matching closing brace by counting braces
    const columnsBlock = extractBalancedBraces(source, startIdx);
    if (!columnsBlock) continue;

    const columns = parseColumns(columnsBlock, enumNames);
    tables.push({ name, dbName, columns });
  }

  return tables;
}

/**
 * Extract content between balanced braces, starting after the opening brace.
 */
function extractBalancedBraces(source: string, startIdx: number): string | null {
  let depth = 1;
  let i = startIdx;

  while (i < source.length && depth > 0) {
    const char = source[i];
    if (char === '{') depth++;
    else if (char === '}') depth--;
    i++;
  }

  if (depth !== 0) return null;

  // Return content between the braces (excluding the final closing brace)
  return source.slice(startIdx, i - 1);
}

/**
 * Parse column definitions from a table's column block.
 */
function parseColumns(columnsBlock: string, enumNames: Set<string>): ColumnInfo[] {
  const columns: ColumnInfo[] = [];

  // Split by lines and process each column definition
  // Column pattern: name: type('db_name').modifier1().modifier2(),
  // We need to handle multi-line column definitions

  // Strategy: find each property assignment at the top level
  const lines = columnsBlock.split('\n');
  let currentColumn = '';
  let braceDepth = 0;
  let parenDepth = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('//')) continue;

    // Track brace/paren depth to handle multi-line definitions
    for (const char of trimmed) {
      if (char === '{') braceDepth++;
      else if (char === '}') braceDepth--;
      else if (char === '(') parenDepth++;
      else if (char === ')') parenDepth--;
    }

    currentColumn += ' ' + trimmed;

    // When we're back at top level and the line ends with a comma or is the end
    if (braceDepth <= 0 && parenDepth <= 0 && (trimmed.endsWith(',') || trimmed.endsWith('),'))) {
      const parsed = parseSingleColumn(currentColumn.trim(), enumNames);
      if (parsed) columns.push(parsed);
      currentColumn = '';
      braceDepth = 0;
      parenDepth = 0;
    }
  }

  // Handle last column (might not have trailing comma)
  if (currentColumn.trim()) {
    const parsed = parseSingleColumn(currentColumn.trim(), enumNames);
    if (parsed) columns.push(parsed);
  }

  return columns;
}

/**
 * Parse a single column definition line.
 */
function parseSingleColumn(definition: string, enumNames: Set<string>): ColumnInfo | null {
  // Match: propertyName: type('db_name')...
  const columnMatch = definition.match(/^(\w+)\s*:\s*(.+?)(?:,\s*)?$/s);
  if (!columnMatch) return null;

  const [, name, rest] = columnMatch;

  // Skip if this looks like a function (table callback for indexes)
  if (rest.startsWith('(')) return null;

  // Extract db column name from the first function call: type('db_name')
  const dbNameMatch = rest.match(/\w+\s*\(\s*['"]([^'"]+)['"]/);
  const dbName = dbNameMatch ? dbNameMatch[1] : name;

  // Detect column type
  const { type, enumName } = detectColumnType(rest, enumNames);

  // Detect modifiers
  const isNotNull = rest.includes('.notNull()');
  const isPrimaryKey = rest.includes('.primaryKey()');
  const hasDefault = rest.includes('.default(') || rest.includes('.defaultRandom()') || rest.includes('.defaultNow()');
  const isArray = rest.includes('.array()');

  // Detect references
  let references: string | undefined;
  const refMatch = rest.match(/\.references\s*\(\s*(?:\(\s*\)\s*(?::\s*\w+\s*)?=>)?\s*(\w+)\.(\w+)/);
  if (refMatch) {
    references = refMatch[1]; // table name
  }

  // Detect $type<>
  let tsType: string | undefined;
  const typeMatch = rest.match(/\.\$type<([^>]+)>/);
  if (typeMatch) {
    tsType = typeMatch[1];
  }

  return {
    name,
    dbName,
    type,
    isNotNull,
    hasDefault,
    isPrimaryKey,
    isArray,
    references,
    enumName,
    tsType,
  };
}
