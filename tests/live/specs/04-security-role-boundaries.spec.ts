import { expect, test } from '@playwright/test';
import { authHeaders, loginViaApi } from '../helpers/auth';
import { hasPersona, liveEnv } from '../helpers/env';

test.describe('auth, role, and account boundaries @security', () => {
  test('admin and management APIs reject anonymous access without leaking 500s', async ({ request }) => {
    const endpoints = [
      '/users',
      '/users/pending',
      '/products/export-zip',
      '/orders/delivered',
      '/payment-settings',
      '/store-settings',
      '/print-jobs',
    ];

    for (const pathName of endpoints) {
      const response = await request.get(`${liveEnv.apiBaseUrl}${pathName}`);
      expect(response.status(), pathName).toBeGreaterThanOrEqual(401);
      expect(response.status(), pathName).toBeLessThan(500);
    }
  });

  test('customer cannot access management user list', async ({ request }) => {
    test.skip(!hasPersona('customer'), 'Customer live credentials are not configured.');
    const { token } = await loginViaApi(
      request,
      liveEnv.personas.customer.username!,
      liveEnv.personas.customer.password!,
    );

    const response = await request.get(`${liveEnv.apiBaseUrl}/users`, { headers: authHeaders(token) });
    expect([401, 403, 404]).toContain(response.status());
  });

  test('delivery driver cannot update non-delivery statuses through order status endpoint', async ({ request }) => {
    test.skip(!hasPersona('driver'), 'Delivery driver live credentials are not configured.');
    const { token } = await loginViaApi(
      request,
      liveEnv.personas.driver.username!,
      liveEnv.personas.driver.password!,
    );

    const response = await request.patch(`${liveEnv.apiBaseUrl}/orders/0/status`, {
      headers: authHeaders(token),
      data: { status: 'APPROVED' },
    });
    expect(response.status()).toBeLessThan(500);
    expect([400, 401, 403, 404]).toContain(response.status());
  });
});
