/**
 * Scaffold Orchestrator
 *
 * Main entry point agents call to generate scaffolds.
 * Detects scaffold type from task description + agent type,
 * calls appropriate scaffolder(s), validates, and formats prompt context.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseDrizzleSchema, type DrizzleSchemaInfo } from './drizzle-schema-parser';
import { resolveImports, type ImportMap } from './import-resolver';
import { generateZodSchemasForTable, type ZodSchemaOutput } from './zod-from-drizzle';
import { generateTypesForTable } from './type-generator';
import { scaffoldBackendRoute } from './backend-route';
import { scaffoldBackendService } from './backend-service';
import { scaffoldFrontendPage, type PageType } from './frontend-page';
import { scaffoldTestShell, scaffoldPlaceholderTestShell } from './test-shell';
import { scaffoldTDDTestShell, type EndpointSpec } from './test-shell-tdd';
import { scaffoldReportTemplate } from './report-template';
import { scaffoldScopeTemplate } from './scope-template';
import { validateGeneratedCode } from './local-validator';
import { buildScaffoldPrompt } from './prompt-builder';
import type { ValidationResult } from './local-validator';

// ============================================================================
// Types
// ============================================================================

export type ScaffoldType =
  | 'backend-route'
  | 'backend-service'
  | 'frontend-page'
  | 'frontend-form'
  | 'test-shell'
  | 'test-tdd'
  | 'report'
  | 'scope'
  | 'none';

export type AgentType = 'backend' | 'frontend' | 'qa' | 'scoper' | 'client-reporter';

export interface ScaffoldRequest {
  /** Agent type making the request */
  agentType: AgentType;
  /** Task description for heuristic detection */
  taskDescription: string;
  /** Task name */
  taskName: string;
  /** Task requirements (for prompt building) */
  requirements: string;
  /** Optional: explicit scaffold type override */
  scaffoldType?: ScaffoldType;
  /** Optional: resource/table name */
  resourceName?: string;
  /** Optional: path to the Drizzle schema file */
  schemaPath?: string;
  /** Optional: tech spec from architect */
  techSpec?: string;
  /** Optional: source file content (for test-shell) */
  sourceContent?: string;
  /** Optional: source file path (for test-shell) */
  sourceFilePath?: string;
  /** Optional: endpoint specs (for test-tdd) */
  endpointSpecs?: EndpointSpec[];
  /** Optional: report type */
  reportType?: 'progress' | 'milestone' | 'weekly' | 'final';
  /** Optional: brief content (for scope template) */
  briefContent?: string;
  /** Optional: project name */
  projectName?: string;
}

export interface ScaffoldResult {
  /** Whether scaffolding was successful */
  success: boolean;
  /** Scaffold type that was detected/used */
  scaffoldType: ScaffoldType;
  /** Generated scaffold files */
  files: Array<{ path: string; content: string }>;
  /** Validation result of generated files */
  validation: ValidationResult;
  /** Import map used */
  importMap: ImportMap;
  /** Formatted prompt for Claude (includes scaffold + requirements + imports) */
  prompt: string;
  /** Error message if scaffolding failed */
  error?: string;
}

// ============================================================================
// Heuristic Detection
// ============================================================================

const BACKEND_ROUTE_KEYWORDS = [
  'api', 'route', 'endpoint', 'rest', 'crud', 'handler',
  'hono', 'get', 'post', 'put', 'delete',
];

const BACKEND_SERVICE_KEYWORDS = [
  'service', 'repository', 'data access', 'query', 'drizzle',
];

const FRONTEND_PAGE_KEYWORDS = [
  'page', 'view', 'screen', 'dashboard', 'list page', 'detail page',
  'listing', 'display', 'app router', 'server component',
];

const FRONTEND_FORM_KEYWORDS = [
  'create form', 'edit form', 'submit form', 'form validation',
  'react hook form', 'form field', 'form input', 'registration form',
  'signup form', 'login form',
];

const TEST_KEYWORDS = [
  'test', 'spec', 'vitest', 'unit test', 'integration test',
];

const TDD_KEYWORDS = [
  'tdd', 'test first', 'test-driven', 'write tests before',
];

/**
 * Detect scaffold type from task description and agent type.
 */
