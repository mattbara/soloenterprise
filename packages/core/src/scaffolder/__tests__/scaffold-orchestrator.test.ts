import { describe, it, expect } from 'vitest';
import { generateScaffold, detectScaffoldType, extractResourceName } from '../scaffold-orchestrator';

describe('scaffold-orchestrator', () => {
  describe('detectScaffoldType', () => {
    it('should detect backend-route for API tasks', () => {
      expect(detectScaffoldType('Create users API endpoint', 'backend')).toBe('backend-route');
      expect(detectScaffoldType('Build the REST route for projects', 'backend')).toBe('backend-route');
      expect(detectScaffoldType('Implement CRUD handler for tasks', 'backend')).toBe('backend-route');
    });

    it('should detect backend-service for service tasks', () => {
      expect(detectScaffoldType('Create user service with Drizzle queries', 'backend')).toBe('backend-service');
      expect(detectScaffoldType('Build data access repository for orders', 'backend')).toBe('backend-service');
    });

    it('should detect frontend-page for page tasks', () => {
      expect(detectScaffoldType('Create users list page', 'frontend')).toBe('frontend-page');
      expect(detectScaffoldType('Build the dashboard view', 'frontend')).toBe('frontend-page');
    });

    it('should detect frontend-form for form tasks', () => {
      expect(detectScaffoldType('Create user registration form', 'frontend')).toBe('frontend-form');
      expect(detectScaffoldType('Build edit form for projects', 'frontend')).toBe('frontend-form');
      expect(detectScaffoldType('Add a signup form with email and password', 'frontend')).toBe('frontend-form');
      expect(detectScaffoldType('Create form with react hook form and zod validation', 'frontend')).toBe('frontend-form');
    });

    it('should detect frontend-page for listing/display tasks, not frontend-form', () => {
      // This is the exact description that was misclassified as frontend-form
      // because "formatted" contains the substring "form"
      const blogListing = 'Build a blog posts listing page at /posts. The page should fetch posts from the API endpoint GET /api/posts with pagination support. Display each post as a card showing the title, a truncated content preview of 150 characters, and the creation date formatted as a readable string. Include a load more button at the bottom that fetches the next page using offset-based pagination.';
      expect(detectScaffoldType(blogListing, 'frontend')).toBe('frontend-page');

      // Other page-type tasks that should never be classified as form
      expect(detectScaffoldType('Build a products listing page with search and filters', 'frontend')).toBe('frontend-page');
      expect(detectScaffoldType('Create a page to display user profiles', 'frontend')).toBe('frontend-page');
      expect(detectScaffoldType('Build dashboard view showing formatted metrics', 'frontend')).toBe('frontend-page');
    });

    it('should detect test-shell for QA tasks', () => {
      expect(detectScaffoldType('Write unit tests for user service', 'qa')).toBe('test-shell');
      expect(detectScaffoldType('Create vitest spec for auth', 'qa')).toBe('test-shell');
    });

    it('should detect test-shell for TDD-like tasks (TDD detection disabled)', () => {
      // TDD detection is disabled — all QA tasks use test-shell for now.
      // TDD will be reintroduced in a later phase.
      expect(detectScaffoldType('Write tests first using TDD approach', 'qa')).toBe('test-shell');
      expect(detectScaffoldType('Test-driven development for user API', 'qa')).toBe('test-shell');
    });

    it('should return scope for scoper agent', () => {
      expect(detectScaffoldType('Generate project scope', 'scoper')).toBe('scope');
    });

    it('should return report for client-reporter agent', () => {
      expect(detectScaffoldType('Generate progress report', 'client-reporter')).toBe('report');
    });

    it('should default to agent-specific type', () => {
      expect(detectScaffoldType('do something', 'backend')).toBe('backend-route');
      expect(detectScaffoldType('do something', 'frontend')).toBe('frontend-page');
      expect(detectScaffoldType('do something', 'qa')).toBe('test-shell');
    });
  });

  describe('generateScaffold', () => {
    it('should generate backend-route scaffold with resource from description', () => {
      const result = generateScaffold({
        agentType: 'backend',
        taskDescription: 'Create users API endpoint',
        taskName: 'Users CRUD',
        requirements: 'Build CRUD for users table',
        resourceName: 'users',
      });

      expect(result.success).toBe(true);
      expect(result.scaffoldType).toBe('backend-route');
      // Always generates 3 files (route, validators, types) — uses placeholders if no schema
      expect(result.files.length).toBe(3);
    });

    it('should generate report scaffold for client-reporter', () => {
      const result = generateScaffold({
        agentType: 'client-reporter',
        taskDescription: 'Generate weekly progress report',
        taskName: 'Weekly Report',
        requirements: 'Create a progress report for Project Alpha',
        projectName: 'Project Alpha',
        reportType: 'weekly',
      });

      expect(result.success).toBe(true);
      expect(result.scaffoldType).toBe('report');
      expect(result.files.length).toBe(1);
      expect(result.files[0].content).toContain('Project Alpha');
      expect(result.files[0].content).toContain('Weekly Report');
    });

    it('should generate scope scaffold for scoper', () => {
      const result = generateScaffold({
        agentType: 'scoper',
        taskDescription: 'Scope the booking management system',
        taskName: 'Scope Generation',
        requirements: 'Generate scope from brief',
        projectName: 'Booking System',
        briefContent: 'We need a booking management system for our hotel chain.',
      });

      expect(result.success).toBe(true);
      expect(result.scaffoldType).toBe('scope');
      expect(result.files.length).toBe(1);
      expect(result.files[0].content).toContain('Booking System');
    });

    it('should allow explicit scaffold type override', () => {
      const result = generateScaffold({
        agentType: 'backend',
        taskDescription: 'Something ambiguous',
        taskName: 'Test',
        requirements: 'test',
        scaffoldType: 'none',
      });

      expect(result.success).toBe(true);
      expect(result.scaffoldType).toBe('none');
      expect(result.files).toHaveLength(0);
    });

    it('should include prompt with scaffold sections', () => {
      const result = generateScaffold({
        agentType: 'client-reporter',
        taskDescription: 'Generate progress report',
        taskName: 'Report',
        requirements: 'Weekly update for client',
        projectName: 'TestProject',
        reportType: 'progress',
      });

      expect(result.prompt).toContain('--- SCAFFOLD ---');
      expect(result.prompt).toContain('--- REQUIREMENTS ---');
      expect(result.prompt).toContain('--- AVAILABLE IMPORTS ---');
    });

    it('should handle errors gracefully', () => {
      const result = generateScaffold({
        agentType: 'backend',
        taskDescription: 'Create users API',
        taskName: 'Users API',
        requirements: 'Build it',
        schemaPath: '/nonexistent/path/schema.ts',
        resourceName: 'users',
      });

      // Should not crash — falls back gracefully
      expect(result.success).toBe(true);
    });

    it('should return diagnostic error when backend-route generates 0 files (no resource)', () => {
      const result = generateScaffold({
        agentType: 'backend',
        taskDescription: 'do something vague',
        taskName: 'Vague Task',
        requirements: 'build it',
      });

      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(0);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('resourceName');
    });

    it('should generate placeholder scaffold when schema is unavailable', () => {
      const result = generateScaffold({
        agentType: 'backend',
        taskDescription: 'Create bookings API endpoint',
        taskName: 'Bookings CRUD',
        requirements: 'Build CRUD for bookings',
        resourceName: 'bookings',
        schemaPath: '/nonexistent/path/schema.ts',
      });

      expect(result.success).toBe(true);
      expect(result.scaffoldType).toBe('backend-route');
      expect(result.files.length).toBe(3);
      // Validator file should have TODO markers
      const validatorFile = result.files.find(f => f.path.includes('validators/'));
      expect(validatorFile).toBeDefined();
      expect(validatorFile!.content).toContain('TODO');
      // Route file should exist
      const routeFile = result.files.find(f => f.path.includes('routes/'));
      expect(routeFile).toBeDefined();
      expect(routeFile!.content).toContain('/api/bookings');
    });

    it('should generate placeholder scaffold when table not found in schema', () => {
      // "posts" doesn't exist in the platform schema — should still produce files
      const result = generateScaffold({
        agentType: 'backend',
        taskDescription: 'Create posts API endpoint',
        taskName: 'Posts CRUD',
        requirements: 'Build CRUD for posts',
        resourceName: 'posts',
      });

      expect(result.success).toBe(true);
      expect(result.files.length).toBe(3);
      // Should contain placeholder schemas with TODO
      const validatorFile = result.files.find(f => f.path.includes('validators/'));
      expect(validatorFile!.content).toContain('TODO');
      expect(validatorFile!.content).toContain('posts');
    });

    it('should generate frontend-page files even without extractable resource name', () => {
      const result = generateScaffold({
        agentType: 'frontend',
        taskDescription: 'Build the main view for this feature',
        taskName: 'Inventory Dashboard',
        requirements: 'Show inventory stats',
      });

      expect(result.success).toBe(true);
      expect(result.scaffoldType).toBe('frontend-page');
      // Must produce at least page + loading (actually produces 3: page, loading, error)
      expect(result.files.length).toBeGreaterThanOrEqual(2);
      const pageFile = result.files.find(f => f.path.includes('page.tsx'));
      expect(pageFile).toBeDefined();
      const loadingFile = result.files.find(f => f.path.includes('loading.tsx'));
      expect(loadingFile).toBeDefined();
      // Resource name should have been derived from taskName ("inventory")
      expect(pageFile!.path).toContain('inventory');
    });

    it('should generate frontend-page files with explicit resource name', () => {
      const result = generateScaffold({
        agentType: 'frontend',
        taskDescription: 'Create orders list page',
        taskName: 'Orders Page',
        requirements: 'List all orders',
      });

      expect(result.success).toBe(true);
      expect(result.scaffoldType).toBe('frontend-page');
      expect(result.files.length).toBe(3);
      expect(result.files[0].path).toContain('orders');
    });

    it('should generate frontend-page with absolute fallback when nothing is extractable', () => {
      const result = generateScaffold({
        agentType: 'frontend',
        taskDescription: 'do something',
        taskName: 'new page',
        requirements: 'build it',
      });

      expect(result.success).toBe(true);
      expect(result.scaffoldType).toBe('frontend-page');
      // Should still produce files using "resource" fallback
      expect(result.files.length).toBeGreaterThanOrEqual(2);
      expect(result.files.find(f => f.path.includes('page.tsx'))).toBeDefined();
    });

    it('should generate test-shell scaffold when source provided', () => {
      const result = generateScaffold({
        agentType: 'qa',
        taskDescription: 'Write tests for user service',
        taskName: 'User Service Tests',
        requirements: 'Full coverage',
        sourceFilePath: 'src/services/user-service.ts',
        sourceContent: `
export async function getUser(id: string) {
  return { id, name: 'test' };
}

export async function createUser(data: { name: string }) {
  return { id: '1', ...data };
}
        `,
      });

      expect(result.success).toBe(true);
      expect(result.scaffoldType).toBe('test-shell');
      expect(result.files.length).toBe(1);
      expect(result.files[0].content).toContain('getUser');
      expect(result.files[0].content).toContain('createUser');
    });

    it('should generate placeholder test-shell when no source code is available', () => {
      const result = generateScaffold({
        agentType: 'qa',
        taskDescription: 'Write tests for the booking service',
        taskName: 'Booking Tests',
        requirements: 'Full coverage for bookings',
      });

      expect(result.success).toBe(true);
      expect(result.scaffoldType).toBe('test-shell');
      expect(result.files.length).toBe(1);
      expect(result.files[0].path).toContain('__tests__');
      expect(result.files[0].path).toContain('.test.ts');
      expect(result.files[0].content).toContain("from 'vitest'");
      expect(result.files[0].content).toContain('vi.clearAllMocks');
      expect(result.files[0].content).toContain('it.todo');
      expect(result.files[0].content).toContain('TODO');
    });

    it('should generate placeholder test-shell with derived name from taskName', () => {
      const result = generateScaffold({
        agentType: 'qa',
        taskDescription: 'write some tests',
        taskName: 'Payment Gateway Tests',
        requirements: 'test it',
      });

      expect(result.success).toBe(true);
      expect(result.scaffoldType).toBe('test-shell');
      expect(result.files.length).toBe(1);
      // Should derive "payment" from taskName
      expect(result.files[0].path).toContain('payment');
    });

    // TDD scaffold generation tests — skipped while TDD detection is disabled.
    // These will be re-enabled when TDD workflow is reintroduced.
    it.skip('should generate test-tdd scaffold without endpointSpecs using default CRUD', () => {
      const result = generateScaffold({
        agentType: 'qa',
        taskDescription: 'TDD approach for bookings API',
        taskName: 'Bookings TDD Tests',
        requirements: 'Write tests first',
      });

      expect(result.success).toBe(true);
      expect(result.scaffoldType).toBe('test-tdd');
      expect(result.files.length).toBe(1);
      expect(result.files[0].content).toContain("describe('Bookings API'");
      expect(result.files[0].content).toContain("describe('GET /api/bookings'");
      expect(result.files[0].content).toContain("describe('POST /api/bookings'");
      expect(result.files[0].content).toContain("describe('PUT /api/bookings/:id'");
      expect(result.files[0].content).toContain("describe('DELETE /api/bookings/:id'");
      expect(result.files[0].content).toContain('TODO');
    });

    it.skip('should generate test-tdd scaffold with derived name when description is vague', () => {
      const result = generateScaffold({
        agentType: 'qa',
        taskDescription: 'Use TDD to build this feature',
        taskName: 'Invoice Feature Tests',
        requirements: 'test first',
      });

      expect(result.success).toBe(true);
      expect(result.scaffoldType).toBe('test-tdd');
      expect(result.files.length).toBe(1);
      // Should derive resource from taskName
      expect(result.files[0].content).toContain('/api/invoice');
    });

    it.skip('should generate test-tdd with explicit endpointSpecs when provided', () => {
      const result = generateScaffold({
        agentType: 'qa',
        taskDescription: 'TDD for users API',
        taskName: 'Users TDD',
        requirements: 'test first',
        resourceName: 'users',
        endpointSpecs: [
          { method: 'GET', path: '/api/users', description: 'List', expectedStatus: [200] },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.scaffoldType).toBe('test-tdd');
      expect(result.files.length).toBe(1);
      expect(result.files[0].content).toContain("describe('GET /api/users'");
      // Should NOT contain default CRUD endpoints that weren't provided
      expect(result.files[0].content).not.toContain("describe('DELETE");
    });
  });

  describe('extractResourceName', () => {
    it('should extract from standard "Create X API" patterns', () => {
      expect(extractResourceName('Create users API endpoint')).toBe('users');
      expect(extractResourceName('Build the projects endpoint')).toBe('projects');
      expect(extractResourceName('Implement tasks CRUD handler')).toBe('tasks');
    });

    it('should extract from "REST API for managing X" patterns', () => {
      expect(extractResourceName('Build REST API for managing bookings')).toBe('bookings');
      expect(extractResourceName('CRUD operations for invoices')).toBe('invoices');
      expect(extractResourceName('REST API for managing appointments with CRUD operations')).toBe('appointments');
    });

    it('should handle optional words between API and for (e.g. "endpoint")', () => {
      expect(extractResourceName('Build a REST API endpoint for managing blog posts')).toBe('posts');
      expect(extractResourceName('REST API endpoint for bookings')).toBe('bookings');
      expect(extractResourceName('API route for managing reservations')).toBe('reservations');
    });

    it('should extract from "X backend" / "X management" patterns', () => {
      expect(extractResourceName('Build the bookings backend')).toBe('bookings');
      expect(extractResourceName('Create payments management system')).toBe('payments');
      expect(extractResourceName('orders management')).toBe('orders');
    });

    it('should extract from "API for X" at end of string', () => {
      expect(extractResourceName('API for bookings')).toBe('bookings');
      expect(extractResourceName('endpoint for reservations')).toBe('reservations');
    });

    it('should filter out generic words', () => {
      expect(extractResourceName('Create a new API endpoint')).toBeNull();
      expect(extractResourceName('Build the simple backend')).toBeNull();
    });

    it('should return null for unrecognizable descriptions', () => {
      expect(extractResourceName('do something')).toBeNull();
      expect(extractResourceName('fix the bug')).toBeNull();
    });

    it('should extract from techSpec fallback when description fails', () => {
      expect(extractResourceName('do something', '### Resource: bookings\nSome spec')).toBe('bookings');
      expect(extractResourceName('vague task', 'Table: invoices\nschema details')).toBe('invoices');
      expect(extractResourceName('unclear', 'Resource name: payments')).toBe('payments');
    });

    it('should prefer description match over techSpec', () => {
      // Description matches "bookings", techSpec has "invoices" — description wins
      expect(extractResourceName('Create bookings API endpoint', '### Resource: invoices')).toBe('bookings');
    });
  });
});
