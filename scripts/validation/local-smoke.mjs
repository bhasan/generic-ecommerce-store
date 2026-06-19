#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import {
  addResult,
  fetchJson,
  hasFailures,
  markdownSummary,
  nowIso,
  repoRoot,
  writeJson,
  writeText,
} from './lib.mjs';

const apiBaseUrl = (process.env.SMOKE_STATION_API_BASE_URL || 'http://localhost:3000/api').replace(/\/$/, '');
const reportDir = path.join(repoRoot, 'build', 'smoke-report');
const results = [];

async function getCheck(name, pathName, expectedStatuses = [200], validator) {
  try {
    const response = await fetchJson(`${apiBaseUrl}${pathName}`);
    const statusOk = expectedStatuses.includes(response.status);
    const validation = validator ? validator(response) : { ok: true, summary: 'Shape accepted.' };
    addResult(
      results,
      name,
      statusOk && validation.ok ? 'PASS' : 'FAIL',
      `${pathName} returned ${response.status}. ${validation.summary}`,
      { requestId: response.requestId },
    );
  } catch (error) {
    addResult(results, name, 'FAIL', `${pathName} failed: ${error.message}.`);
  }
}

async function postCheck(name, pathName, body, expectedStatuses = [200], headers = {}, validator) {
  try {
    const response = await fetchJson(`${apiBaseUrl}${pathName}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    const statusOk = expectedStatuses.includes(response.status);
    const validation = validator ? validator(response) : { ok: true, summary: 'Shape accepted.' };
    addResult(
      results,
      name,
      statusOk && validation.ok ? 'PASS' : 'FAIL',
      `${pathName} returned ${response.status}. ${validation.summary}`,
      { requestId: response.requestId },
    );
    return response;
  } catch (error) {
    addResult(results, name, 'FAIL', `${pathName} failed: ${error.message}.`);
    return null;
  }
}

async function main() {
  await getCheck('health', '/health', [200], (response) => ({
    ok: response.json?.checks?.database === 'ok',
    summary: `database=${response.json?.checks?.database ?? 'unknown'}.`,
  }));

  await getCheck('public_config', '/config', [200], (response) => ({
    ok: Boolean(response.json),
    summary: 'Configuration JSON returned.',
  }));

  await getCheck('public_products', '/products', [200], (response) => ({
    ok: Array.isArray(response.json) || Array.isArray(response.json?.products),
    summary: 'Product listing returned an array-shaped payload.',
  }));

  await getCheck('public_categories', '/categories', [200], (response) => ({
    ok: Array.isArray(response.json) || Array.isArray(response.json?.categories),
    summary: 'Category listing returned an array-shaped payload.',
  }));

  await getCheck('protected_users_without_auth', '/users', [401, 403], () => ({
    ok: true,
    summary: 'Protected users endpoint rejected unauthenticated access with controlled status.',
  }));

  await postCheck(
    'delivery_eligibility_without_auth',
    '/orders/delivery-eligibility',
    {
      deliveryAddress: {
        street: '123 Test Street',
        city: 'Houston',
        state: 'TX',
        zipCode: '77083',
      },
    },
    [401, 403],
    {},
    () => ({ ok: true, summary: 'Protected delivery eligibility endpoint rejected unauthenticated access.' }),
  );

  const username = process.env.SMOKE_STATION_SMOKE_USERNAME;
  const password = process.env.SMOKE_STATION_SMOKE_PASSWORD;
  if (!username || !password) {
    addResult(
      results,
      'auth_login',
      'SKIP',
      'SMOKE_STATION_SMOKE_USERNAME and SMOKE_STATION_SMOKE_PASSWORD are not configured.',
    );
  } else {
    const login = await postCheck(
      'auth_login',
      '/auth/login',
      { username, password },
      [200],
      {},
      (response) => ({
        ok: Boolean(response.json?.token),
        summary: response.json?.token ? 'Login returned a token; token value was not recorded.' : 'Login response did not include a token.',
      }),
    );

    const token = login?.json?.token;
    if (token) {
      await getCheckWithAuth('auth_profile', '/auth/profile', token, [200], (response) => ({
        ok: Boolean(response.json?.id || response.json?.user?.id),
        summary: 'Authenticated profile returned user identity data.',
      }));
      await getCheckWithAuth('authenticated_orders', '/orders', token, [200], (response) => ({
        ok: Array.isArray(response.json) || Array.isArray(response.json?.orders),
        summary: 'Authenticated order listing returned array-shaped data.',
      }));
    }
  }

  const report = {
    generatedAt: nowIso(),
    status: hasFailures(results) ? 'FAIL' : 'PASS',
    apiBaseUrl,
    results,
  };

  writeJson(path.join(reportDir, 'summary.json'), report);
  writeText(path.join(reportDir, 'summary.md'), markdownSummary('Smoke Station Local Smoke Report', report));

  if (report.status === 'FAIL') {
    process.exitCode = 1;
  }
}

async function getCheckWithAuth(name, pathName, token, expectedStatuses = [200], validator) {
  try {
    const response = await fetchJson(`${apiBaseUrl}${pathName}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const statusOk = expectedStatuses.includes(response.status);
    const validation = validator ? validator(response) : { ok: true, summary: 'Shape accepted.' };
    addResult(
      results,
      name,
      statusOk && validation.ok ? 'PASS' : 'FAIL',
      `${pathName} returned ${response.status}. ${validation.summary}`,
      { requestId: response.requestId },
    );
  } catch (error) {
    addResult(results, name, 'FAIL', `${pathName} failed: ${error.message}.`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