export function detectScaffoldType(description: string, agentType: AgentType): ScaffoldType {
  const lower = description.toLowerCase();

  switch (agentType) {
    case 'backend':
      if (matchesAny(lower, BACKEND_ROUTE_KEYWORDS)) return 'backend-route';
      if (matchesAny(lower, BACKEND_SERVICE_KEYWORDS)) return 'backend-service';
      return 'backend-route'; // default for backend

    case 'frontend':
      // Check form first (multi-word phrases only, no false positives)
      // then page (broader keywords). Form keywords are specific enough
      // that if they match, it's intentional.
      if (matchesAny(lower, FRONTEND_FORM_KEYWORDS)) return 'frontend-form';
      if (matchesAny(lower, FRONTEND_PAGE_KEYWORDS)) return 'frontend-page';
      return 'frontend-page'; // default for frontend

    case 'qa':
      // TDD detection disabled — will be reintroduced in a later phase.
      // QA always uses test-shell (regular testing from existing code/spec).
      // if (matchesAny(lower, TDD_KEYWORDS)) return 'test-tdd';
      if (matchesAny(lower, TEST_KEYWORDS)) return 'test-shell';
      return 'test-shell'; // default for QA

    case 'scoper':
      return 'scope';

    case 'client-reporter':
      return 'report';
  }
}

function matchesAny(text: string, keywords: string[]): boolean {
  return keywords.some(kw => text.includes(kw));
}

// ============================================================================
// Schema Loading
// ============================================================================

function loadSchema(schemaPath?: string): DrizzleSchemaInfo | null {
  const path = schemaPath ?? findDefaultSchemaPath();
  if (!path) return null;

  try {
    const source = readFileSync(path, 'utf-8');
    return parseDrizzleSchema(source);
  } catch {
    return null;
  }
}

function loadSchemaSource(schemaPath?: string): string | undefined {
  const path = schemaPath ?? findDefaultSchemaPath();
  if (!path) return undefined;

  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return undefined;
  }
}

