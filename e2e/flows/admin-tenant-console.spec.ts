/**
 * e2e/flows/admin-tenant-console.spec.ts
 *
 * Phase 3 — Super-admin console + soft-delete lifecycle.
 * API-driven (no storefront browser usage). Proves, through the REAL tenant
 * middleware, that a tenant's lifecycle status changes its resolution:
 *   ACTIVE → 200, SUSPENDED → 403, DELETED → 404, restore → 200,
 * and that every action is recorded in the audit log.
 *
 * Path notes vs. brief assumptions:
 *   - Login:   POST /api/auth/login returning body.data.token  ✓ (unchanged)
 *   - Probe:   GET /api/branding/public (NOT /api/products — products require
 *              authentication; branding/public is unauthenticated but still
 *              passes through resolveTenant so the status gate fires correctly)
 */

import { test, expect, request } from '@playwright/test';
import { ACCOUNTS } from '../helpers/accounts';
import { grantSuperAdmin } from '../helpers/db';

const API = 'http://localhost:3000';

async function login(username: string, password: string): Promise<string> {
  const ctx = await request.newContext({ baseURL: API });
  const res = await ctx.post('/api/auth/login', { data: { username, password } });
  expect(res.ok(), `login ${username} → ${res.status()}`).toBeTruthy();
  const body = await res.json();
  const token = body?.data?.token ?? body?.token;
  expect(token, 'login returned a token').toBeTruthy();
  await ctx.dispose();
  return token;
}

// Probe a tenant-scoped public endpoint with the X-Tenant-Slug override so the
// middleware resolves THIS tenant and applies its status gate.
// Uses /api/branding/public — unauthenticated, so ACTIVE → 200, SUSPENDED → 403,
// DELETED → 404, without auth interfering.
async function probeStatus(slug: string): Promise<number> {
  const ctx = await request.newContext({ baseURL: API });
  const res = await ctx.get('/api/branding/public', { headers: { 'X-Tenant-Slug': slug } });
  await ctx.dispose();
  return res.status();
}

test.describe('super-admin tenant lifecycle', () => {
  let token: string;
  let auth: Record<string, string>;
  let tenantId: number;
  const slug = `e2e-${Date.now()}`;

  test.beforeAll(async () => {
    grantSuperAdmin(ACCOUNTS.admin.username);
    token = await login(ACCOUNTS.admin.username, ACCOUNTS.admin.password);
    auth = { Authorization: `Bearer ${token}` };
  });

  test('create → suspend(403) → restore(200) → delete(404) → restore(200) with audit trail', async () => {
    const ctx = await request.newContext({ baseURL: API, extraHTTPHeaders: auth });

    // Create
    const created = await ctx.post('/api/admin/tenants', {
      data: { slug, name: 'E2E Co', plan: 'starter', adminUsername: `${slug}-admin`, adminPassword: 'secret123' },
    });
    expect(created.status(), 'create → 201').toBe(201);
    tenantId = (await created.json()).data.tenant.id;
    expect(await probeStatus(slug)).toBe(200); // ACTIVE

    // Suspend → 403
    expect((await ctx.patch(`/api/admin/tenants/${tenantId}/status`, { data: { status: 'SUSPENDED' } })).status()).toBe(200);
    expect(await probeStatus(slug)).toBe(403);

    // Restore → 200
    expect((await ctx.patch(`/api/admin/tenants/${tenantId}/status`, { data: { status: 'ACTIVE' } })).status()).toBe(200);
    expect(await probeStatus(slug)).toBe(200);

    // Update name/plan
    expect((await ctx.patch(`/api/admin/tenants/${tenantId}`, { data: { name: 'E2E Renamed', plan: 'pro' } })).status()).toBe(200);

    // Soft-delete → 404 (indistinguishable from unknown)
    expect((await ctx.delete(`/api/admin/tenants/${tenantId}`)).status()).toBe(200);
    expect(await probeStatus(slug)).toBe(404);

    // Deleted tenant is hidden from the default list, visible with ?status=DELETED
    const defaultList = (await (await ctx.get('/api/admin/tenants')).json()).data;
    expect(defaultList.some((t: any) => t.id === tenantId)).toBe(false);
    const deletedList = (await (await ctx.get('/api/admin/tenants?status=DELETED')).json()).data;
    expect(deletedList.some((t: any) => t.id === tenantId)).toBe(true);

    // Restore from deleted → 200
    expect((await ctx.patch(`/api/admin/tenants/${tenantId}/status`, { data: { status: 'ACTIVE' } })).status()).toBe(200);
    expect(await probeStatus(slug)).toBe(200);

    // Audit trail records every action, newest-first
    const audit = (await (await ctx.get(`/api/admin/tenants/audit?tenantId=${tenantId}`)).json()).data;
    const actions = audit.map((r: any) => r.action);
    for (const a of ['TENANT_CREATED', 'TENANT_SUSPENDED', 'TENANT_RESTORED', 'TENANT_UPDATED', 'TENANT_DELETED']) {
      expect(actions, `audit contains ${a}`).toContain(a);
    }
    expect(audit[0].actorUsername).toBe(ACCOUNTS.admin.username);

    await ctx.dispose();
  });

  test('a regular ADMIN cannot reach the console', async () => {
    // A fresh manager token (no SUPER_ADMIN) must be rejected at requireSuperAdmin.
    const mgr = await login(ACCOUNTS.manager.username, ACCOUNTS.manager.password);
    const ctx = await request.newContext({ baseURL: API, extraHTTPHeaders: { Authorization: `Bearer ${mgr}` } });
    expect((await ctx.get('/api/admin/tenants')).status()).toBe(403);
    await ctx.dispose();
  });
});
