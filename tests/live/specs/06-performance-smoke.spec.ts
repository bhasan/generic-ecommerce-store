import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { liveEnv } from '../helpers/env';

test.describe('performance smoke @performance', () => {
  test('hot public APIs stay under smoke latency threshold', async ({ request }) => {
    const thresholdMs = Number(process.env.SMOKE_STATION_PERF_THRESHOLD_MS || 2000);
    const endpoints = ['/health', '/config', '/products', '/categories'];
    const samples = [];

    for (const pathName of endpoints) {
      const started = Date.now();
      const response = await request.get(`${liveEnv.apiBaseUrl}${pathName}`);
      const durationMs = Date.now() - started;
      const body = await response.body();
      samples.push({ path: pathName, status: response.status(), durationMs, payloadBytes: body.length });

      expect(response.status(), pathName).toBeLessThan(500);
      expect(durationMs, pathName).toBeLessThan(thresholdMs);
    }

    fs.mkdirSync(liveEnv.reportsDir, { recursive: true });
    fs.writeFileSync(
      path.join(liveEnv.reportsDir, 'performance-smoke.json'),
      `${JSON.stringify({ generatedAt: new Date().toISOString(), thresholdMs, samples }, null, 2)}\n`,
    );
  });
});
