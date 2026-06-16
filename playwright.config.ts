import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  fullyParallel: false,
  retries: 0,
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:5843',
    trace: 'on-first-retry',
  },
  projects: [
    // Real-backend projects
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'smoke',
      testDir: './e2e/smoke',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'flows',
      testDir: './e2e/flows',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    // Mocked layer — runs independently, no storageState, no backend needed
    {
      name: 'mocked',
      testMatch: /e2e\/checkout\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'docker compose -f docker-compose.yml -f docker-compose.dev.yml up',
    url: 'http://localhost:5843',
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
