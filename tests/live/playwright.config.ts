import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { liveEnv } from './helpers/env';

const specs = /.*\.spec\.ts/;

export default defineConfig({
  testDir: liveEnv.liveDir,
  timeout: liveEnv.timeoutMs,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  outputDir: path.join(liveEnv.liveDir, 'test-results'),
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(liveEnv.liveDir, 'playwright-report'), open: 'never' }],
    ['json', { outputFile: path.join(liveEnv.reportsDir, 'latest-results.json') }],
    [path.join(liveEnv.liveDir, 'live-summary-reporter.ts')],
  ],
  use: {
    baseURL: liveEnv.baseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: liveEnv.timeoutMs,
  },
  projects: [
    {
      name: 'local-desktop',
      testMatch: specs,
      grep: /@(smoke|health|api-core|api-contract|route-render|console|performance|auth-ui|session|workflow|math)/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } },
    },
    {
      name: 'local-mobile',
      testMatch: specs,
      grep: /@mobile/,
      use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 }, browserName: 'chromium' },
    },
    {
      name: 'live-smoke',
      testMatch: specs,
      grep: /@(smoke|health|api-core)/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } },
    },
    {
      name: 'live-core',
      testMatch: specs,
      grep: /@(api-contract|route-render|console|performance|auth-ui|session|workflow|math)/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } },
    },
    {
      name: 'live-security',
      testMatch: specs,
      grep: /@security/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } },
    },
    {
      name: 'live-mobile',
      testMatch: specs,
      grep: /@mobile/,
      use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 }, browserName: 'chromium' },
    },
    {
      name: 'live-performance',
      testMatch: specs,
      grep: /@performance/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } },
    },
    {
      name: 'live-safe-writes',
      testMatch: specs,
      grep: /@safe-writes/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } },
    },
    {
      name: 'live-provider',
      testMatch: specs,
      grep: /@provider-live/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } },
    },
    {
      name: 'live-ai',
      testMatch: specs,
      grep: /@ai-live/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } },
    },
  ],
});
