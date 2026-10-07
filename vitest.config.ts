import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/shared', 'apps/server'],
    coverage: {
      provider: 'v8',
      include: ['packages/shared/src/**/*.ts', 'apps/server/src/**/*.ts'],
      exclude: ['**/*.test.ts'],
    },
  },
});
