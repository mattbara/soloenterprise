/**
 * Tests for frontend context profile selection logic.
 *
 * Validates that selectFrontendContextProfile() correctly assigns profiles
 * with override + negative signal support to prevent false positives.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  selectFrontendContextProfile,
  FRONTEND_PROFILE_OVERRIDES,
  FRONTEND_NEGATIVE_SIGNALS,
  FRONTEND_CONTEXT_PROFILES,
  getFrontendContextConfig,
  estimateFrontendTokenSavings,
} from '../frontend-context-profiles';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('selectFrontendContextProfile', () => {
  // ==========================================================================
  // PASS 1: Override tests
  // ==========================================================================

  describe('overrides (Pass 1)', () => {
    it('component library → simple-component (NOT stateful)', () => {
      expect(
        selectFrontendContextProfile('Shared UI component library and design system')
      ).toBe('simple-component');
    });

    it('design system → simple-component', () => {
      expect(
        selectFrontendContextProfile('Build the design system with Button, Input, Card, Modal')
      ).toBe('simple-component');
    });

    it('ui kit → simple-component', () => {
      expect(selectFrontendContextProfile('Create the UI kit with reusable components')).toBe(
        'simple-component'
      );
    });

    it('reusable components → simple-component', () => {
      expect(
        selectFrontendContextProfile('Build reusable components for the dashboard')
      ).toBe('simple-component');
    });

    it('base components → simple-component', () => {
      expect(selectFrontendContextProfile('Create base components for forms and modals')).toBe(
        'simple-component'
      );
    });

    it('scaffolding → simple-component', () => {
      expect(selectFrontendContextProfile('Scaffold the frontend application')).toBe(
        'simple-component'
      );
    });

    it('boilerplate → simple-component', () => {
      expect(selectFrontendContextProfile('Generate React boilerplate')).toBe('simple-component');
    });

    it('project setup → simple-component', () => {
      expect(selectFrontendContextProfile('Project setup for the frontend')).toBe(
        'simple-component'
      );
    });

    it('tailwind config → simple-component', () => {
      expect(selectFrontendContextProfile('Set up tailwind config with custom theme')).toBe(
        'simple-component'
      );
    });

    it('storybook → simple-component', () => {
      expect(selectFrontendContextProfile('Configure storybook for the component library')).toBe(
        'simple-component'
      );
    });

    it('hotfix → bug-fix (override)', () => {
      expect(selectFrontendContextProfile('Hotfix for broken modal z-index')).toBe('bug-fix');
    });

    it('regression → bug-fix (override)', () => {
      expect(selectFrontendContextProfile('Fix regression in dropdown positioning')).toBe(
        'bug-fix'
      );
    });

    it('revert → bug-fix (override)', () => {
      expect(selectFrontendContextProfile('Revert the sidebar changes')).toBe('bug-fix');
    });

    it('override exports are accessible', () => {
      expect(FRONTEND_PROFILE_OVERRIDES.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // PASS 3: Negative signal tests
  // ==========================================================================

  describe('negative signals (Pass 3)', () => {
    it('modal + library → demoted from stateful to simple-component', () => {
      // "modal" triggers stateful-component, but "library" demotes it
      expect(
        selectFrontendContextProfile('Create modal primitives for the shared library')
      ).toBe('simple-component');
    });

    it('data + design system → demoted from api-consumer to simple-component', () => {
      // "data" triggers api-consumer, but "design system" demotes it
      expect(
        selectFrontendContextProfile('Build data display primitives for the design system')
      ).toBe('simple-component');
    });

    it('negative signals export is accessible', () => {
      expect(FRONTEND_NEGATIVE_SIGNALS['stateful-component']).toBeDefined();
      expect(FRONTEND_NEGATIVE_SIGNALS['stateful-component']!.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Positive matching (existing behavior preserved)
  // ==========================================================================

  describe('api-consumer', () => {
    it('fetch → api-consumer', () => {
      expect(selectFrontendContextProfile('Fetch user data and display in table')).toBe(
        'api-consumer'
      );
    });

    it('tanstack → api-consumer', () => {
      expect(selectFrontendContextProfile('Use TanStack Query to load bookings')).toBe(
        'api-consumer'
      );
    });

    it('api + endpoint → api-consumer', () => {
      expect(selectFrontendContextProfile('Call API endpoint to get user profile')).toBe(
        'api-consumer'
      );
    });
  });

  describe('form-component', () => {
    it('form → form-component', () => {
      expect(selectFrontendContextProfile('Build the booking form')).toBe('form-component');
    });

    it('validation → form-component', () => {
      expect(selectFrontendContextProfile('Add validation to the signup page')).toBe(
        'form-component'
      );
    });
  });

  describe('bug-fix', () => {
    it('fix bug → bug-fix', () => {
      expect(selectFrontendContextProfile('Fix bug in the sidebar component')).toBe('bug-fix');
    });

    it('broken → bug-fix', () => {
      expect(selectFrontendContextProfile('Fix the broken layout on mobile')).toBe('bug-fix');
    });
  });

  describe('full-feature', () => {
    it('implement + feature → full-feature', () => {
      expect(
        selectFrontendContextProfile('Implement the booking management feature')
      ).toBe('full-feature');
    });

    it('create + page → full-feature', () => {
      expect(selectFrontendContextProfile('Create the settings page')).toBe('full-feature');
    });
  });

  describe('stateful-component', () => {
    it('modal → stateful-component', () => {
      expect(selectFrontendContextProfile('Build the confirmation modal')).toBe(
        'stateful-component'
      );
    });

    it('dropdown → stateful-component', () => {
      expect(selectFrontendContextProfile('Create a searchable dropdown')).toBe(
        'stateful-component'
      );
    });

    it('toggle → stateful-component', () => {
      expect(selectFrontendContextProfile('Add a toggle for dark mode')).toBe(
        'stateful-component'
      );
    });
  });

  describe('simple-component (default)', () => {
    it('defaults to simple-component when no signals', () => {
      expect(selectFrontendContextProfile('Build a card layout')).toBe('simple-component');
    });
  });

  // ==========================================================================
  // REGRESSION TESTS
  // ==========================================================================

  describe('regression tests', () => {
    const cases: [string, string][] = [
      // [description, expectedProfile]
      ['Shared UI component library and design system', 'simple-component'],
      ['Build the design system with Button, Input, Card, Modal', 'simple-component'],
      ['Create reusable components for the app', 'simple-component'],
      ['Build the booking form with date picker', 'form-component'],
      ['Fetch bookings from the API', 'api-consumer'],
      ['Fix broken layout on mobile devices', 'bug-fix'],
      ['Implement the user dashboard feature', 'full-feature'],
      ['Build a searchable dropdown component', 'stateful-component'],
      ['Scaffold the frontend app', 'simple-component'],
      ['Hotfix for z-index stacking issue', 'bug-fix'],
      ['Revert the header changes', 'bug-fix'],
    ];

    it.each(cases)('"%s" → %s', (description, expected) => {
      expect(selectFrontendContextProfile(description)).toBe(expected);
    });
  });
});

// ============================================================================
// Config and utility functions
// ============================================================================

describe('FRONTEND_CONTEXT_PROFILES', () => {
  it('simple-component excludes hooks and patterns', () => {
    const cfg = FRONTEND_CONTEXT_PROFILES['simple-component'];
    expect(cfg.includeHookExamples).toBe(false);
    expect(cfg.includeFormPatterns).toBe(false);
    expect(cfg.includeApiPatterns).toBe(false);
    expect(cfg.maxExamples).toBe(1);
  });

  it('full-feature includes everything', () => {
    const cfg = FRONTEND_CONTEXT_PROFILES['full-feature'];
    expect(cfg.includeComponentExamples).toBe(true);
    expect(cfg.includeHookExamples).toBe(true);
    expect(cfg.includeFormPatterns).toBe(true);
    expect(cfg.includeApiPatterns).toBe(true);
  });

  it('bug-fix excludes all context', () => {
    const cfg = FRONTEND_CONTEXT_PROFILES['bug-fix'];
    expect(cfg.includeComponentExamples).toBe(false);
    expect(cfg.maxExamples).toBe(0);
  });
});

describe('getFrontendContextConfig', () => {
  it('returns a copy of the config', () => {
    const cfg = getFrontendContextConfig('simple-component');
    expect(cfg.includeComponentExamples).toBe(true);
    expect(cfg.maxExamples).toBe(1);
  });
});

describe('estimateFrontendTokenSavings', () => {
  it('bug-fix saves 60%', () => {
    expect(estimateFrontendTokenSavings('bug-fix')).toBe(0.6);
  });

  it('simple-component saves 35%', () => {
    expect(estimateFrontendTokenSavings('simple-component')).toBe(0.35);
  });

  it('full-feature saves 0%', () => {
    expect(estimateFrontendTokenSavings('full-feature')).toBe(0);
  });
});
