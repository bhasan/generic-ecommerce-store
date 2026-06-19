import { expect, test } from '@playwright/test';
import { liveEnv } from '../helpers/env';

test.describe('health and public API @smoke @health @api-core', () => {
  test('health endpoint returns healthy database status', async ({ request }) => {
    const response = await request.get(`${liveEnv.apiBaseUrl}/health`);
    expect(response.status()).toBe(200);
    const json = await response.json();
    expect(json.status).toBe('ok');
    expect(json.checks?.database).toBe('ok');
  });

  test('public config and catalog endpoints return controlled responses', async ({ request }) => {
    for (const pathName of ['/config', '/products', '/categories']) {
      const response = await request.get(`${liveEnv.apiBaseUrl}${pathName}`);
      expect(response.status(), pathName).toBe(200);
      const contentType = response.headers()['content-type'] || '';
      expect(contentType, pathName).toContain('application/json');
    }
  });
});
