import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    exclude: ['**/generated/**', '**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/__tests__/**',
        'src/**/index.ts',
        'src/worker.ts',
        // Agent entry points are integration-heavy (Anthropic API calls)
        'src/agents/orchestrator-agent.ts',
        'src/agents/backend-agent.ts',
        'src/agents/frontend-agent.ts',
        'src/agents/qa-agent.ts',
        'src/agents/echo-agent.ts',
        // Context loaders are file-system heavy with minimal logic
        'src/agents/utils/context-loader.ts',
        'src/agents/utils/orchestrator-context-loader.ts',
        'src/agents/utils/frontend-context-loader.ts',
        'src/agents/utils/frontend-context-profiles.ts',
        'src/agents/utils/qa-context-loader.ts',
        // Redis utilities — thin wrappers
        'src/utils/redis.ts',
        'src/utils/index.ts',
        // Cache helper — thin wrapper
        'src/agents/utils/cache-helper.ts',
        // Image requirement extractor — calls Anthropic API
        'src/agents/utils/image-requirement-extractor.ts',
        // Architect spec generator — calls Anthropic API
        'src/agents/utils/architect-spec-generator.ts',
      ],
      thresholds: {
        statements: 85,
        branches: 85,
        functions: 85,
        lines: 85,
      },
    },
  },
});
