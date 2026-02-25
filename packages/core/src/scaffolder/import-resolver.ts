/**
 * Import Resolver
 *
 * Builds an ImportMap from the project structure, mapping known exports
 * to their source packages. Used by scaffolders to generate correct
 * import statements, preventing the #1 retry cause: hallucinated imports.
 */

import { parseDrizzleSchema, type DrizzleSchemaInfo } from './drizzle-schema-parser';

// ============================================================================
// Types
// ============================================================================

export interface ImportEntry {
  /** The import specifier (what you write in the import statement) */
  name: string;
  /** The package/path to import from */
  from: string;
  /** Whether it's a type-only import */
  isType?: boolean;
}

export interface ImportMap {
  /** Map from export name → ImportEntry */
  entries: Map<string, ImportEntry>;
  /** Map from package → list of export names */
  byPackage: Map<string, string[]>;
}

// ============================================================================
// Static Known Exports
// ============================================================================

/** Core drizzle-orm exports that agents commonly use */
const DRIZZLE_ORM_EXPORTS = [
  'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'and', 'or', 'not',
  'inArray', 'notInArray', 'isNull', 'isNotNull',
  'like', 'ilike', 'notLike',
  'asc', 'desc', 'sql', 'count', 'sum', 'avg', 'min', 'max',
  'relations',
];

/** Drizzle pg-core exports */
const DRIZZLE_PG_CORE_EXPORTS = [
  'pgTable', 'pgEnum', 'uuid', 'text', 'varchar', 'integer',
  'numeric', 'boolean', 'timestamp', 'jsonb', 'index', 'uniqueIndex',
];

/** Zod exports */
const ZOD_EXPORTS = ['z', 'ZodError', 'ZodSchema', 'ZodType'];

/** Vitest exports */
const VITEST_EXPORTS = [
  'describe', 'it', 'expect', 'vi', 'beforeEach', 'afterEach',
  'beforeAll', 'afterAll', 'test',
];

/** Hono exports */
const HONO_EXPORTS = ['Hono', 'Context'];

/** React / Next.js common exports */
const REACT_EXPORTS = [
  'useState', 'useEffect', 'useCallback', 'useMemo', 'useRef',
  'useContext', 'useReducer',
];

const NEXTJS_EXPORTS: ImportEntry[] = [
  { name: 'useRouter', from: 'next/navigation' },
  { name: 'useSearchParams', from: 'next/navigation' },
  { name: 'usePathname', from: 'next/navigation' },
  { name: 'redirect', from: 'next/navigation' },
  { name: 'notFound', from: 'next/navigation' },
  { name: 'Link', from: 'next/link' },
  { name: 'Image', from: 'next/image' },
  { name: 'Metadata', from: 'next', isType: true },
];

/** React Hook Form exports */
const RHF_EXPORTS: ImportEntry[] = [
  { name: 'useForm', from: 'react-hook-form' },
  { name: 'Controller', from: 'react-hook-form' },
  { name: 'SubmitHandler', from: 'react-hook-form', isType: true },
  { name: 'UseFormReturn', from: 'react-hook-form', isType: true },
];

/** Zod resolver for React Hook Form */
const ZOD_RESOLVER_EXPORTS: ImportEntry[] = [
  { name: 'zodResolver', from: '@hookform/resolvers/zod' },
];

// ============================================================================
// Import Map Builder
// ============================================================================

/**
 * Build an ImportMap from project schema and known packages.
 *
 * @param schemaSource - The raw source of the Drizzle schema file
 * @param shadcnComponents - List of available shadcn component names
 */
export function resolveImports(
  schemaSource?: string,
  shadcnComponents?: string[],
): ImportMap {
  const entries = new Map<string, ImportEntry>();
  const byPackage = new Map<string, string[]>();

  function add(name: string, from: string, isType?: boolean) {
    entries.set(name, { name, from, isType });
    const existing = byPackage.get(from) || [];
    existing.push(name);
    byPackage.set(from, existing);
  }

  // Static known exports
  for (const name of DRIZZLE_ORM_EXPORTS) {
    add(name, 'drizzle-orm');
  }
  for (const name of DRIZZLE_PG_CORE_EXPORTS) {
    add(name, 'drizzle-orm/pg-core');
  }
  for (const name of ZOD_EXPORTS) {
    add(name, 'zod');
  }
  for (const name of VITEST_EXPORTS) {
    add(name, 'vitest');
  }
  for (const name of HONO_EXPORTS) {
    add(name, 'hono');
  }
  for (const name of REACT_EXPORTS) {
    add(name, 'react');
  }
  for (const entry of NEXTJS_EXPORTS) {
    add(entry.name, entry.from, entry.isType);
  }
  for (const entry of RHF_EXPORTS) {
    add(entry.name, entry.from, entry.isType);
  }
  for (const entry of ZOD_RESOLVER_EXPORTS) {
    add(entry.name, entry.from);
  }

  // DB package exports
  add('db', '@soloenterprise/db');

  // Schema exports from Drizzle schema
  if (schemaSource) {
    const schema = parseDrizzleSchema(schemaSource);
    addSchemaExports(schema, add);
  }

  // shadcn/ui components
  if (shadcnComponents) {
    for (const component of shadcnComponents) {
      add(component, `@/components/ui/${toKebabCase(component)}`);
    }
  }

  return { entries, byPackage };
}

/**
 * Add schema table and enum exports to the import map.
 */
function addSchemaExports(
  schema: DrizzleSchemaInfo,
  add: (name: string, from: string, isType?: boolean) => void,
): void {
  for (const table of schema.tables) {
    add(table.name, '@soloenterprise/db/schema');
  }
  for (const enumDef of schema.enums) {
    add(enumDef.name, '@soloenterprise/db/schema');
  }
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format the import map as a human-readable string for inclusion in prompts.
 * Groups imports by package for readability.
 */
export function formatImportMapForPrompt(importMap: ImportMap): string {
  const lines: string[] = ['## Available Imports\n'];

  // Sort packages for consistent output
  const packages = Array.from(importMap.byPackage.entries()).sort(([a], [b]) => a.localeCompare(b));

  for (const [pkg, names] of packages) {
    const sortedNames = [...names].sort();
    lines.push(`**${pkg}:** ${sortedNames.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Generate TypeScript import statements for a set of required imports.
 * Groups imports by package and separates type imports.
 */
export function formatImportStatements(
  requiredImports: string[],
  importMap: ImportMap,
): string {
  // Group by package
  const grouped = new Map<string, { regular: string[]; types: string[] }>();

  for (const name of requiredImports) {
    const entry = importMap.entries.get(name);
    if (!entry) continue;

    if (!grouped.has(entry.from)) {
      grouped.set(entry.from, { regular: [], types: [] });
    }

    const group = grouped.get(entry.from)!;
    if (entry.isType) {
      group.types.push(name);
    } else {
      group.regular.push(name);
    }
  }

  const statements: string[] = [];

  // Sort packages for consistent output
  const sortedPackages = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));

  for (const [pkg, { regular, types }] of sortedPackages) {
    if (regular.length > 0) {
      statements.push(`import { ${regular.sort().join(', ')} } from '${pkg}';`);
    }
    if (types.length > 0) {
      statements.push(`import type { ${types.sort().join(', ')} } from '${pkg}';`);
    }
  }

  return statements.join('\n');
}

// ============================================================================
// Utilities
// ============================================================================

function toKebabCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}
