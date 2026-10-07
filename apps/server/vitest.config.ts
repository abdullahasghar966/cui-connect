import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'server',
    include: ['test/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['test/globalSetup.ts'],
    testTimeout: 30_000,
    hookTimeout: 180_000,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      JWT_SECRET: 'integration-test-secret-that-is-long-enough-123',
      AUTO_SEED: 'false',
      LOGIN_RATE_LIMIT: '1000',
      MESSAGE_BURST: '5',
      MESSAGE_RATE_PER_SEC: '1',
    },
  },
});
