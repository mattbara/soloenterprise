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
  readdir: vi.fn(),
}));

import { readFile, readdir } from 'fs/promises';
import {
  classifyTaskComplexity,
  selectSkillLayers,
  loadSkillContent,
  estimateTokens,
  detectOrchestratorAction,
  selectOrchestratorLayers,
  loadSkillsForTask,
  loadSkillsForOrchestrator,
  parseLoadWhenHeader,
  matchesLoadCondition,
  discoverSpecializedSkills,
  discoverCommonSkills,
} from '../skill-loader';

const mockedReadFile = vi.mocked(readFile);
const mockedReaddir = vi.mocked(readdir);

// Suppress console output
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  mockedReadFile.mockReset();
  mockedReaddir.mockReset();
  // Default: no specialized files in directories
  mockedReaddir.mockResolvedValue([]);
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

// =============================================================================
// parseLoadWhenHeader
// =============================================================================

describe('parseLoadWhenHeader', () => {
  it('parses single keyword', () => {
    const result = parseLoadWhenHeader('# Title\n<!-- Load When: always -->');
    expect(result).toEqual(['always']);
  });

  it('parses multiple comma-separated keywords', () => {
    const result = parseLoadWhenHeader('<!-- Load When: forms, auth, data display -->');
    expect(result).toEqual(['forms', 'auth', 'data display']);
  });

  it('is case-insensitive for the header tag', () => {
    const result = parseLoadWhenHeader('<!-- load when: Security -->');
    expect(result).toEqual(['security']);
  });

  it('trims whitespace around keywords', () => {
    const result = parseLoadWhenHeader('<!-- Load When:  route ,  page , layout  -->');
    expect(result).toEqual(['route', 'page', 'layout']);
  });

  it('returns null when no header found', () => {
    const result = parseLoadWhenHeader('# No header here\nJust content.');
    expect(result).toBeNull();
  });

  it('handles header with extra spaces around colons', () => {
    const result = parseLoadWhenHeader('<!--  Load When :  api, endpoint  -->');
    expect(result).toBeNull(); // colon must follow "Load When" directly
  });

  it('filters out empty strings from trailing commas', () => {
    const result = parseLoadWhenHeader('<!-- Load When: forms, auth, -->');
    expect(result).toEqual(['forms', 'auth']);
  });
});

// =============================================================================
// matchesLoadCondition
// =============================================================================

describe('matchesLoadCondition', () => {
  it('always matches for "always" keyword', () => {
    expect(matchesLoadCondition('any task at all', ['always'])).toBe(true);
  });

  it('matches when task contains keyword', () => {
    expect(matchesLoadCondition('Build a login form with auth', ['form', 'auth'])).toBe(true);
  });

  it('does not match when no keywords found in task', () => {
    expect(matchesLoadCondition('Add a health check endpoint', ['form', 'auth'])).toBe(false);
  });

  it('is case-insensitive on task description', () => {
    expect(matchesLoadCondition('Build a FORM component', ['form'])).toBe(true);
  });

  it('supports slash-separated alternatives (route/page/layout)', () => {
    expect(matchesLoadCondition('Create a new page for users', ['route/page/layout'])).toBe(true);
  });

  it('does not match slash alternatives when none present', () => {
    expect(matchesLoadCondition('Fix database query', ['route/page/layout'])).toBe(false);
  });

  it('matches multi-word keywords as substrings', () => {
    expect(matchesLoadCondition('Build a data display table', ['data display'])).toBe(true);
  });

  it('returns false for empty keywords array', () => {
    expect(matchesLoadCondition('any task', [])).toBe(false);
  });
});

// =============================================================================
// discoverSpecializedSkills
// =============================================================================

