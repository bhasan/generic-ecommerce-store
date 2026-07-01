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
