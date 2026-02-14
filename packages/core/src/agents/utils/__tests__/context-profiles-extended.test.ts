/**
 * Extended tests for context-profiles.ts — covers getContextConfig,
 * extractRelevantTables, estimateTokenSavings, and CONTEXT_PROFILES constant.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getContextConfig,
  extractRelevantTables,
  estimateTokenSavings,
  CONTEXT_PROFILES,
} from '../context-profiles';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

// ============================================================================
// CONTEXT_PROFILES constant
// ============================================================================

describe('CONTEXT_PROFILES', () => {
  it('simple-endpoint excludes schema and tests', () => {
    const cfg = CONTEXT_PROFILES['simple-endpoint'];
    expect(cfg.includeSchema).toBe(false);
    expect(cfg.includeTestExamples).toBe(false);
    expect(cfg.maxExamples).toBe(1);
  });

  it('database-task includes schema and service examples', () => {
    const cfg = CONTEXT_PROFILES['database-task'];
    expect(cfg.includeSchema).toBe(true);
    expect(cfg.includeServiceExamples).toBe(true);
    expect(cfg.includeRouteExamples).toBe(false);
  });

  it('full-feature includes everything', () => {
    const cfg = CONTEXT_PROFILES['full-feature'];
    expect(cfg.includeSchema).toBe(true);
    expect(cfg.includeRouteExamples).toBe(true);
    expect(cfg.includeServiceExamples).toBe(true);
    expect(cfg.includeTestExamples).toBe(true);
    expect(cfg.maxExamples).toBe(2);
  });

  it('bug-fix excludes all context', () => {
    const cfg = CONTEXT_PROFILES['bug-fix'];
    expect(cfg.includeSchema).toBe(false);
    expect(cfg.includeRouteExamples).toBe(false);
    expect(cfg.includeServiceExamples).toBe(false);
    expect(cfg.includeTestExamples).toBe(false);
    expect(cfg.maxExamples).toBe(0);
  });
});

// ============================================================================
// extractRelevantTables
// ============================================================================

describe('extractRelevantTables', () => {
  const tables = ['projects', 'tasks', 'questions', 'file_locks', 'artifacts'];

  it('extracts mentioned table names (case insensitive)', () => {
    expect(extractRelevantTables('Update the tasks table', tables)).toEqual(['tasks']);
  });

  it('extracts multiple tables', () => {
    const result = extractRelevantTables('Query projects and tasks', tables);
    expect(result).toContain('projects');
    expect(result).toContain('tasks');
  });

  it('matches underscore tables with spaces ("file locks" → file_locks)', () => {
    expect(extractRelevantTables('Manage file locks for concurrency', tables)).toEqual(['file_locks']);
  });

  it('returns empty when no tables match', () => {
    expect(extractRelevantTables('Add a health check endpoint', tables)).toEqual([]);
  });

  it('returns empty for empty description', () => {
    expect(extractRelevantTables('', tables)).toEqual([]);
  });
});

// ============================================================================
// getContextConfig
// ============================================================================

describe('getContextConfig', () => {
  it('returns base config for a known profile', () => {
    const cfg = getContextConfig('bug-fix');
    expect(cfg.includeSchema).toBe(false);
    expect(cfg.maxExamples).toBe(0);
  });

  it('filters tables dynamically for database-task with description', () => {
    const cfg = getContextConfig('database-task', 'Add fields to the tasks table');
    expect(cfg.schemaTablesFilter).toContain('tasks');
  });

  it('does not set table filter when no tables match', () => {
    const cfg = getContextConfig('database-task', 'Generic database work');
    expect(cfg.schemaTablesFilter).toBeUndefined();
  });

  it('does not set table filter for non-schema profiles', () => {
    const cfg = getContextConfig('bug-fix', 'Fix the tasks table display');
    expect(cfg.schemaTablesFilter).toBeUndefined();
  });

  it('falls back to simple-endpoint for unknown profile', () => {
    const cfg = getContextConfig('nonexistent' as any);
    expect(cfg.includeSchema).toBe(false);
    expect(cfg.includeRouteExamples).toBe(true);
  });

  it('uses custom available tables when provided', () => {
    const cfg = getContextConfig('database-task', 'Update bookings', ['bookings', 'users']);
    expect(cfg.schemaTablesFilter).toContain('bookings');
    expect(cfg.schemaTablesFilter).not.toContain('users');
  });
});

// ============================================================================
// estimateTokenSavings
// ============================================================================

describe('estimateTokenSavings', () => {
  it('bug-fix saves 60%', () => {
    expect(estimateTokenSavings('bug-fix')).toBe(0.6);
  });

  it('simple-endpoint saves 35%', () => {
    expect(estimateTokenSavings('simple-endpoint')).toBe(0.35);
  });

  it('database-task saves 25%', () => {
    expect(estimateTokenSavings('database-task')).toBe(0.25);
  });

  it('full-feature saves 0%', () => {
    expect(estimateTokenSavings('full-feature')).toBe(0);
  });

  it('unknown profile saves 0%', () => {
    expect(estimateTokenSavings('nonexistent' as any)).toBe(0);
  });
});