describe('discoverSpecializedSkills', () => {
  it('discovers files matching task description', async () => {
    mockedReaddir.mockResolvedValue([
      'SKILL-frontend-core.md',
      'SKILL-frontend-patterns.md',
      'SKILL-frontend-security.md',
      'SKILL-frontend-seo.md',
    ] as any);

    mockedReadFile.mockImplementation(async (path: any) => {
      const p = String(path);
      if (p.includes('security.md')) return '# Security\n<!-- Load When: form, auth, security -->';
      if (p.includes('seo.md')) return '# SEO\n<!-- Load When: page, landing -->';
      return '';
    });

    const result = await discoverSpecializedSkills('frontend', 'Build a login form with auth');
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('SKILL-frontend-security.md');
  });

  it('excludes core/patterns/examples from discovery', async () => {
    mockedReaddir.mockResolvedValue([
      'SKILL-frontend-core.md',
      'SKILL-frontend-patterns.md',
      'SKILL-frontend-examples.md',
      'SKILL-frontend-theming.md',
    ] as any);

    mockedReadFile.mockImplementation(async () => '<!-- Load When: always -->');

    const result = await discoverSpecializedSkills('frontend', 'any task');
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('SKILL-frontend-theming.md');
  });

  it('returns empty array when directory does not exist', async () => {
    mockedReaddir.mockRejectedValue(new Error('ENOENT'));
    const result = await discoverSpecializedSkills('nonexistent', 'any task');
    expect(result).toEqual([]);
  });

  it('returns empty array when no files match', async () => {
    mockedReaddir.mockResolvedValue([
      'SKILL-frontend-seo.md',
    ] as any);

    mockedReadFile.mockImplementation(async () => '<!-- Load When: page, landing -->');

    const result = await discoverSpecializedSkills('frontend', 'Fix database migration');
    expect(result).toEqual([]);
  });

  it('discovers multiple matching files', async () => {
    mockedReaddir.mockResolvedValue([
      'SKILL-frontend-accessibility.md',
      'SKILL-frontend-security.md',
      'SKILL-frontend-performance.md',
    ] as any);

    mockedReadFile.mockImplementation(async (path: any) => {
      const p = String(path);
      if (p.includes('accessibility.md')) return '<!-- Load When: component/page -->';
      if (p.includes('security.md')) return '<!-- Load When: form, auth -->';
      if (p.includes('performance.md')) return '<!-- Load When: component/page -->';
      return '';
    });

    const result = await discoverSpecializedSkills('frontend', 'Build a page component');
    expect(result).toHaveLength(2);
    expect(result[0]).toContain('SKILL-frontend-accessibility.md');
    expect(result[1]).toContain('SKILL-frontend-performance.md');
  });

  it('handles file with "always" keyword', async () => {
    mockedReaddir.mockResolvedValue([
      'SKILL-frontend-theming.md',
    ] as any);

    mockedReadFile.mockImplementation(async () => '<!-- Load When: always -->');

    const result = await discoverSpecializedSkills('frontend', 'literally anything');
    expect(result).toHaveLength(1);
  });

  it('skips files without Load When header', async () => {
    mockedReaddir.mockResolvedValue([
      'SKILL-frontend-theming.md',
    ] as any);

    mockedReadFile.mockImplementation(async () => '# Just a title\nNo header here.');

    const result = await discoverSpecializedSkills('frontend', 'any task');
    expect(result).toEqual([]);
  });

  it('ignores files that do not match agent prefix', async () => {
    mockedReaddir.mockResolvedValue([
      'SKILL-frontend-security.md',
      'SKILL-backend-security.md',  // wrong prefix
      'README.md',                   // not a SKILL file
    ] as any);

    mockedReadFile.mockImplementation(async () => '<!-- Load When: always -->');

    const result = await discoverSpecializedSkills('frontend', 'any task');
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('SKILL-frontend-security.md');
  });
});

// =============================================================================
// discoverCommonSkills
// =============================================================================

describe('discoverCommonSkills', () => {
  it('discovers common skill files matching task', async () => {
    mockedReaddir.mockResolvedValue([
      'SKILL-common.md',
      'SKILL-common-security.md',
    ] as any);

    mockedReadFile.mockImplementation(async () => '<!-- Load When: always -->');

    const result = await discoverCommonSkills('any task');
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('SKILL-common-security.md');
  });

  it('excludes main SKILL-common.md (already loaded separately)', async () => {
    mockedReaddir.mockResolvedValue([
      'SKILL-common.md',
    ] as any);

    const result = await discoverCommonSkills('any task');
    expect(result).toEqual([]);
  });

  it('returns empty when directory missing', async () => {
    mockedReaddir.mockRejectedValue(new Error('ENOENT'));
    const result = await discoverCommonSkills('any task');
    expect(result).toEqual([]);
  });

  it('filters by task description keywords', async () => {
    mockedReaddir.mockResolvedValue([
      'SKILL-common-security.md',
    ] as any);

    mockedReadFile.mockImplementation(async () => '<!-- Load When: auth, api, endpoint -->');

    expect(await discoverCommonSkills('Build an auth endpoint')).toHaveLength(1);
    expect(await discoverCommonSkills('Update documentation')).toHaveLength(0);
  });
});

// =============================================================================
// loadSkillsForTask with specialized skills
// =============================================================================

describe('loadSkillsForTask with specialized discovery', () => {
  it('includes specialized files in loaded layers', async () => {
    // readdir returns specialized files for the agent dir
    mockedReaddir.mockImplementation(async (path: any) => {
      const p = String(path);
      if (p.includes('/frontend')) {
        return ['SKILL-frontend-core.md', 'SKILL-frontend-security.md'] as any;
      }
      // common dir
      return ['SKILL-common.md', 'SKILL-common-security.md'] as any;
    });

    mockedReadFile.mockImplementation(async (path: any) => {
      const p = String(path);
      if (p.includes('SKILL-frontend-security.md')) return '<!-- Load When: form, auth -->\nSecurity content';
      if (p.includes('SKILL-common-security.md')) return '<!-- Load When: always -->\nCommon security';
      return 'generic content';
    });

    const result = await loadSkillsForTask('frontend', 'Build a login form with auth');
    // Should include standard layers + specialized
    const filenames = result.layers.map(l => l.split('/').pop());
    expect(filenames).toContain('SKILL-frontend-security.md');
    expect(filenames).toContain('SKILL-common-security.md');
  });

  it('does not include specialized files that do not match', async () => {
    mockedReaddir.mockImplementation(async (path: any) => {
      const p = String(path);
      if (p.includes('/backend')) {
        return ['SKILL-backend-core.md', 'SKILL-backend-security.md'] as any;
      }
      return [] as any;
    });

    mockedReadFile.mockImplementation(async (path: any) => {
      const p = String(path);
      if (p.includes('SKILL-backend-security.md')) return '<!-- Load When: auth, api -->';
      return 'content';
    });

    const result = await loadSkillsForTask('backend', 'Fix a bug in the endpoint');
    const filenames = result.layers.map(l => l.split('/').pop());
    expect(filenames).not.toContain('SKILL-backend-security.md');
  });
});
