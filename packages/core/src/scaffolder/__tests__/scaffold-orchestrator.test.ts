import { describe, it, expect } from 'vitest';
import { generateScaffold, detectScaffoldType } from '../scaffold-orchestrator';

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
    });

    it('should detect test-shell for QA tasks', () => {
      expect(detectScaffoldType('Write unit tests for user service', 'qa')).toBe('test-shell');
      expect(detectScaffoldType('Create vitest spec for auth', 'qa')).toBe('test-shell');
    });

    it('should detect test-tdd for TDD tasks', () => {
      expect(detectScaffoldType('Write tests first using TDD approach', 'qa')).toBe('test-tdd');
      expect(detectScaffoldType('Test-driven development for user API', 'qa')).toBe('test-tdd');
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
      // Files may or may not be generated depending on schema availability
      // The key thing is no crash
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
  });
});
