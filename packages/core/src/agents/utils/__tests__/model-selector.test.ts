import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { selectOrchestratorModel, selectArchitectModel } from '../model-selector';

describe('model-selector', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.stubEnv('ORCHESTRATOR_MODEL_TIER', '');
    vi.stubEnv('ARCHITECT_MODEL_TIER', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('selectOrchestratorModel', () => {
    it('returns Opus for first run with no context', () => {
      const model = selectOrchestratorModel({
        hasAnsweredQuestions: false,
        isFirstRun: true,
      });
      expect(model).toBe('claude-opus-4-6');
    });

    it('returns Sonnet for re-run after answered questions', () => {
      const model = selectOrchestratorModel({
        hasAnsweredQuestions: true,
        isFirstRun: false,
      });
      expect(model).toBe('claude-sonnet-4-5-20250929');
    });

    it('returns Opus for first run even with answered questions', () => {
      const model = selectOrchestratorModel({
        hasAnsweredQuestions: true,
        isFirstRun: true,
      });
      expect(model).toBe('claude-opus-4-6');
    });

    it('returns Sonnet for simple scope (5 or fewer tasks)', () => {
      const model = selectOrchestratorModel({
        hasAnsweredQuestions: false,
        isFirstRun: true,
        estimatedTaskCount: 3,
      });
      expect(model).toBe('claude-sonnet-4-5-20250929');
    });

    it('returns Opus for complex scope (>5 tasks)', () => {
      const model = selectOrchestratorModel({
        hasAnsweredQuestions: false,
        isFirstRun: true,
        estimatedTaskCount: 10,
      });
      expect(model).toBe('claude-opus-4-6');
    });

    it('respects env override to opus', () => {
      vi.stubEnv('ORCHESTRATOR_MODEL_TIER', 'opus');
      const model = selectOrchestratorModel({
        hasAnsweredQuestions: true,
        isFirstRun: false,
      });
      expect(model).toBe('claude-opus-4-6');
    });

    it('respects env override to sonnet', () => {
      vi.stubEnv('ORCHESTRATOR_MODEL_TIER', 'sonnet');
      const model = selectOrchestratorModel({
        hasAnsweredQuestions: false,
        isFirstRun: true,
      });
      expect(model).toBe('claude-sonnet-4-5-20250929');
    });
  });

  describe('selectArchitectModel', () => {
    it('returns Opus for full-feature with 3+ deps', () => {
      expect(selectArchitectModel('full-feature', 3)).toBe('claude-opus-4-6');
      expect(selectArchitectModel('full-feature', 5)).toBe('claude-opus-4-6');
    });

    it('returns Sonnet for full-feature with <3 deps', () => {
      expect(selectArchitectModel('full-feature', 2)).toBe('claude-sonnet-4-5-20250929');
      expect(selectArchitectModel('full-feature', 0)).toBe('claude-sonnet-4-5-20250929');
    });

    it('returns Sonnet for database-task', () => {
      expect(selectArchitectModel('database-task', 5)).toBe('claude-sonnet-4-5-20250929');
    });

    it('returns Sonnet for simple profiles', () => {
      expect(selectArchitectModel('simple-endpoint', 0)).toBe('claude-sonnet-4-5-20250929');
      expect(selectArchitectModel('bug-fix', 0)).toBe('claude-sonnet-4-5-20250929');
    });

    it('respects env override to opus', () => {
      vi.stubEnv('ARCHITECT_MODEL_TIER', 'opus');
      expect(selectArchitectModel('simple-endpoint', 0)).toBe('claude-opus-4-6');
    });

    it('respects env override to sonnet', () => {
      vi.stubEnv('ARCHITECT_MODEL_TIER', 'sonnet');
      expect(selectArchitectModel('full-feature', 5)).toBe('claude-sonnet-4-5-20250929');
    });
  });
});
