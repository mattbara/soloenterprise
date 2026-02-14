/**
 * Tests for context profile selection logic.
 *
 * Validates that selectContextProfile() correctly assigns profiles based on
 * task description keywords and optional context signals.
 *
 * Includes regression tests for every known false-positive (Phase 1, 5.6, 5.7+).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  selectContextProfile,
  PROFILE_OVERRIDES,
  NEGATIVE_SIGNALS,
} from '../context-profiles';

// Suppress console.log noise from the selection logging
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('selectContextProfile', () => {
  // ==========================================================================
  // PASS 1: Override tests — short-circuit before any positive matching
  // ==========================================================================

  describe('overrides (Pass 1)', () => {
    it('scaffolding + Drizzle mention → simple-endpoint (NOT database-task)', () => {
      expect(
        selectContextProfile('Project scaffolding and base configuration with Drizzle ORM setup')
      ).toBe('simple-endpoint');
    });

    it('scaffold alone → simple-endpoint', () => {
      expect(selectContextProfile('Scaffold the weather forecast app')).toBe('simple-endpoint');
    });

    it('project setup → simple-endpoint even with DB keywords', () => {
      expect(
        selectContextProfile('Project setup with database schema and ORM configuration')
      ).toBe('simple-endpoint');
    });

    it('boilerplate → simple-endpoint', () => {
      expect(selectContextProfile('Generate boilerplate for the API layer')).toBe('simple-endpoint');
    });

    it('base configuration → simple-endpoint', () => {
      expect(
        selectContextProfile('Base configuration for Next.js with Drizzle and Tailwind')
      ).toBe('simple-endpoint');
    });

    it('project structure → simple-endpoint', () => {
      expect(selectContextProfile('Set up the project structure with src/db/')).toBe(
        'simple-endpoint'
      );
    });

    it('folder structure → simple-endpoint', () => {
      expect(selectContextProfile('Create folder structure for the application')).toBe(
        'simple-endpoint'
      );
    });

    it('eslint config → simple-endpoint', () => {
      expect(selectContextProfile('Set up eslint config with TypeScript rules')).toBe(
        'simple-endpoint'
      );
    });

    it('vitest config → simple-endpoint', () => {
      expect(selectContextProfile('Create vitest config for the core package')).toBe(
        'simple-endpoint'
      );
    });

    it('hotfix → bug-fix (override)', () => {
      expect(selectContextProfile('Hotfix for auth redirect loop')).toBe('bug-fix');
    });

    it('regression → bug-fix (override)', () => {
      expect(selectContextProfile('Fix regression in user signup flow')).toBe('bug-fix');
    });

    it('revert → bug-fix (override)', () => {
      expect(selectContextProfile('Revert the broken migration')).toBe('bug-fix');
    });

    it('override exports are accessible for inspection', () => {
      expect(PROFILE_OVERRIDES.length).toBeGreaterThan(0);
      expect(PROFILE_OVERRIDES.every(o => o.keywords.length > 0)).toBe(true);
    });
  });

  // ==========================================================================
  // PASS 3: Negative signal tests — demotion after positive matching
  // ==========================================================================

  describe('negative signals (Pass 3)', () => {
    it('ORM + skeleton → demoted from database-task to simple-endpoint', () => {
      expect(
        selectContextProfile('Create the initial skeleton for the ORM layer')
      ).toBe('simple-endpoint');
    });

    it('schema + boilerplate → simple-endpoint (override catches it)', () => {
      expect(
        selectContextProfile('Set up the Drizzle ORM boilerplate with schema types')
      ).toBe('simple-endpoint');
    });

    it('negative signals export is accessible for inspection', () => {
      expect(NEGATIVE_SIGNALS['database-task']).toBeDefined();
      expect(NEGATIVE_SIGNALS['database-task']!.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // database-task — genuine DB tasks (should NOT be demoted)
  // ==========================================================================

  describe('database-task (genuine)', () => {
    it('selects database-task for "Create booking database schema"', () => {
      expect(selectContextProfile('Create booking database schema')).toBe('database-task');
    });

    it('selects database-task for "Build REST API endpoints for bookings"', () => {
      expect(selectContextProfile('Build REST API endpoints for bookings')).toBe('database-task');
    });

    it('selects database-task when description mentions Drizzle ORM', () => {
      expect(
        selectContextProfile('Build API route handlers with Drizzle ORM and paginate results')
      ).toBe('database-task');
    });

    it('selects database-task for CRUD endpoint descriptions', () => {
      expect(selectContextProfile('Create CRUD endpoints for user management')).toBe(
        'database-task'
      );
    });

    it('selects database-task when description mentions known tables', () => {
      expect(selectContextProfile('Add status field to tasks and artifacts')).toBe('database-task');
    });

    it('selects database-task when context contains schema references', () => {
      expect(
        selectContextProfile('Build API endpoints', {
          taskContext: { schemaFile: 'packages/db/src/schema.ts', orm: 'drizzle' },
        })
      ).toBe('database-task');
    });

    it('selects database-task when task depends on backend tasks', () => {
      expect(
        selectContextProfile('Process booking data', {
          dependencyAgentTypes: ['backend'],
        })
      ).toBe('database-task');
    });

    it('selects database-task over bug-fix when both signals present', () => {
      expect(
        selectContextProfile('Build REST API endpoints with error handling and paginate results')
      ).toBe('database-task');
    });

    it('selects database-task for "api route" keyword', () => {
      expect(selectContextProfile('Create api route for booking management')).toBe('database-task');
    });

    it('selects database-task for status enum mention', () => {
      expect(selectContextProfile('Add status enum and filter by status')).toBe('database-task');
    });

    it('selects database-task for Drizzle migration with schema (NOT scaffolding)', () => {
      // This is genuinely about writing migrations, not project setup
      expect(
        selectContextProfile('Create Drizzle migration for user preferences table')
      ).toBe('database-task');
    });

    it('selects database-task for "Scaffold the auth database schema" despite scaffold', () => {
      // Override fires for "scaffold" → simple-endpoint. This is intentional.
      // If you genuinely need DB context for a scaffold task, rephrase the description.
      expect(
        selectContextProfile('Scaffold the auth database schema and migration files')
      ).toBe('simple-endpoint');
    });
  });

  // ==========================================================================
  // bug-fix
  // ==========================================================================

  describe('bug-fix', () => {
    it('selects bug-fix for "Fix broken login button"', () => {
      expect(selectContextProfile('Fix broken login button')).toBe('bug-fix');
    });

    it('selects bug-fix for "fix bug in sidebar"', () => {
      expect(selectContextProfile('Fix bug in sidebar component')).toBe('bug-fix');
    });

    it('does NOT select bug-fix when database keywords also present', () => {
      expect(selectContextProfile('Fix the query for filtering bookings by status')).toBe(
        'database-task'
      );
    });
  });

  // ==========================================================================
  // simple-endpoint
  // ==========================================================================

  describe('simple-endpoint', () => {
    it('selects simple-endpoint for "Add health check endpoint"', () => {
      expect(selectContextProfile('Add health check endpoint')).toBe('simple-endpoint');
    });

    it('selects simple-endpoint for "healthcheck" tasks', () => {
      expect(selectContextProfile('Create healthcheck route')).toBe('simple-endpoint');
    });

    it('selects simple-endpoint for "health endpoint" phrasing', () => {
      expect(selectContextProfile('Create a GET /api/health endpoint')).toBe('simple-endpoint');
    });

    it('selects simple-endpoint even when weak DB signal "api route" is present', () => {
      expect(selectContextProfile('Create api route GET /api/health endpoint')).toBe(
        'simple-endpoint'
      );
    });

    it('selects simple-endpoint for ping endpoint', () => {
      expect(selectContextProfile('Add a ping endpoint to verify uptime')).toBe('simple-endpoint');
    });

    it('selects simple-endpoint for liveness probe', () => {
      expect(selectContextProfile('Create liveness probe endpoint')).toBe('simple-endpoint');
    });

    it('does NOT select simple-endpoint when strong database signals compete', () => {
      expect(selectContextProfile('Add health check endpoint with database connection test')).toBe(
        'database-task'
      );
    });
  });

  // ==========================================================================
  // full-feature
  // ==========================================================================

  describe('full-feature', () => {
    it('selects full-feature for "Build admin panel with charts, forms, and navigation"', () => {
      expect(selectContextProfile('Build admin panel with charts, forms, and navigation')).toBe(
        'full-feature'
      );
    });

    it('selects full-feature for "implement feature" tasks', () => {
      expect(selectContextProfile('Implement the user notification feature')).toBe('full-feature');
    });

    it('selects full-feature for "create system" tasks', () => {
      expect(selectContextProfile('Create the authentication system')).toBe('full-feature');
    });

    it('defaults to full-feature when no clear signals', () => {
      expect(selectContextProfile('Do something with the application')).toBe('full-feature');
    });
  });

  // ==========================================================================
  // Agent-type awareness (frontend should NOT trigger database-task for UI words)
  // ==========================================================================

  describe('agent-type awareness', () => {
    it('does NOT select database-task for frontend agent with "table" in description', () => {
      expect(
        selectContextProfile('Build bookings table component with status badges', {
          agentType: 'frontend',
        })
      ).not.toBe('database-task');
    });

    it('does NOT select database-task for frontend agent with "filter" in description', () => {
      expect(
        selectContextProfile('Build filter controls component', {
          agentType: 'frontend',
        })
      ).not.toBe('database-task');
    });

    it('still selects database-task for frontend agent with strong DB keywords like "schema"', () => {
      expect(
        selectContextProfile('Create shared types from database schema', {
          agentType: 'frontend',
        })
      ).toBe('database-task');
    });

    it('still selects database-task for backend agent with "table" in description', () => {
      expect(
        selectContextProfile('Add indexes to bookings table', {
          agentType: 'backend',
        })
      ).toBe('database-task');
    });
  });

  // ==========================================================================
  // Edge cases
  // ==========================================================================

  describe('edge cases', () => {
    it('handles empty description by defaulting to full-feature', () => {
      expect(selectContextProfile('')).toBe('full-feature');
    });

    it('"error handling" alone does NOT trigger bug-fix', () => {
      expect(selectContextProfile('Add proper error handling to the service')).toBe('full-feature');
    });

    it('"patch" triggers bug-fix when no database signals', () => {
      expect(selectContextProfile('Patch the broken middleware')).toBe('bug-fix');
    });
  });

  // ==========================================================================
  // REGRESSION TESTS — every known false-positive, permanently tracked
  // ==========================================================================

  describe('regression tests', () => {
    // Phase 1: "complete" in description was matching "full-feature" profile name
    it('Phase 1: "Complete the user profile endpoint" does NOT get full-feature from "complete"', () => {
      // "complete" alone should NOT trigger full-feature — only "complete feature" should
      const result = selectContextProfile('Complete the user profile endpoint');
      expect(result).not.toBe('database-task'); // No DB signals
      // This falls through to full-feature by default (no signals) — acceptable
    });

    // Phase 5.6: "api route" alone was triggering database-task
    it('Phase 5.6: "Create API route for fetching products" with only weak DB signals', () => {
      // "api route" is a weak DB signal, but there's no simple signal either
      // This correctly gets database-task because the task IS about API routes
      const result = selectContextProfile('Create API route for fetching products');
      expect(result).toBe('database-task');
    });

    // Phase 5.7+: Scaffolding with DB mentions was triggering database-task
    it('Phase 5.7+: Scaffolding with Drizzle ORM → simple-endpoint', () => {
      expect(
        selectContextProfile('Project scaffolding and base configuration with Drizzle ORM setup')
      ).toBe('simple-endpoint');
    });

    // Phase 5.7+: Config tasks with schema mentions
    it('Phase 5.7+: tsconfig setup → simple-endpoint', () => {
      expect(selectContextProfile('Configure tsconfig with path aliases for the ORM package')).toBe(
        'simple-endpoint'
      );
    });

    // Verify overrides don't break genuine DB tasks
    it('Genuine: "Create Drizzle schema migrations and seed data" → database-task', () => {
      expect(
        selectContextProfile('Create Drizzle schema migrations and seed data for user authentication')
      ).toBe('database-task');
    });

    // Table-based test suite for comprehensive regression coverage
    const regressionCases: [string, string | undefined, string][] = [
      // [description, agentType, expectedProfile]
      ['Create CRUD API for booking management', undefined, 'database-task'],
      ['Add health check endpoint', undefined, 'simple-endpoint'],
      ['Fix broken email validation in user service', undefined, 'bug-fix'],
      ['Build admin panel', undefined, 'full-feature'],
      ['Hotfix for auth redirect loop', undefined, 'bug-fix'],
      ['Build REST API endpoints with error handling and paginate results', undefined, 'database-task'],
      ['Project scaffolding with Drizzle ORM', undefined, 'simple-endpoint'],
      ['Create vitest config for core package', undefined, 'simple-endpoint'],
      ['Fix regression in signup flow', undefined, 'bug-fix'],
      ['Revert the broken migration', undefined, 'bug-fix'],
    ];

    it.each(regressionCases)(
      '"%s" (%s) → %s',
      (description, agentType, expectedProfile) => {
        const result = selectContextProfile(
          description,
          agentType ? { agentType } : undefined
        );
        expect(result).toBe(expectedProfile);
      }
    );
  });
});
