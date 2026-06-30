// backend/src/integration/tenantManagement.service.test.ts
//
// Integration test using the real DB (mirrors tenantIsolation.test.ts setup).
// Created tenants are cleaned up in afterAll.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getUnscopedPrisma } from '../config/database';
import { TenantManagementService } from '../services/tenantManagement.service';
import { hashMachineToken } from '../utils/machineToken';

const base = getUnscopedPrisma();
const service = new TenantManagementService();

// Unique slug suffix to avoid collisions if tests run concurrently or leave residue.
const suffix = Date.now();
const slugA = `mgmt-test-a-${suffix}`;
const slugB = `mgmt-test-b-${suffix}`;

let tenantAId: number;

afterAll(async () => {
  // Clean up in dependency order: users → stores → tenants
  if (tenantAId) {
    await base.userRole.deleteMany({ where: { tenantId: tenantAId } });
    await base.user.deleteMany({ where: { tenantId: tenantAId } });
    await base.store.deleteMany({ where: { tenantId: tenantAId } });
    await base.tenant.deleteMany({ where: { id: tenantAId } });
  }
  // Also clean up if slugB was created in a test.
  const b = await base.tenant.findUnique({ where: { slug: slugB } });
  if (b) {
    await base.userRole.deleteMany({ where: { tenantId: b.id } });
    await base.user.deleteMany({ where: { tenantId: b.id } });
    await base.store.deleteMany({ where: { tenantId: b.id } });
    await base.tenant.deleteMany({ where: { id: b.id } });
  }
});

describe('TenantManagementService', () => {
  describe('createTenant', () => {
    it('provisions a tenant with store, admin user, and both machine tokens', async () => {
      const result = await service.createTenant({
        slug: slugA,
        name: 'Management Test A',
        plan: 'starter',
        adminUsername: 'admin-a',
        adminPassword: 'supersecret',
      });

      tenantAId = result.tenant.id;

      expect(result.tenant).toMatchObject({ slug: slugA, name: 'Management Test A', status: 'ACTIVE' });
      expect(typeof result.reportingToken).toBe('string');
      expect(result.reportingToken.length).toBeGreaterThan(20);
      expect(typeof result.printAgentKey).toBe('string');
      expect(result.printAgentKey.length).toBeGreaterThan(20);

      // Verify hashes are stored correctly on the tenant row.
      const row = await base.tenant.findUnique({ where: { id: tenantAId } });
      expect(row?.reportingTokenHash).toBe(hashMachineToken(result.reportingToken));
      expect(row?.printAgentKeyHash).toBe(hashMachineToken(result.printAgentKey));

      // Verify default store was created.
      const store = await base.store.findFirst({ where: { tenantId: tenantAId, isDefault: true } });
      expect(store?.slug).toBe('main');
      expect(store?.status).toBe('ACTIVE');

      // Verify admin user was created and approved.
      const user = await base.user.findFirst({ where: { tenantId: tenantAId, username: 'admin-a' } });
      expect(user?.approved).toBe(true);

      // Verify the admin user has the ADMIN role.
      const userRole = await base.userRole.findFirst({
        where: { userId: user!.id, tenantId: tenantAId },
        include: { role: true },
      });
      expect(userRole?.role.name).toBe('ADMIN');
    });

    it('rejects a duplicate slug with 409', async () => {
      await expect(
        service.createTenant({
          slug: slugA, // already exists
          name: 'Duplicate',
          adminUsername: 'dup-admin',
          adminPassword: 'password',
        }),
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('listTenants', () => {
    it('returns tenant list with token-presence flags and no hashes', async () => {
      const list = await service.listTenants();
      const found = list.find((t) => t.id === tenantAId);

      expect(found).toBeDefined();
      expect(found?.hasReportingToken).toBe(true);
      expect(found?.hasPrintKey).toBe(true);
      // Ensure the hash is NOT in the response.
      expect((found as any)?.reportingTokenHash).toBeUndefined();
      expect((found as any)?.printAgentKeyHash).toBeUndefined();
    });
  });

  describe('setTenantStatus', () => {
    it('can suspend and reactivate a tenant', async () => {
      const suspended = await service.setTenantStatus(tenantAId, 'SUSPENDED');
      expect(suspended.status).toBe('SUSPENDED');

      const active = await service.setTenantStatus(tenantAId, 'ACTIVE');
      expect(active.status).toBe('ACTIVE');
    });

    it('throws 404 for unknown tenant', async () => {
      await expect(service.setTenantStatus(99999999, 'ACTIVE')).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('regenerateTokens', () => {
    it('returns new plaintext tokens and invalidates old ones', async () => {
      const before = await base.tenant.findUnique({ where: { id: tenantAId } });
      const oldReportingHash = before?.reportingTokenHash;

      const tokens = await service.regenerateTokens(tenantAId);

      expect(typeof tokens.reportingToken).toBe('string');
      expect(typeof tokens.printAgentKey).toBe('string');

      const after = await base.tenant.findUnique({ where: { id: tenantAId } });
      expect(after?.reportingTokenHash).toBe(hashMachineToken(tokens.reportingToken));
      expect(after?.printAgentKeyHash).toBe(hashMachineToken(tokens.printAgentKey));

      // Old hash is gone.
      expect(after?.reportingTokenHash).not.toBe(oldReportingHash);
    });

    it('throws 404 for unknown tenant', async () => {
      await expect(service.regenerateTokens(99999999)).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
