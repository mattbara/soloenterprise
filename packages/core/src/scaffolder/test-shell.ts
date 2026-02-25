/**
 * Test Shell Scaffolder
 *
 * Generates Vitest test file from existing source code.
 * Parses exports and creates describe blocks + vi.mock setup.
 */

// ============================================================================
// Types
// ============================================================================

export interface TestShellInput {
  /** Path to the source file being tested */
  sourceFilePath: string;
  /** Source file content */
  sourceContent: string;
  /** Additional imports to mock */
  mockedModules?: string[];
}

export interface ScaffoldedFile {
  path: string;
  content: string;
}

// ============================================================================
// Test Shell Scaffolder
// ============================================================================

/**
 * Generate a Vitest test file from existing source code.
 * Extracts exported functions/classes and creates test stubs.
 */
export function scaffoldTestShell(input: TestShellInput): ScaffoldedFile {
  const { sourceFilePath, sourceContent, mockedModules = [] } = input;
  const exports = extractExports(sourceContent);
  const testPath = deriveTestPath(sourceFilePath);

  const parts: string[] = [];

  // Imports
  parts.push("import { describe, it, expect, vi, beforeEach } from 'vitest';");
  parts.push('');

  // Mock hoisted variables
  if (mockedModules.length > 0) {
    parts.push('const mocks = vi.hoisted(() => ({');
    for (const mod of mockedModules) {
      const mockName = toMockVarName(mod);
      parts.push(`  ${mockName}: vi.fn(),`);
    }
    parts.push('}));');
    parts.push('');

    // vi.mock calls
    for (const mod of mockedModules) {
      parts.push(`vi.mock('${mod}', () => ({`);
      parts.push(`  // TODO: Define mock exports`);
      parts.push(`}));`);
    }
    parts.push('');
  }

  // Import the module under test
  const importPath = sourceFilePath.replace(/\.tsx?$/, '').replace(/^src\//, '../');
  if (exports.namedExports.length > 0) {
    parts.push(`import { ${exports.namedExports.join(', ')} } from '${importPath}';`);
  }
  if (exports.defaultExport) {
    const defaultName = exports.defaultExport;
    parts.push(`import ${defaultName} from '${importPath}';`);
  }
  parts.push('');

  // Describe blocks
  const moduleName = sourceFilePath.split('/').pop()?.replace(/\.tsx?$/, '') ?? 'module';

  parts.push(`describe('${moduleName}', () => {`);

  if (mockedModules.length > 0) {
    parts.push(`  beforeEach(() => {`);
    parts.push(`    vi.clearAllMocks();`);
    parts.push(`  });`);
    parts.push('');
  }

  // Test stubs for each export
  for (const name of exports.namedExports) {
    const isFunction = exports.functions.includes(name);
    const isClass = exports.classes.includes(name);

    parts.push(`  describe('${name}', () => {`);

    if (isFunction) {
      parts.push(`    it('should work correctly', () => {`);
      parts.push(`      // TODO: Implement test for ${name}()`);
      parts.push(`      // const result = ${name}(/* args */);`);
      parts.push(`      // expect(result).toBeDefined();`);
      parts.push(`    });`);
    } else if (isClass) {
      parts.push(`    it('should instantiate correctly', () => {`);
      parts.push(`      // TODO: Implement test for ${name} class`);
      parts.push(`      // const instance = new ${name}(/* args */);`);
      parts.push(`      // expect(instance).toBeDefined();`);
      parts.push(`    });`);
    } else {
      parts.push(`    it('should be defined', () => {`);
      parts.push(`      expect(${name}).toBeDefined();`);
      parts.push(`    });`);
    }

    parts.push(`  });`);
    parts.push('');
  }

  if (exports.defaultExport) {
    parts.push(`  describe('default export', () => {`);
    parts.push(`    it('should be defined', () => {`);
    parts.push(`      expect(${exports.defaultExport}).toBeDefined();`);
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
// Export Extraction
// ============================================================================

interface ExtractedExports {
  namedExports: string[];
  defaultExport: string | null;
  functions: string[];
  classes: string[];
}

function extractExports(source: string): ExtractedExports {
  const namedExports: string[] = [];
  const functions: string[] = [];
  const classes: string[] = [];
  let defaultExport: string | null = null;

  // export function name
  const funcRegex = /export\s+(?:async\s+)?function\s+(\w+)/g;
  let match;
  while ((match = funcRegex.exec(source)) !== null) {
    namedExports.push(match[1]);
    functions.push(match[1]);
  }

  // export class Name
  const classRegex = /export\s+class\s+(\w+)/g;
  while ((match = classRegex.exec(source)) !== null) {
    namedExports.push(match[1]);
    classes.push(match[1]);
  }

  // export const name
  const constRegex = /export\s+const\s+(\w+)/g;
  while ((match = constRegex.exec(source)) !== null) {
    if (!namedExports.includes(match[1])) {
      namedExports.push(match[1]);
    }
  }

  // export interface/type (skip — not runtime testable)

  // export default
  const defaultMatch = source.match(/export\s+default\s+(?:function\s+)?(\w+)/);
  if (defaultMatch) {
    defaultExport = defaultMatch[1];
  }

  return { namedExports, defaultExport, functions, classes };
}

// ============================================================================
// Utilities
// ============================================================================

function deriveTestPath(sourcePath: string): string {
  // src/services/user-service.ts → src/services/__tests__/user-service.test.ts
  const parts = sourcePath.split('/');
  const fileName = parts.pop()!;
  const testFileName = fileName.replace(/\.tsx?$/, '.test.ts');
  parts.push('__tests__', testFileName);
  return parts.join('/');
}

function toMockVarName(modulePath: string): string {
  // '@soloenterprise/db' → 'mockDb'
  // './utils/helper' → 'mockHelper'
  const last = modulePath.split('/').pop()!.replace(/[^a-zA-Z]/g, '');
  return 'mock' + last.charAt(0).toUpperCase() + last.slice(1);
}
