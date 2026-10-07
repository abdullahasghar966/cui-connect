import { defineConfig, devices } from '@playwright/test';

const PORT = 4200;

/**
 * End-to-end tests run against the production build (`npm run build`) with its own embedded
 * MongoDB and a freshly seeded demo campus, so they never touch development data.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node apps/server/dist/index.mjs',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      API_PORT: String(PORT),
      EMBEDDED_MONGO_PORT: '27029',
      EMBEDDED_MONGO_DIR: '.data/mongo-e2e',
      MONGO_DB_NAME: 'cui_connect_e2e',
      SEED_ON_START: 'reset',
      LOG_LEVEL: 'warn',
      NODE_ENV: 'production',
      LOGIN_RATE_LIMIT: '1000',
    },
  },
});
