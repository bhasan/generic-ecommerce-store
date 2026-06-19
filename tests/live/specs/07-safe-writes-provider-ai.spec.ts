import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { authHeaders, loginViaApi } from '../helpers/auth';
import { hasPersona, liveEnv } from '../helpers/env';

test.describe('optional live gates', () => {
  test('safe write creates and resolves disposable contact message @safe-writes', async ({ request }) => {
    test.skip(!liveEnv.allowSafeWrites, 'Set SMOKE_STATION_ALLOW_SAFE_WRITES=true to run safe writes.');
    test.skip(!hasPersona('customer'), 'Customer live credentials are not configured.');
    test.skip(!hasPersona('manager'), 'Manager live credentials are required for cleanup/resolve.');

    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const customer = await loginViaApi(
      request,
      liveEnv.personas.customer.username!,
      liveEnv.personas.customer.password!,
    );
    const manager = await loginViaApi(
      request,
      liveEnv.personas.manager.username!,
      liveEnv.personas.manager.password!,
    );

    const create = await request.post(`${liveEnv.apiBaseUrl}/contact`, {
      headers: authHeaders(customer.token),
      data: {
        subject: 'Other',
        message: `LIVE_TEST contact verification ${stamp}. Disposable QA record; safe to resolve.`,
      },
    });
    expect(create.status()).toBe(200);
    const created = await create.json();
    expect(created.messageId).toBeTruthy();

    const cleanup = await request.patch(`${liveEnv.apiBaseUrl}/contact/messages/${created.messageId}/resolve`, {
      headers: authHeaders(manager.token),
    });
    expect(cleanup.status()).toBeLessThan(500);
    expect([200, 204, 400, 403, 404]).toContain(cleanup.status());
  });

  test('provider live evidence remains opt-in and shape-only @provider-live', async ({ request }) => {
    test.skip(!liveEnv.allowProviderTests, 'Set SMOKE_STATION_ALLOW_PROVIDER_TESTS=true to run provider live checks.');
    test.skip(!hasPersona('customer'), 'Customer live credentials are not configured.');

    const { token } = await loginViaApi(
      request,
      liveEnv.personas.customer.username!,
      liveEnv.personas.customer.password!,
    );
    const response = await request.post(`${liveEnv.apiBaseUrl}/orders/delivery-eligibility`, {
      headers: authHeaders(token),
      data: {
        deliveryAddress: {
          street: '123 Test Street',
          city: 'Houston',
          state: 'TX',
          zipCode: process.env.SMOKE_STATION_PROVIDER_TEST_ZIP || '77083',
        },
      },
    });
    expect(response.status()).toBeLessThan(500);

    const json = await response.json().catch(() => ({}));
    fs.mkdirSync(liveEnv.reportsDir, { recursive: true });
    fs.writeFileSync(
      path.join(liveEnv.reportsDir, 'provider-delivery-evidence.json'),
      `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        status: response.status(),
        keys: Object.keys(json),
        eligible: json.eligible,
        reason: json.reason,
        mode: json.mode || json.source || 'not-reported',
      }, null, 2)}\n`,
    );
  });

  test('AI live gate is not applicable until an AI integration exists @ai-live', async () => {
    test.skip(!liveEnv.allowAiTests, 'Set SMOKE_STATION_ALLOW_AI_TESTS=true to require live AI evidence.');
    test.skip(true, 'No AI/LLM integration was found in the current Smoke Station implementation.');
  });
});
