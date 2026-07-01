import { describe, it, expect, beforeEach, vi } from 'vitest';

// A transaction-client stub whose tables are vi.fns we can assert on.
function makeTx() {
  return {
    tenant: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
    tenantAuditLog: { create: vi.fn(), findMany: vi.fn() },
  };
}

let tx = makeTx();
const prismaStub = {
  tenant: { findUnique: vi.fn(), findMany: vi.fn() },
  tenantAuditLog: { findMany: vi.fn() },
  // $transaction(cb) runs the callback against the tx stub, mirroring Prisma.
  $transaction: vi.fn(async (cb: any) => cb(tx)),
};

vi.mock('../config/database', () => ({
  getUnscopedPrisma: () => prismaStub,
}));
vi.mock('../utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { tenantManagementService } from './tenantManagement.service';

beforeEach(() => {
  tx = makeTx();
  prismaStub.$transaction.mockImplementation(async (cb: any) => cb(tx));
  prismaStub.tenant.findMany.mockReset();
  prismaStub.tenantAuditLog.findMany.mockReset();
});

describe('setTenantStatus audit', () => {
  it('records TENANT_SUSPENDED with a from/to detail when suspending', async () => {
    tx.tenant.findUnique.mockResolvedValue({ id: 7, slug: 'acme', status: 'ACTIVE' });
    tx.tenant.update.mockResolvedValue({ id: 7, slug: 'acme', status: 'SUSPENDED' });

    await tenantManagementService.setTenantStatus(7, 'SUSPENDED', { userId: 1, username: 'root', requestId: 'r1' });

    expect(tx.tenant.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { status: 'SUSPENDED' } });
    expect(tx.tenantAuditLog.create).toHaveBeenCalledWith({
      data: {
        action: 'TENANT_SUSPENDED',
        targetTenantId: 7,
        actorUserId: 1,
        actorUsername: 'root',
        requestId: 'r1',
        detail: { from: 'ACTIVE', to: 'SUSPENDED' },
      },
    });
  });
});

describe('setTenantStatus restore', () => {
  it('records TENANT_RESTORED when reactivating (from DELETED)', async () => {
    tx.tenant.findUnique.mockResolvedValue({ id: 7, slug: 'acme', status: 'DELETED' });
    tx.tenant.update.mockResolvedValue({ id: 7, slug: 'acme', status: 'ACTIVE' });

    await tenantManagementService.setTenantStatus(7, 'ACTIVE', { userId: 2, username: 'ops' });

    expect(tx.tenantAuditLog.create).toHaveBeenCalledWith({
      data: {
        action: 'TENANT_RESTORED',
        targetTenantId: 7,
        actorUserId: 2,
        actorUsername: 'ops',
        requestId: null,
        detail: { from: 'DELETED', to: 'ACTIVE' },
      },
    });
  });

  it('throws 404 when the tenant does not exist', async () => {
    tx.tenant.findUnique.mockResolvedValue(null);
    await expect(
      tenantManagementService.setTenantStatus(999, 'ACTIVE', { username: 'ops' }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('regenerateTokens audit', () => {
  it('records TENANT_TOKENS_REGENERATED inside the transaction', async () => {
    tx.tenant.findUnique.mockResolvedValue({ id: 3, slug: 'x', status: 'ACTIVE' });
    tx.tenant.update.mockResolvedValue({ id: 3 });

    const result = await tenantManagementService.regenerateTokens(3, { userId: 1, username: 'root' });

    expect(result.reportingToken).toBeTypeOf('string');
    expect(result.printAgentKey).toBeTypeOf('string');
    expect(tx.tenantAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'TENANT_TOKENS_REGENERATED', targetTenantId: 3 }) }),
    );
  });
});

describe('deleteTenant', () => {
  it('soft-deletes (status DELETED) and records TENANT_DELETED', async () => {
    tx.tenant.findUnique.mockResolvedValue({ id: 5, slug: 'gone', status: 'ACTIVE' });
    tx.tenant.update.mockResolvedValue({ id: 5, slug: 'gone', status: 'DELETED' });

    await tenantManagementService.deleteTenant(5, { userId: 1, username: 'root', requestId: 'r9' });

    expect(tx.tenant.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { status: 'DELETED' } });
    expect(tx.tenantAuditLog.create).toHaveBeenCalledWith({
      data: {
        action: 'TENANT_DELETED',
        targetTenantId: 5,
        actorUserId: 1,
        actorUsername: 'root',
        requestId: 'r9',
        detail: { from: 'ACTIVE', to: 'DELETED' },
      },
    });
  });
});

describe('updateTenant', () => {
  it('updates name and plan and records TENANT_UPDATED', async () => {
    tx.tenant.findUnique.mockResolvedValue({ id: 8, slug: 'acme', name: 'Old', plan: 'Free', status: 'ACTIVE' });
    tx.tenant.update.mockResolvedValue({ id: 8, slug: 'acme', name: 'New', plan: 'Pro', status: 'ACTIVE' });

    const result = await tenantManagementService.updateTenant(8, { name: 'New', plan: 'Pro' }, { username: 'root' });

    expect(tx.tenant.update).toHaveBeenCalledWith({ where: { id: 8 }, data: { name: 'New', plan: 'Pro' } });
    expect(result).toEqual({ id: 8, slug: 'acme', name: 'New', plan: 'Pro', status: 'ACTIVE' });
    expect(tx.tenantAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'TENANT_UPDATED', targetTenantId: 8, detail: { name: 'New', plan: 'Pro' } }) }),
    );
  });
});

describe('listTenants status filter', () => {
  beforeEach(() => prismaStub.tenant.findMany.mockResolvedValue([]));

  it('excludes DELETED by default', async () => {
    await tenantManagementService.listTenants();
    expect(prismaStub.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: { not: 'DELETED' } } }),
    );
  });

  it('shows everything for "all"', async () => {
    await tenantManagementService.listTenants('all');
    expect(prismaStub.tenant.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it('filters to an exact status', async () => {
    await tenantManagementService.listTenants('DELETED');
    expect(prismaStub.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'DELETED' } }),
    );
  });
});
