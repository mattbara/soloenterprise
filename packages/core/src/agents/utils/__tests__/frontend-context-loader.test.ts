/**
 * Tests for frontend context loader.
 *
 * Validates:
 * - API pattern loading and fallback conventions
 * - Dynamic hook directory scanning
 * - Profile-based content filtering (includeApiPatterns on/off)
 * - apiPatternsLoaded metric tracking
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockReadFile = vi.hoisted(() => vi.fn());
const mockReaddir = vi.hoisted(() => vi.fn());

vi.mock('fs/promises', () => ({
  readFile: mockReadFile,
  readdir: mockReaddir,
}));

// Mock frontend-context-profiles to control profile selection
vi.mock('../frontend-context-profiles', () => ({
  selectFrontendContextProfile: vi.fn().mockReturnValue('api-consumer'),
  getFrontendContextConfig: vi.fn().mockImplementation((profile: string) => {
    const configs: Record<string, unknown> = {
      'api-consumer': {
        includeComponentExamples: true,
        includeHookExamples: true,
        includeFormPatterns: false,
        includeApiPatterns: true,
        maxExamples: 2,
      },
      'simple-component': {
        includeComponentExamples: true,
        includeHookExamples: false,
        includeFormPatterns: false,
        includeApiPatterns: false,
        maxExamples: 1,
      },
      'full-feature': {
        includeComponentExamples: true,
        includeHookExamples: true,
        includeFormPatterns: true,
        includeApiPatterns: true,
        maxExamples: 2,
      },
      'bug-fix': {
        includeComponentExamples: false,
        includeHookExamples: false,
        includeFormPatterns: false,
        includeApiPatterns: false,
        maxExamples: 0,
      },
    };
    const config = configs[profile] ?? configs['simple-component'];
    return { ...(config as Record<string, unknown>) };
  }),
}));

import {
  buildFrontendContextWithProfile,
  loadFrontendCodebaseContext,
  clearFrontendContextCache,
} from '../frontend-context-loader';
import { selectFrontendContextProfile } from '../frontend-context-profiles';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  clearFrontendContextCache();
  mockReadFile.mockReset();
  mockReaddir.mockReset();

  // Default: no files exist
  mockReadFile.mockRejectedValue(new Error('ENOENT'));
  mockReaddir.mockRejectedValue(new Error('ENOENT'));
});

describe('loadFrontendCodebaseContext', () => {
  it('returns empty arrays when no files exist', async () => {
    const ctx = await loadFrontendCodebaseContext();
    expect(ctx.componentExamples).toEqual([]);
    expect(ctx.hookExamples).toEqual([]);
    expect(ctx.apiPatterns).toEqual([]);
  });

  it('discovers hooks dynamically from src/hooks/', async () => {
    mockReaddir.mockResolvedValueOnce(['use-auth.ts', 'use-theme.tsx', 'use-auth.test.ts', 'readme.md']);
    mockReadFile.mockImplementation(async (path: string) => {
      if (path.includes('use-auth.ts')) return 'export function useAuth() {}';
      if (path.includes('use-theme.tsx')) return 'export function useTheme() {}';
      throw new Error('ENOENT');
    });

    const ctx = await loadFrontendCodebaseContext();
    expect(ctx.hookExamples).toHaveLength(2);
    expect(ctx.hookExamples[0].path).toBe('src/hooks/use-auth.ts');
    expect(ctx.hookExamples[1].path).toBe('src/hooks/use-theme.tsx');
  });

  it('filters out test files from hook discovery', async () => {
    mockReaddir.mockResolvedValueOnce(['use-data.ts', 'use-data.test.ts', 'use-data.test.tsx']);
    mockReadFile.mockImplementation(async (path: string) => {
      if (path.includes('use-data.ts') && !path.includes('.test.')) return 'export function useData() {}';
      throw new Error('ENOENT');
    });

    const ctx = await loadFrontendCodebaseContext();
    expect(ctx.hookExamples).toHaveLength(1);
    expect(ctx.hookExamples[0].path).toBe('src/hooks/use-data.ts');
  });

  it('loads API pattern files when they exist', async () => {
    mockReadFile.mockImplementation(async (path: string) => {
      if (path.includes('query-client.ts')) return 'export const queryClient = new QueryClient();';
      if (path.includes('src/lib/api.ts')) return 'export async function apiFetch() {}';
      throw new Error('ENOENT');
    });

    const ctx = await loadFrontendCodebaseContext();
    expect(ctx.apiPatterns).toHaveLength(2);
    expect(ctx.apiPatterns[0].path).toBe('src/lib/query-client.ts');
    expect(ctx.apiPatterns[1].path).toBe('src/lib/api.ts');
  });

  it('skips gracefully when hooks directory does not exist', async () => {
    // readdir already rejects by default (ENOENT)
    const ctx = await loadFrontendCodebaseContext();
    expect(ctx.hookExamples).toEqual([]);
  });
});

describe('buildFrontendContextWithProfile', () => {
  describe('api-consumer profile', () => {
    it('injects fallback conventions when no project API files found', async () => {
      const result = await buildFrontendContextWithProfile(
        'Build a data table that fetches users from API',
        'api-consumer'
      );

      expect(result.profile).toBe('api-consumer');
      expect(result.apiPatternsLoaded).toBe(-1); // Sentinel for fallback
      expect(result.content).toContain('Data Fetching Conventions');
      expect(result.content).toContain('TanStack Query');
      expect(result.content).toContain('Server Component');
      expect(result.content).toContain('useActionState');
      expect(result.content).toContain('useOptimistic');
      expect(result.content).toContain('docs/ANTIPATTERNS.md');
    });

    it('loads real API pattern files when they exist', async () => {
      mockReadFile.mockImplementation(async (path: string) => {
        if (path.includes('query-client.ts')) return 'export const queryClient = new QueryClient();';
        throw new Error('ENOENT');
      });

      const result = await buildFrontendContextWithProfile(
        'Build a data table with API',
        'api-consumer'
      );

      expect(result.apiPatternsLoaded).toBe(1);
      expect(result.content).toContain('query-client.ts');
      expect(result.content).toContain('QueryClient');
    });

    it('returns non-empty content even with zero project files', async () => {
      const result = await buildFrontendContextWithProfile(
        'Fetch data from API endpoint',
        'api-consumer'
      );

      expect(result.content.length).toBeGreaterThan(100);
      expect(result.tokens).toBeGreaterThan(0);
    });
  });

  describe('simple-component profile', () => {
    it('does NOT include API conventions', async () => {
      const result = await buildFrontendContextWithProfile(
        'Create a simple button component',
        'simple-component'
      );

      expect(result.profile).toBe('simple-component');
      expect(result.apiPatternsLoaded).toBe(0);
      expect(result.content).not.toContain('Data Fetching Conventions');
      expect(result.content).not.toContain('TanStack Query');
    });
  });

  describe('full-feature profile', () => {
    it('injects fallback conventions when no files found', async () => {
      const result = await buildFrontendContextWithProfile(
        'Implement complete user management feature',
        'full-feature'
      );

      expect(result.profile).toBe('full-feature');
      expect(result.apiPatternsLoaded).toBe(-1);
      expect(result.content).toContain('Data Fetching Conventions');
    });
  });

  describe('bug-fix profile', () => {
    it('returns minimal content with no API patterns', async () => {
      const result = await buildFrontendContextWithProfile(
        'Fix broken layout in header',
        'bug-fix'
      );

      expect(result.profile).toBe('bug-fix');
      expect(result.apiPatternsLoaded).toBe(0);
      expect(result.content).not.toContain('Data Fetching Conventions');
    });
  });

  describe('apiPatternsLoaded metric', () => {
    it('is 0 when includeApiPatterns is false', async () => {
      const result = await buildFrontendContextWithProfile('simple button', 'simple-component');
      expect(result.apiPatternsLoaded).toBe(0);
    });

    it('is -1 when fallback conventions are injected', async () => {
      const result = await buildFrontendContextWithProfile('fetch users', 'api-consumer');
      expect(result.apiPatternsLoaded).toBe(-1);
    });

    it('is positive when real files are loaded', async () => {
      mockReadFile.mockImplementation(async (path: string) => {
        if (path.includes('query-client.ts')) return 'const qc = 1;';
        if (path.includes('src/lib/api.ts')) return 'const api = 2;';
        throw new Error('ENOENT');
      });

      const result = await buildFrontendContextWithProfile('data table', 'api-consumer');
      expect(result.apiPatternsLoaded).toBe(2);
    });
  });

  describe('profile selection integration', () => {
    it('uses selectFrontendContextProfile when no override given', async () => {
      vi.mocked(selectFrontendContextProfile).mockReturnValueOnce('api-consumer');

      const result = await buildFrontendContextWithProfile('Fetch data from API');
      expect(selectFrontendContextProfile).toHaveBeenCalledWith('Fetch data from API');
      expect(result.profile).toBe('api-consumer');
    });

    it('skips profile selection when override provided', async () => {
      vi.mocked(selectFrontendContextProfile).mockClear();

      const result = await buildFrontendContextWithProfile('anything', 'bug-fix');
      expect(selectFrontendContextProfile).not.toHaveBeenCalled();
      expect(result.profile).toBe('bug-fix');
    });
  });
});
