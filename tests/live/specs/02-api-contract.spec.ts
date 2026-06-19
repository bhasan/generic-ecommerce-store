import { expect, test } from '@playwright/test';
import { authHeaders, loginViaApi } from '../helpers/auth';
import { hasPersona, liveEnv } from '../helpers/env';

test.describe('API contract matrix @api-contract @api-core', () => {
  test('important public endpoints return JSON and no accidental 500s', async ({ request }) => {
    const endpoints = [
      '/health',
      '/config',
      '/products',
      '/categories',
      '/announcements',
    ];

    for (const pathName of endpoints) {
      const response = await request.get(`${liveEnv.apiBaseUrl}${pathName}`);
      expect(response.status(), pathName).toBeLessThan(500);
      expect([200, 204, 401, 403, 404], pathName).toContain(response.status());
      if (response.status() !== 204) {
        expect(response.headers()['content-type'] || '', pathName).toContain('application/json');
      }
    }
  });

  test('protected endpoints reject anonymous requests with controlled auth status', async ({ request }) => {
    for (const pathName of ['/users', '/orders', '/notifications']) {
      const response = await request.get(`${liveEnv.apiBaseUrl}${pathName}`);
      expect(response.status(), pathName).toBeGreaterThanOrEqual(401);
      expect(response.status(), pathName).toBeLessThan(500);
    }
  });

  test('authenticated customer can read profile and scoped orders', async ({ request }) => {
    test.skip(!hasPersona('customer'), 'Customer live credentials are not configured.');
    const { token } = await loginViaApi(
      request,
      liveEnv.personas.customer.username!,
      liveEnv.personas.customer.password!,
    );

    const profile = await request.get(`${liveEnv.apiBaseUrl}/auth/profile`, { headers: authHeaders(token) });
    expect(profile.status()).toBe(200);
    const profileJson = await profile.json();
    expect(profileJson.id || profileJson.user?.id).toBeTruthy();

    const orders = await request.get(`${liveEnv.apiBaseUrl}/orders`, { headers: authHeaders(token) });
    expect(orders.status()).toBe(200);
    expect(Array.isArray(await orders.json())).toBeTruthy();
  });
});
