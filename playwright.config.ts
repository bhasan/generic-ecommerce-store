import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  fullyParallel: false,
  // Serialize across files (workers: 1), not just within a file. Several flows
  // (stock-race, multi-store-customer, admin-multi-store) create a transient
  // second store in the SHARED default tenant. With multi-store live, any store
  // that briefly exists makes the customer store-picker modal gate EVERY other
  // browser flow — so a store-mutating spec running on a parallel worker would
  // fail unrelated concurrent specs. One worker removes that cross-file race.
  // (If CI wall-clock becomes a problem, the alternative is to isolate the
  // store-mutating specs into their own Playwright project that the browser
  // projects `dependencies: [...]` on, so they run in a separate phase.)
  workers: 1,
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
