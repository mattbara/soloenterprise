/**
 * Tests for the skill-loader utility.
 *
 * Validates task complexity classification, skill layer selection,
 * orchestrator action detection, token estimation, and file loading.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs/promises before importing the module under test
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

import { readFile } from 'fs/promises';
import {
  classifyTaskComplexity,
  selectSkillLayers,
  loadSkillContent,
  estimateTokens,
  detectOrchestratorAction,
  selectOrchestratorLayers,
  loadSkillsForTask,
  loadSkillsForOrchestrator,
} from '../skill-loader';

const mockedReadFile = vi.mocked(readFile);

// Suppress console output
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  mockedReadFile.mockReset();
});

// =============================================================================
// classifyTaskComplexity
// =============================================================================

describe('classifyTaskComplexity', () => {
  // --- simple ---

  it('classifies bug fix as simple', () => {
    const result = classifyTaskComplexity('Fix the broken health check endpoint');
    expect(result.simple).toBe(true);
    expect(result.database).toBe(false);
    expect(result.newPattern).toBe(false);
  });

  it('classifies health check as simple', () => {
    const result = classifyTaskComplexity('Add a health ping route');
    expect(result.simple).toBe(true);
  });

  it('classifies simple endpoint (singular) as simple', () => {
    const result = classifyTaskComplexity('Create a basic endpoint for status');
    expect(result.simple).toBe(true);
    expect(result.database).toBe(false);
    expect(result.newPattern).toBe(false);
  });

  // --- database ---

  it('classifies database migration as database', () => {
    const result = classifyTaskComplexity('Run database migration for users table');
    expect(result.database).toBe(true);
  });

  it('classifies schema work as database', () => {
    const result = classifyTaskComplexity('Update the schema to add a new column');
    expect(result.database).toBe(true);
  });

  it('classifies table work as database', () => {
    const result = classifyTaskComplexity('Create a new table for orders');
    expect(result.database).toBe(true);
  });

  // --- newPattern ---

  it('classifies auth as newPattern', () => {
    const result = classifyTaskComplexity('Implement authentication with JWT');
    expect(result.newPattern).toBe(true);
  });

  it('classifies websocket as newPattern', () => {
    const result = classifyTaskComplexity('Add websocket support for real-time updates');
    expect(result.newPattern).toBe(true);
  });

  // --- complex indicators ---

  it('classifies feature + implement as not simple', () => {
    const result = classifyTaskComplexity('Implement the user feature for dashboards');
    // "feature" is a complex indicator so simple should be false
    expect(result.simple).toBe(false);
  });

  // --- negation ---

  it('does not trigger database when "no database" is present', () => {
    const result = classifyTaskComplexity('Fix the endpoint, no database changes needed');
    expect(result.database).toBe(false);
    expect(result.simple).toBe(true);
  });

  // --- multiple indicators ---

  it('sets both database and newPattern when both present', () => {
    const result = classifyTaskComplexity('Add auth and create a database schema for sessions');
    expect(result.database).toBe(true);
    expect(result.newPattern).toBe(true);
    // Has complex indicators so not simple
    expect(result.simple).toBe(false);
  });
});

// =============================================================================
// selectSkillLayers
// =============================================================================

describe('selectSkillLayers', () => {
  it('returns only core layer for simple task', () => {
    const layers = selectSkillLayers('backend', {
      simple: true,
      database: false,
      newPattern: false,
    });
    expect(layers).toHaveLength(1);
    expect(layers[0]).toContain('SKILL-backend-core.md');
  });

  it('returns core + patterns for database task', () => {
    const layers = selectSkillLayers('backend', {
      simple: false,
      database: true,
      newPattern: false,
    });
    expect(layers).toHaveLength(2);
    expect(layers[0]).toContain('SKILL-backend-core.md');
    expect(layers[1]).toContain('SKILL-backend-patterns.md');
  });

  it('returns core + patterns + examples for newPattern task', () => {
    const layers = selectSkillLayers('backend', {
      simple: false,
      database: false,
      newPattern: true,
    });
    expect(layers).toHaveLength(3);
    expect(layers[0]).toContain('SKILL-backend-core.md');
    expect(layers[1]).toContain('SKILL-backend-patterns.md');
    expect(layers[2]).toContain('SKILL-backend-examples.md');
  });

  it('returns core + patterns for non-simple, non-database, non-newPattern', () => {
    const layers = selectSkillLayers('frontend', {
      simple: false,
      database: false,
      newPattern: false,
    });
    expect(layers).toHaveLength(2);
    expect(layers[0]).toContain('SKILL-frontend-core.md');
    expect(layers[1]).toContain('SKILL-frontend-patterns.md');
  });
});

// =============================================================================
// estimateTokens
// =============================================================================

describe('estimateTokens', () => {
  it('returns ceil(length / 4)', () => {
    // 10 chars → ceil(10/4) = 3
    expect(estimateTokens('abcdefghij')).toBe(3);
    // 8 chars → ceil(8/4) = 2
    expect(estimateTokens('12345678')).toBe(2);
    // 9 chars → ceil(9/4) = 3
    expect(estimateTokens('123456789')).toBe(3);
  });

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

// =============================================================================
// detectOrchestratorAction
// =============================================================================

describe('detectOrchestratorAction', () => {
  it('detects kickoff from "kickoff"', () => {
    expect(detectOrchestratorAction('Kickoff the new project')).toBe('kickoff');
  });

  it('detects kickoff from "start project"', () => {
    expect(detectOrchestratorAction('Start project for the client')).toBe('kickoff');
  });

  it('detects kickoff from "new project"', () => {
    expect(detectOrchestratorAction('Create a new project scope')).toBe('kickoff');
  });

  it('detects decompose from "decompose"', () => {
    expect(detectOrchestratorAction('Decompose the feature into subtasks')).toBe('decompose');
  });

  it('detects decompose from "break down"', () => {
    expect(detectOrchestratorAction('Break down the epic into tasks')).toBe('decompose');
  });

  it('detects decompose from "plan"', () => {
    expect(detectOrchestratorAction('Plan the implementation steps')).toBe('decompose');
  });

  it('detects promote from "promote"', () => {
    expect(detectOrchestratorAction('Promote build to staging')).toBe('promote');
  });

  it('detects promote from "deploy"', () => {
    expect(detectOrchestratorAction('Deploy the latest release')).toBe('promote');
  });

  it('detects review from "review"', () => {
    expect(detectOrchestratorAction('Review the backend output')).toBe('review');
  });

  it('detects review from "verify"', () => {
    expect(detectOrchestratorAction('Verify task completion')).toBe('review');
  });

  it('detects review from "complete task"', () => {
    expect(detectOrchestratorAction('Complete task 42')).toBe('review');
  });

  it('detects question from "question"', () => {
    expect(detectOrchestratorAction('Handle the question from human')).toBe('question');
  });

  it('detects question from "answer"', () => {
    expect(detectOrchestratorAction('Answer the blocking question')).toBe('question');
  });

  it('defaults to assign when no keywords match', () => {
    expect(detectOrchestratorAction('Do something generic')).toBe('assign');
  });
});

// =============================================================================
// selectOrchestratorLayers
// =============================================================================

describe('selectOrchestratorLayers', () => {
  it('returns core + assignment for assign action', () => {
    const layers = selectOrchestratorLayers('assign');
    expect(layers).toHaveLength(2);
    expect(layers[0]).toContain('SKILL-orchestrator-core.md');
    expect(layers[1]).toContain('SKILL-orchestrator-assignment.md');
  });

  it('returns core + assignment + examples for kickoff action', () => {
    const layers = selectOrchestratorLayers('kickoff');
    expect(layers).toHaveLength(3);
    expect(layers[0]).toContain('SKILL-orchestrator-core.md');
    expect(layers[1]).toContain('SKILL-orchestrator-assignment.md');
    expect(layers[2]).toContain('SKILL-orchestrator-examples.md');
  });

  it('returns core + quality for review action', () => {
    const layers = selectOrchestratorLayers('review');
    expect(layers).toHaveLength(2);
    expect(layers[0]).toContain('SKILL-orchestrator-core.md');
    expect(layers[1]).toContain('SKILL-orchestrator-quality.md');
  });

  it('returns core + assignment for decompose action', () => {
    const layers = selectOrchestratorLayers('decompose');
    expect(layers).toHaveLength(2);
    expect(layers[0]).toContain('SKILL-orchestrator-core.md');
    expect(layers[1]).toContain('SKILL-orchestrator-assignment.md');
  });

  it('returns core + quality for promote action', () => {
    const layers = selectOrchestratorLayers('promote');
    expect(layers).toHaveLength(2);
    expect(layers[0]).toContain('SKILL-orchestrator-core.md');
    expect(layers[1]).toContain('SKILL-orchestrator-quality.md');
  });

  it('returns core + assignment for question action', () => {
    const layers = selectOrchestratorLayers('question');
    expect(layers).toHaveLength(2);
    expect(layers[0]).toContain('SKILL-orchestrator-core.md');
    expect(layers[1]).toContain('SKILL-orchestrator-assignment.md');
  });
});

// =============================================================================
// loadSkillContent
// =============================================================================

describe('loadSkillContent', () => {
  it('combines common file + layer files with separator', async () => {
    mockedReadFile.mockImplementation(async (path: any) => {
      if (String(path).includes('SKILL-common.md')) return 'COMMON CONTENT';
      if (String(path).includes('core.md')) return 'CORE CONTENT';
      if (String(path).includes('patterns.md')) return 'PATTERNS CONTENT';
      throw new Error('File not found');
    });

    const result = await loadSkillContent(['/fake/core.md', '/fake/patterns.md']);
    expect(result).toContain('COMMON CONTENT');
    expect(result).toContain('CORE CONTENT');
    expect(result).toContain('PATTERNS CONTENT');
    expect(result).toContain('---');
  });

  it('handles missing common file gracefully', async () => {
    mockedReadFile.mockImplementation(async (path: any) => {
      if (String(path).includes('SKILL-common.md')) throw new Error('ENOENT');
      if (String(path).includes('core.md')) return 'CORE ONLY';
      throw new Error('File not found');
    });

    const result = await loadSkillContent(['/fake/core.md']);
    expect(result).toContain('CORE ONLY');
    // Common is missing so it should not appear
    expect(result).not.toContain('COMMON');
  });

  it('returns empty string for missing layer file', async () => {
    mockedReadFile.mockImplementation(async (path: any) => {
      if (String(path).includes('SKILL-common.md')) return 'COMMON';
      throw new Error('ENOENT');
    });

    const result = await loadSkillContent(['/fake/missing.md']);
    // Should still have common content, missing layer contributes nothing
    expect(result).toContain('COMMON');
    // The empty string from the missing layer gets filtered by .filter(Boolean)
    expect(result).not.toContain('missing');
  });

  it('returns just common content when layers array is empty', async () => {
    mockedReadFile.mockImplementation(async (path: any) => {
      if (String(path).includes('SKILL-common.md')) return 'COMMON ONLY';
      throw new Error('ENOENT');
    });

    const result = await loadSkillContent([]);
    expect(result).toBe('COMMON ONLY');
  });
});

// =============================================================================
// loadSkillsForTask (integration of classify + select + load)
// =============================================================================

describe('loadSkillsForTask', () => {
  it('returns content, complexity, layers, and token count', async () => {
    mockedReadFile.mockImplementation(async (path: any) => {
      if (String(path).includes('SKILL-common.md')) return 'C';
      if (String(path).includes('core.md')) return 'CORE';
      return '';
    });

    const result = await loadSkillsForTask('backend', 'Fix a bug in the endpoint');
    expect(result.complexity.simple).toBe(true);
    expect(result.layers).toHaveLength(1);
    expect(result.content).toBeTruthy();
    expect(result.tokens).toBeGreaterThan(0);
  });

  it('loads more layers for complex tasks', async () => {
    mockedReadFile.mockImplementation(async () => 'content');

    const result = await loadSkillsForTask('backend', 'Add auth with websocket and database schema');
    expect(result.complexity.database).toBe(true);
    expect(result.complexity.newPattern).toBe(true);
    // core + patterns + examples = 3 layers
    expect(result.layers).toHaveLength(3);
  });
});

// =============================================================================
// loadSkillsForOrchestrator (integration of detect + select + load)
// =============================================================================

describe('loadSkillsForOrchestrator', () => {
  it('returns action, content, layers, and token count', async () => {
    mockedReadFile.mockImplementation(async () => 'skill content');

    const result = await loadSkillsForOrchestrator('Kickoff the new project');
    expect(result.action).toBe('kickoff');
    // kickoff = core + assignment + examples
    expect(result.layers).toHaveLength(3);
    expect(result.content).toBeTruthy();
    expect(result.tokens).toBeGreaterThan(0);
  });

  it('defaults to assign for generic description', async () => {
    mockedReadFile.mockImplementation(async () => 'data');

    const result = await loadSkillsForOrchestrator('Handle this task');
    expect(result.action).toBe('assign');
    expect(result.layers).toHaveLength(2);
  });
});
