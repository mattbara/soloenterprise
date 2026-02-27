/**
 * Scaffolder — Public API
 *
 * Entry point for the code scaffolding pipeline.
 * Agents call generateScaffold() to get pre-built files + prompt context.
 */

// Main entry point
export { generateScaffold, detectScaffoldType, extractRelatedTableNames } from './scaffold-orchestrator';
export type { ScaffoldRequest, ScaffoldResult, ScaffoldType, AgentType } from './scaffold-orchestrator';

// Schema parser
export { parseDrizzleSchema } from './drizzle-schema-parser';
export type { DrizzleSchemaInfo, TableInfo, ColumnInfo, EnumInfo } from './drizzle-schema-parser';

// Import resolver
export { resolveImports, formatImportMapForPrompt, formatImportStatements } from './import-resolver';
export type { ImportMap, ImportEntry } from './import-resolver';

// Zod generation
export { generateZodSchemas, generateZodSchemasForTable } from './zod-from-drizzle';
export type { ZodSchemaOutput, ZodGenerationResult } from './zod-from-drizzle';

// Type generation
export { generateTypes, generateTypesForTable } from './type-generator';
export type { TypeGenerationResult, TableTypeOutput } from './type-generator';

// Individual scaffolders (for direct use if needed)
export { scaffoldBackendRoute } from './backend-route';
export { scaffoldBackendService } from './backend-service';
export { scaffoldFrontendPage } from './frontend-page';
export { scaffoldFrontendForm } from './frontend-form';
export { scaffoldTestShell } from './test-shell';
export { scaffoldTDDTestShell } from './test-shell-tdd';
export { scaffoldReportTemplate } from './report-template';
export { scaffoldScopeTemplate } from './scope-template';

// Validation
export { validateGeneratedCode } from './local-validator';
export type { ValidationResult, ValidationError } from './local-validator';

// Prompt building
export { buildScaffoldPrompt, buildValidationRetryPrompt } from './prompt-builder';