function findDefaultSchemaPath(): string | null {
  // __dirname-based resolution (stable — anchored to this file's location)
  // From packages/core/src/scaffolder -> repo root
  let selfDir: string;
  try {
    selfDir = dirname(fileURLToPath(import.meta.url));
  } catch {
    // Fallback for CJS or test environments where import.meta.url is unavailable
    selfDir = __dirname ?? process.cwd();
  }
  const repoRoot = resolve(selfDir, '../../../../');

  const candidates = [
    // Stable: relative to this file's location
    resolve(repoRoot, 'packages', 'db', 'src', 'schema.ts'),
    // CWD-based fallbacks for client project sandboxes
    resolve(process.cwd(), 'packages', 'db', 'src', 'schema.ts'),
    resolve(process.cwd(), '..', 'db', 'src', 'schema.ts'),
    resolve(process.cwd(), 'src', 'db', 'schema.ts'),
  ];

  for (const candidate of candidates) {
    try {
      readFileSync(candidate, 'utf-8');
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

// ============================================================================
// Orchestrator
// ============================================================================

/**
 * Main entry point: generate scaffold for a task.
 * Returns files, validation result, and formatted prompt.
 */
export function generateScaffold(request: ScaffoldRequest): ScaffoldResult {
  const scaffoldType = request.scaffoldType ?? detectScaffoldType(request.taskDescription, request.agentType);
  console.log(`[ScaffoldOrchestrator] DEBUG v2: generateScaffold called, agent=${request.agentType}, detected=${scaffoldType}`);

  // Early return for non-scaffoldable tasks
  if (scaffoldType === 'none') {
    const importMap = resolveImports();
    return {
      success: true,
      scaffoldType: 'none',
      files: [],
      validation: { valid: true, errors: [] },
      importMap,
      prompt: request.requirements,
    };
  }

  try {
    const schemaSource = loadSchemaSource(request.schemaPath);
    const schema = schemaSource ? parseDrizzleSchema(schemaSource) : null;
    const importMap = resolveImports(schemaSource);

    let files: Array<{ path: string; content: string }> = [];
    const diagnostics: string[] = [];

    switch (scaffoldType) {
      case 'backend-route': {
        const resourceName = request.resourceName ?? extractResourceName(request.taskDescription, request.techSpec);
        if (!resourceName) {
          diagnostics.push(`resourceName: could not extract from description "${request.taskDescription}"${request.techSpec ? ' or techSpec' : ''}`);
          break;
        }

        // Try real schema first, fall back to placeholders so we always produce files
        let zodSchemas: ZodSchemaOutput | null = null;
        if (schema) {
          zodSchemas = generateZodSchemasForTable(resourceName, schema);
          if (!zodSchemas) {
            diagnostics.push(`table "${resourceName}" not found in schema, using placeholder schemas`);
          }
        } else {
          diagnostics.push('schema not loaded, using placeholder schemas');
        }

        if (!zodSchemas) {
          zodSchemas = placeholderZodSchemas(resourceName);
        }

        const types = generateTypesForTable(zodSchemas);
        files = scaffoldBackendRoute({
          resourceName,
          methods: ['GET', 'POST', 'PUT', 'DELETE'],
          basePath: `/api/${resourceName}`,
          zodSchemas,
          types,
          importMap,
        });

        // Multi-table detection: include Zod schemas for related tables as context
        if (schema) {
          const relatedTables = extractRelatedTableNames(
            request.taskDescription,
            schema,
            resourceName,
            request.techSpec,
          );
          if (relatedTables.length > 0) {
            const relatedSchemaBlocks: string[] = [
              "import { z } from 'zod';",
              '',
              '// Related table schemas — use these for joins, lookups, and foreign key validation.',
              '// Do NOT duplicate these definitions. Import or reference as needed.',
              '',
            ];
            for (const tableName of relatedTables) {
              const relatedZod = generateZodSchemasForTable(tableName, schema);
              if (relatedZod) {
                const pascal = toPascalCase(tableName);
                relatedSchemaBlocks.push(`// --- ${pascal} ---`);
                relatedSchemaBlocks.push(`export const select${pascal}Schema = ${relatedZod.selectSchema};`);
                relatedSchemaBlocks.push(`export const insert${pascal}Schema = ${relatedZod.insertSchema};`);
                relatedSchemaBlocks.push('');
              }
            }
            files.push({
              path: `src/validators/${resourceName}-related-schemas.ts`,
              content: relatedSchemaBlocks.join('\n'),
            });
            diagnostics.push(`related tables detected: ${relatedTables.join(', ')} (${relatedTables.length + 1} tables total)`);
          }
        }
        break;
      }

      case 'backend-service': {
        const resourceName = request.resourceName ?? extractResourceName(request.taskDescription);
        if (resourceName) {
          const serviceFile = scaffoldBackendService({
            resourceName,
            importMap,
          });
          files = [serviceFile];
        }
        break;
      }

      case 'frontend-page':
      case 'frontend-form': {
        let resourceName = request.resourceName ?? extractResourceName(request.taskDescription, request.techSpec);
        if (!resourceName) {
          // Fallback: derive from task name (e.g., "Build Users Page" → "users")
          resourceName = extractResourceName(request.taskName) ?? deriveResourceFallback(request.taskName);
          diagnostics.push(`resourceName: could not extract from description, derived "${resourceName}" from taskName`);
        }

        const pageType = scaffoldType === 'frontend-form' ? 'form' as PageType : detectPageType(request.taskDescription);
        files = scaffoldFrontendPage({
          resourceName,
          pageType,
          routeSegment: resourceName,
          isDynamic: pageType === 'detail' || (pageType === 'form' && request.taskDescription.toLowerCase().includes('edit')),
        });
        break;
      }

      case 'test-shell': {
        console.log(`[ScaffoldOrchestrator] DEBUG: entered test-shell case, hasSource=${!!request.sourceContent}, hasPath=${!!request.sourceFilePath}`);
        if (request.sourceContent && request.sourceFilePath) {
          const testFile = scaffoldTestShell({
            sourceFilePath: request.sourceFilePath,
            sourceContent: request.sourceContent,
          });
          console.log(`[ScaffoldOrchestrator] DEBUG: test-shell from source → "${testFile.path}", ${testFile.content.length} chars`);
          files = [testFile];
        } else {
          // No source code available — generate placeholder test shell with TODO markers
          const moduleName = request.resourceName
            ?? extractResourceName(request.taskDescription, request.techSpec)
            ?? extractResourceName(request.taskName)
            ?? deriveResourceFallback(request.taskName);
          diagnostics.push('no source file available, generating placeholder test shell');
          const testFile = scaffoldPlaceholderTestShell(moduleName);
          console.log(`[ScaffoldOrchestrator] DEBUG: test-shell placeholder → "${testFile.path}", module="${moduleName}", ${testFile.content.length} chars`);
          files = [testFile];
        }
        break;
      }

      case 'test-tdd': {
        console.log('[ScaffoldOrchestrator] DEBUG: entered test-tdd case');
        let resourceName = request.resourceName ?? extractResourceName(request.taskDescription, request.techSpec);
        if (!resourceName) {
          resourceName = extractResourceName(request.taskName) ?? deriveResourceFallback(request.taskName);
          diagnostics.push(`resourceName: could not extract from description, derived "${resourceName}" from taskName`);
        }
        console.log(`[ScaffoldOrchestrator] DEBUG: test-tdd resourceName="${resourceName}", hasEndpointSpecs=${!!request.endpointSpecs}`);

        // Use provided endpoints or generate default CRUD endpoint specs
        const endpointSpecs: EndpointSpec[] = request.endpointSpecs ?? [
          { method: 'GET', path: `/api/${resourceName}`, description: `List ${resourceName}`, expectedStatus: [200] },
          { method: 'GET', path: `/api/${resourceName}/:id`, description: `Get ${resourceName} by ID`, expectedStatus: [200, 404] },
          { method: 'POST', path: `/api/${resourceName}`, description: `Create ${resourceName}`, expectedStatus: [201, 400] },
          { method: 'PUT', path: `/api/${resourceName}/:id`, description: `Update ${resourceName}`, expectedStatus: [200, 400, 404] },
          { method: 'DELETE', path: `/api/${resourceName}/:id`, description: `Delete ${resourceName}`, expectedStatus: [200, 404] },
        ];
        if (!request.endpointSpecs) {
          diagnostics.push('no endpointSpecs provided, using default CRUD endpoints');
        }

        const zodSchemas = schema ? generateZodSchemasForTable(resourceName, schema) : undefined;
        const testFile = scaffoldTDDTestShell({
          resourceName,
          expectedEndpoints: endpointSpecs,
          zodSchemas: zodSchemas ?? undefined,
        });
        console.log(`[ScaffoldOrchestrator] DEBUG: test-tdd produced file at "${testFile.path}", content length=${testFile.content.length}`);
        files = [testFile];
        break;
      }

      case 'report': {
        const reportFile = scaffoldReportTemplate({
          projectName: request.projectName ?? 'Unnamed Project',
          reportType: request.reportType ?? 'progress',
        });
        files = [reportFile];
        break;
      }

      case 'scope': {
        if (request.briefContent) {
          const scopeFile = scaffoldScopeTemplate({
            projectName: request.projectName ?? 'Unnamed Project',
            briefContent: request.briefContent,
          });
          files = [scopeFile];
        }
        break;
      }
    }

    console.log(`[ScaffoldOrchestrator] DEBUG v2: after switch, scaffoldType=${scaffoldType}, files=${files.length}, diagnostics=[${diagnostics.join('; ')}]`);

    // Validate generated files
    const validation = validateGeneratedCode(files, {
      skipNonTS: true,
      checkImports: true,
      importMap,
    });

    // Build prompt
    const prompt = files.length > 0
      ? buildScaffoldPrompt({
          scaffoldFiles: files,
          requirements: request.requirements,
          importMap,
          techSpec: request.techSpec,
        })
      : request.requirements;

    return {
      success: true,
      scaffoldType,
      files,
      validation,
      importMap,
      prompt,
      error: files.length === 0 && diagnostics.length > 0
        ? `0 files generated — ${diagnostics.join('; ')}`
        : undefined,
    };
  } catch (err) {
    const importMap = resolveImports();
    return {
      success: false,
      scaffoldType,
      files: [],
      validation: { valid: true, errors: [] },
      importMap,
      prompt: request.requirements,
      error: err instanceof Error ? err.message : 'Unknown scaffold error',
    };
  }
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Extract resource/table name from task description (and optionally techSpec).
 * Looks for common patterns like "Create users API", "REST API for managing bookings", etc.
 */
export function extractResourceName(description: string, techSpec?: string): string | null {
  const GENERIC_WORDS = ['the', 'a', 'an', 'new', 'basic', 'simple', 'rest', 'full', 'complete'];

  // Pattern: "Create/Build/Implement {resource} API/endpoint/route/service/page"
  const patterns = [
    /(?:create|build|implement|add|set up|scaffold)\s+(?:a\s+|the\s+)?(\w+)\s+(?:api|endpoint|route|service|page|form|crud|list|detail|dashboard)/i,
    /(\w+)\s+(?:api|endpoint|route|service|crud)\s+(?:endpoint|handler|routes?)/i,
    /(?:for|on)\s+(?:the\s+)?(\w+)\s+(?:table|resource|entity|model)/i,
    // "REST API [endpoint] for [managing] [blog] {resource}" — allows optional words between API and for,
    // and captures the LAST word before end/punctuation as resource (handles multi-word like "blog posts")
    /(?:rest\s+)?(?:api|crud\s+operations?)(?:\s+\w+)*?\s+for\s+(?:managing\s+)?(?:\w+\s+)*?(\w+)\s*(?:$|[.,;!?]|\bwith\b|\busing\b|\bthat\b)/i,
    // "Build the {resource} backend" / "{resource} management"
    /(?:build|create|implement)\s+(?:a\s+|the\s+)?(\w+)\s+(?:backend|management|system)/i,
    // "API/endpoint/route [endpoint] for {resource}" at end of string — allows optional words between
    /(?:api|endpoint|route)(?:\s+\w+)*?\s+for\s+(?:\w+\s+)*?(\w+)\s*$/i,
    // "{resource} management" standalone
    /^(\w+)\s+management\b/i,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) {
      const name = match[1].toLowerCase();
      if (!GENERIC_WORDS.includes(name)) {
        return name;
      }
    }
  }

  // Tech spec fallback: look for "### Resource: {name}" or "Table: {name}"
  if (techSpec) {
    const specPatterns = [
      /###\s*Resource:\s*(\w+)/i,
      /\bTable:\s*(\w+)/i,
      /\bResource(?:\s+name)?:\s*(\w+)/i,
    ];
    for (const pattern of specPatterns) {
      const match = techSpec.match(pattern);
      if (match) {
        const name = match[1].toLowerCase();
        if (!GENERIC_WORDS.includes(name)) {
          return name;
        }
      }
    }
  }

  return null;
}

function toPascalCase(name: string): string {
  return name.replace(/(^|_)([a-z])/g, (_, _p, c) => c.toUpperCase());
}

/**
 * Extract all table names referenced in the task description and tech spec
 * that exist in the parsed schema. Excludes the primary resource.
 * Used to include related table schemas as context for multi-table tasks.
 */
export function extractRelatedTableNames(
  description: string,
  schema: DrizzleSchemaInfo,
  primaryResource: string,
  techSpec?: string,
): string[] {
  const text = `${description} ${techSpec ?? ''}`.toLowerCase();
  const schemaTableNames = schema.tables.map(t => t.name);
  const found = new Set<string>();

  for (const tableName of schemaTableNames) {
    if (tableName === primaryResource) continue;

    // Match table name as a word boundary (singular or as-is)
    // e.g., "projects" matches "projects table", "project details", "projectId"
    const singular = tableName.endsWith('s') ? tableName.slice(0, -1) : tableName;
    const pattern = new RegExp(`\\b${singular}`, 'i');
    if (pattern.test(text)) {
      found.add(tableName);
    }
  }

  return Array.from(found);
}

/**
 * Generate placeholder Zod schemas when no Drizzle schema is available.
 * Produces valid scaffolds with TODO markers for Claude to fill in.
 */
function placeholderZodSchemas(resourceName: string): ZodSchemaOutput {
  const pascal = toPascalCase(resourceName);
  return {
    tableName: pascal,
    insertSchema: `z.object({\n  // TODO: Define ${resourceName} fields from your schema\n  name: z.string(),\n})`,
    updateSchema: `insert${pascal}Schema.partial()`,
    selectSchema: `z.object({\n  id: z.string().uuid(),\n  // TODO: Define ${resourceName} fields from your schema\n  name: z.string(),\n  createdAt: z.string().datetime({ offset: true }),\n})`,
    queryParamsSchema: `z.object({\n  limit: z.coerce.number().int().min(1).max(100).default(20),\n  offset: z.coerce.number().int().min(0).default(0),\n})`,
  };
}

/**
 * Last-resort resource name derivation from task name.
 * Extracts the first non-generic noun, or returns 'resource' as absolute fallback.
 */
function deriveResourceFallback(taskName: string): string {
  const STOP_WORDS = ['the', 'a', 'an', 'new', 'basic', 'simple', 'create', 'build', 'implement', 'add', 'set', 'up', 'page', 'form', 'view', 'screen'];
  const words = taskName.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
  const candidate = words.find(w => w.length > 2 && !STOP_WORDS.includes(w));
  return candidate ?? 'resource';
}

function detectPageType(description: string): PageType {
  const lower = description.toLowerCase();
  if (lower.includes('dashboard')) return 'dashboard';
  if (lower.includes('detail') || lower.includes('single') || lower.includes('view one')) return 'detail';
  if (lower.includes('form') || lower.includes('create') || lower.includes('edit')) return 'form';
  return 'list';
}
