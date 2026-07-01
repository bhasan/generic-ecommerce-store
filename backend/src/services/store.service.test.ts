import { describe, it, expect, vi, beforeEach } from 'vitest';

const findMany = vi.fn();
vi.mock('../config/database', () => ({ getUnscopedPrisma: () => ({ store: { findMany } }) }));
vi.mock('../config/tenantContext', () => ({ getTenantContextOrThrow: () => ({ tenantId: 7, storeId: 1, scope: 'tenant' }) }));

import { StoreService } from './store.service';

describe('StoreService.listStores', () => {
  beforeEach(() => findMany.mockReset());

  it('returns the active stores for the context tenant, default first', async () => {
    findMany.mockResolvedValue([{ id: 5, name: 'Main', slug: 'main', isDefault: true }]);
    const result = await new StoreService().listStores();
    expect(findMany).toHaveBeenCalledWith({
      where: { tenantId: 7, status: 'ACTIVE' },
      select: { id: true, name: true, slug: true, isDefault: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    expect(result).toEqual([{ id: 5, name: 'Main', slug: 'main', isDefault: true }]);
  });
});
