/**
 * Scaffold Orchestrator
 *
 * Main entry point agents call to generate scaffolds.
 * Detects scaffold type from task description + agent type,
 * calls appropriate scaffolder(s), validates, and formats prompt context.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseDrizzleSchema, type DrizzleSchemaInfo } from './drizzle-schema-parser';
import { resolveImports, type ImportMap } from './import-resolver';
import { generateZodSchemasForTable, type ZodSchemaOutput } from './zod-from-drizzle';
import { generateTypesForTable } from './type-generator';
import { scaffoldBackendRoute } from './backend-route';
import { scaffoldBackendService } from './backend-service';
import { scaffoldFrontendPage, type PageType } from './frontend-page';
import { scaffoldTestShell } from './test-shell';
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
  'app router', 'server component',
];

const FRONTEND_FORM_KEYWORDS = [
  'form', 'input', 'react hook form', 'validation form', 'create form', 'edit form',
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
      if (matchesAny(lower, FRONTEND_FORM_KEYWORDS)) return 'frontend-form';
      if (matchesAny(lower, FRONTEND_PAGE_KEYWORDS)) return 'frontend-page';
      return 'frontend-page'; // default for frontend

    case 'qa':
      if (matchesAny(lower, TDD_KEYWORDS)) return 'test-tdd';
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
  // Try common locations relative to CWD
  const candidates = [
    resolve(process.cwd(), '..', 'db', 'src', 'schema.ts'),
    resolve(process.cwd(), 'packages', 'db', 'src', 'schema.ts'),
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

    switch (scaffoldType) {
      case 'backend-route': {
        const resourceName = request.resourceName ?? extractResourceName(request.taskDescription);
        if (resourceName && schema) {
          const zodSchemas = generateZodSchemasForTable(resourceName, schema);
          if (zodSchemas) {
            const types = generateTypesForTable(zodSchemas);
            files = scaffoldBackendRoute({
              resourceName,
              methods: ['GET', 'POST', 'PUT', 'DELETE'],
              basePath: `/api/${resourceName}`,
              zodSchemas,
              types,
              importMap,
            });
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

      case 'frontend-page': {
        const resourceName = request.resourceName ?? extractResourceName(request.taskDescription);
        if (resourceName) {
          const pageType = detectPageType(request.taskDescription);
          files = scaffoldFrontendPage({
            resourceName,
            pageType,
            routeSegment: resourceName,
            isDynamic: pageType === 'detail' || (pageType === 'form' && request.taskDescription.toLowerCase().includes('edit')),
          });
        }
        break;
      }

      case 'test-shell': {
        if (request.sourceContent && request.sourceFilePath) {
          const testFile = scaffoldTestShell({
            sourceFilePath: request.sourceFilePath,
            sourceContent: request.sourceContent,
          });
          files = [testFile];
        }
        break;
      }

      case 'test-tdd': {
        const resourceName = request.resourceName ?? extractResourceName(request.taskDescription);
        if (resourceName && request.endpointSpecs) {
          const zodSchemas = schema ? generateZodSchemasForTable(resourceName, schema) : undefined;
          const testFile = scaffoldTDDTestShell({
            resourceName,
            expectedEndpoints: request.endpointSpecs,
            zodSchemas: zodSchemas ?? undefined,
          });
          files = [testFile];
        }
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
 * Extract resource/table name from task description.
 * Looks for common patterns like "Create users API" or "Build the projects endpoint".
 */
function extractResourceName(description: string): string | null {
  const lower = description.toLowerCase();

  // Pattern: "Create/Build/Implement {resource} API/endpoint/route/service/page"
  const patterns = [
    /(?:create|build|implement|add|set up|scaffold)\s+(?:a\s+|the\s+)?(\w+)\s+(?:api|endpoint|route|service|page|form|crud|list|detail|dashboard)/i,
    /(\w+)\s+(?:api|endpoint|route|service|crud)\s+(?:endpoint|handler|routes?)/i,
    /(?:for|on)\s+(?:the\s+)?(\w+)\s+(?:table|resource|entity|model)/i,
  ];

  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (match) {
      const name = match[1];
      // Filter out generic words
      if (!['the', 'a', 'an', 'new', 'basic', 'simple'].includes(name)) {
        return name;
      }
    }
  }

  return null;
}

function detectPageType(description: string): PageType {
  const lower = description.toLowerCase();
  if (lower.includes('dashboard')) return 'dashboard';
  if (lower.includes('detail') || lower.includes('single') || lower.includes('view one')) return 'detail';
  if (lower.includes('form') || lower.includes('create') || lower.includes('edit')) return 'form';
  return 'list';
}
