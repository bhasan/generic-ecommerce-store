import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppError } from '../middleware/error.middleware';

const tenantContextMock = vi.hoisted(() => ({
  getTenantContext: vi.fn(),
}));

vi.mock('../config/tenantContext', () => ({
  getTenantContext: tenantContextMock.getTenantContext,
  getEffectiveStoreId: (ctx: { isDefaultStore?: boolean; storeId?: number | null } | undefined) =>
    ctx?.isDefaultStore ? 0 : (ctx?.storeId ?? 0),
  getTenantContextOrThrow: vi.fn(),
  runWithTenant: vi.fn(),
  MissingTenantContextError: class extends Error {
    constructor() {
      super('Missing context');
      this.name = 'MissingTenantContextError';
    }
  },
}));

const prismaMock = vi.hoisted(() => ({
  uiSetting: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock('../config/database', () => ({
  default: prismaMock,
  getTenantPrisma: () => prismaMock,
  getUnscopedPrisma: () => prismaMock,
}));

describe('ordering constraints service', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Default tenant context: tenant 0 (matches pre-mock baseline), default store.
    tenantContextMock.getTenantContext.mockReturnValue({ tenantId: 0, storeId: null, scope: 'tenant', isDefaultStore: true });
    // Default: no store_settings rows (offline zips = [])
    prismaMock.uiSetting.findMany.mockResolvedValue([]);
    // Invalidate the module-level cache between tests to prevent cross-test pollution
    const { invalidateOfflineZipsCache } = await import('./orderingConstraints.service');
    invalidateOfflineZipsCache();
  });

  it('returns defaults when no persisted settings exist', async () => {
    prismaMock.uiSetting.findFirst.mockResolvedValue(null);
    const { OrderingConstraintsService } = await import('./orderingConstraints.service');

    const result = await new OrderingConstraintsService().getOrderingConstraints();

    expect(result).toEqual({
      minimumDeliveryOrder: 35,
      minimumDeliveryOrderEnabled: true,
      deliveryDisabled: false,
      deliveryDisabledMessage: '',
      deliveryRadiusMiles: 5,
      offlineZipFallbackEnabled: true,
      offlineDeliveryZipCodes: [],
    });
  });

  it('upserts validated ordering constraints and normalizes ZIP codes', async () => {
    const savedSettings = {
      minimumDeliveryOrder: 50,
      minimumDeliveryOrderEnabled: false,
      deliveryDisabled: false,
      deliveryDisabledMessage: '',
      deliveryRadiusMiles: 7.5,
      offlineZipFallbackEnabled: true,
      offlineDeliveryZipCodes: ['77082', '77083', '77498'],
    };
    prismaMock.uiSetting.upsert.mockResolvedValue({ value: savedSettings });
    const { OrderingConstraintsService } = await import('./orderingConstraints.service');

    const result = await new OrderingConstraintsService().updateOrderingConstraints({
      minimumDeliveryOrder: 50,
      minimumDeliveryOrderEnabled: false,
      deliveryDisabled: false,
      deliveryDisabledMessage: '',
      deliveryRadiusMiles: 7.5,
      offlineZipFallbackEnabled: true,
      offlineDeliveryZipCodes: ['77083', '77082', '77083-1234', '77498'],
    });

    expect(prismaMock.uiSetting.upsert).toHaveBeenCalledWith({
      where: { tenantId_storeId_key: { tenantId: 0, storeId: 0, key: 'ordering_constraints' } },
      update: { value: savedSettings },
      create: { key: 'ordering_constraints', storeId: 0, value: savedSettings },
    });
    expect(result).toEqual(savedSettings);
  });

  it('rejects negative minimum delivery orders', async () => {
    const { OrderingConstraintsService } = await import('./orderingConstraints.service');

    await expect(new OrderingConstraintsService().updateOrderingConstraints({
      minimumDeliveryOrder: -1,
      minimumDeliveryOrderEnabled: true,
      deliveryDisabled: false,
      deliveryDisabledMessage: '',
      deliveryRadiusMiles: 5,
      offlineZipFallbackEnabled: false,
      offlineDeliveryZipCodes: [],
    })).rejects.toEqual(expect.any(AppError));
  });

  it('merges persisted legacy rows with new defaults', async () => {
    prismaMock.uiSetting.findFirst.mockResolvedValue({
      value: {
        minimumDeliveryOrder: 42,
        minimumDeliveryOrderEnabled: true,
      },
    });
    const { OrderingConstraintsService } = await import('./orderingConstraints.service');

    const result = await new OrderingConstraintsService().getOrderingConstraints();

    expect(result).toEqual({
      minimumDeliveryOrder: 42,
      minimumDeliveryOrderEnabled: true,
      deliveryDisabled: false,
      deliveryDisabledMessage: '',
      deliveryRadiusMiles: 5,
      offlineZipFallbackEnabled: true,
      offlineDeliveryZipCodes: [],
    });
  });

  describe('getOfflineZips — multi-store isolation', () => {
    it('two stores under one tenant resolve DIFFERENT offline ZIPs from per-store override rows', async () => {
      prismaMock.uiSetting.findFirst.mockResolvedValue(null);

      // Store 10 has its own store_settings row; store 20 has a different one.
      prismaMock.uiSetting.findMany.mockImplementation(async ({ where }: { where: { key: string; storeId: { in: number[] } } }) => {
        if (where.key !== 'store_settings') return [];
        const storeIds: number[] = where.storeId?.in ?? [];
        const rows = [];
        // Default row for both
        if (storeIds.includes(0)) {
          rows.push({ storeId: 0, value: { address: '100 Main St, Houston, TX 77001' } });
        }
        if (storeIds.includes(10)) {
          rows.push({ storeId: 10, value: { address: '200 Oak Ave, Houston, TX 77082' } });
        }
        if (storeIds.includes(20)) {
          rows.push({ storeId: 20, value: { address: '300 Pine Rd, Houston, TX 77083' } });
        }
        return rows;
      });

      const { OrderingConstraintsService, invalidateOfflineZipsCache } = await import('./orderingConstraints.service');

      // Resolve for store 10
      tenantContextMock.getTenantContext.mockReturnValue({ tenantId: 1, storeId: 10, scope: 'tenant', isDefaultStore: false });
      const result10 = await new OrderingConstraintsService().getOrderingConstraints();

      // Invalidate cache and switch to store 20
      invalidateOfflineZipsCache();
      tenantContextMock.getTenantContext.mockReturnValue({ tenantId: 1, storeId: 20, scope: 'tenant', isDefaultStore: false });
      const result20 = await new OrderingConstraintsService().getOrderingConstraints();

      expect(result10.offlineDeliveryZipCodes).toEqual(['77082']);
      expect(result20.offlineDeliveryZipCodes).toEqual(['77083']);
      expect(result10.offlineDeliveryZipCodes).not.toEqual(result20.offlineDeliveryZipCodes);
    });

    it('blank per-store override inherits the storeId-0 default ZIP', async () => {
      prismaMock.uiSetting.findFirst.mockResolvedValue(null);

      // Store 99 has an override row but with a blank address; storeId-0 has a real address.
      prismaMock.uiSetting.findMany.mockImplementation(async ({ where }: { where: { key: string; storeId: { in: number[] } } }) => {
        if (where.key !== 'store_settings') return [];
        const storeIds: number[] = where.storeId?.in ?? [];
        const rows = [];
        if (storeIds.includes(0)) {
          rows.push({ storeId: 0, value: { address: '9400 S Texas 6, Houston, TX 77083' } });
        }
        if (storeIds.includes(99)) {
          // Blank address — should fall back to the storeId-0 default
          rows.push({ storeId: 99, value: { address: '   ' } });
        }
        return rows;
      });

      tenantContextMock.getTenantContext.mockReturnValue({ tenantId: 1, storeId: 99, scope: 'tenant', isDefaultStore: false });
      const { OrderingConstraintsService } = await import('./orderingConstraints.service');

      const result = await new OrderingConstraintsService().getOrderingConstraints();

      expect(result.offlineDeliveryZipCodes).toEqual(['77083']);
    });

    it('keys cache by tenantId:effectiveStoreId — same store reuses cached value without re-querying', async () => {
      prismaMock.uiSetting.findFirst.mockResolvedValue(null);
      prismaMock.uiSetting.findMany.mockResolvedValue([
        { storeId: 5, value: { address: '1 Test Blvd, Houston, TX 77001' } },
      ]);

      tenantContextMock.getTenantContext.mockReturnValue({ tenantId: 2, storeId: 5, scope: 'tenant', isDefaultStore: false });
      const { OrderingConstraintsService } = await import('./orderingConstraints.service');

      await new OrderingConstraintsService().getOrderingConstraints();
      await new OrderingConstraintsService().getOrderingConstraints();

      // findMany should only be called once (second call hits the in-memory cache)
      const storeSettingsCalls = prismaMock.uiSetting.findMany.mock.calls.filter(
        ([arg]: [{ where: { key: string } }]) => arg?.where?.key === 'store_settings'
      );
      expect(storeSettingsCalls).toHaveLength(1);
    });
  });
});
