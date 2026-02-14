/**
 * Tests for context profile selection logic.
 *
 * Validates that selectContextProfile() correctly assigns profiles based on
 * task description keywords and optional context signals.
 *
 * Key fix: "Booking REST API endpoints" with Drizzle context should get
 * `database-task`, NOT `bug-fix` — even if description mentions "error".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { selectContextProfile } from '../context-profiles';

// Suppress console.log noise from the selection logging
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('selectContextProfile', () => {
  // ==========================================================================
  // database-task
  // ==========================================================================

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
    expect(selectContextProfile('Create CRUD endpoints for user management')).toBe('database-task');
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
    // This is the actual bug scenario: description has "error" but task is clearly database-heavy
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

  // ==========================================================================
  // bug-fix
  // ==========================================================================

  it('selects bug-fix for "Fix broken login button"', () => {
    expect(selectContextProfile('Fix broken login button')).toBe('bug-fix');
  });

  it('selects bug-fix for "fix bug in sidebar"', () => {
    expect(selectContextProfile('Fix bug in sidebar component')).toBe('bug-fix');
  });

  it('selects bug-fix for "hotfix" tasks', () => {
    expect(selectContextProfile('Hotfix for auth redirect loop')).toBe('bug-fix');
  });

  it('selects bug-fix for "regression" tasks', () => {
    expect(selectContextProfile('Fix regression in user signup flow')).toBe('bug-fix');
  });

  it('does NOT select bug-fix when database keywords also present', () => {
    // "fix" is present but so is "query" — database-task should win
    expect(selectContextProfile('Fix the query for filtering bookings by status')).toBe(
      'database-task'
    );
  });

  // ==========================================================================
  // simple-endpoint
  // ==========================================================================

  it('selects simple-endpoint for "Add health check endpoint"', () => {
    expect(selectContextProfile('Add health check endpoint')).toBe('simple-endpoint');
  });

  it('selects simple-endpoint for "healthcheck" tasks', () => {
    expect(selectContextProfile('Create healthcheck route')).toBe('simple-endpoint');
  });

  it('does NOT select simple-endpoint when database signals compete', () => {
    expect(selectContextProfile('Add health check endpoint with database connection test')).toBe(
      'database-task'
    );
  });

  // ==========================================================================
  // full-feature
  // ==========================================================================

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

  // ==========================================================================
  // Agent-type awareness (frontend should NOT trigger database-task for UI words)
  // ==========================================================================

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

  // ==========================================================================
  // Edge cases
  // ==========================================================================

  it('handles empty description by defaulting to full-feature', () => {
    expect(selectContextProfile('')).toBe('full-feature');
  });

  it('"error handling" alone does NOT trigger bug-fix', () => {
    // "error" in isolation should NOT trigger bug-fix — it's too broad
    // This description has no bug-fix phrases, so it should fall through
    expect(selectContextProfile('Add proper error handling to the service')).toBe('full-feature');
  });

  it('"patch" triggers bug-fix when no database signals', () => {
    expect(selectContextProfile('Patch the broken middleware')).toBe('bug-fix');
  });
});
