import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runWithTenant } from '../config/tenantContext';

vi.mock('../../generated/prisma', () => ({
  DeliveryEligibilitySource: {
    NONE: 'NONE',
    ADDRESS_CACHE: 'ADDRESS_CACHE',
    GOOGLE_GEOCODING: 'GOOGLE_GEOCODING',
    ZIP_FALLBACK: 'ZIP_FALLBACK',
  },
  DeliveryZoneStatus: {
    IN_ZONE: 'IN_ZONE',
    OUT_OF_ZONE: 'OUT_OF_ZONE',
    UNVERIFIED: 'UNVERIFIED',
  },
}));

const prismaMock = vi.hoisted(() => ({
  uiSetting: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  addressGeocodeCache: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}));

const logger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../config/database', () => ({
  default: prismaMock,
}));

vi.mock('../utils/logger', () => ({
  logger,
}));

describe('delivery eligibility service', () => {
  const originalApiKey = process.env.GOOGLE_GEOCODING_API_KEY;
  const originalTimeout = process.env.GOOGLE_GEOCODING_TIMEOUT_MS;

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.uiSetting.findFirst.mockImplementation(async ({ where }) => {
      if (where.key === 'ordering_constraints') {
        return {
          value: {
            minimumDeliveryOrder: 35,
            minimumDeliveryOrderEnabled: true,
            deliveryRadiusMiles: 5,
            offlineZipFallbackEnabled: false,
            offlineDeliveryZipCodes: [],
          },
        };
      }

      return null;
    });
    // getStoreAddress uses findMany to load both the default (storeId=0) and any
    // per-store override row; the extension injects tenantId automatically.
    prismaMock.uiSetting.findMany.mockImplementation(async ({ where }) => {
      if (where.key === 'store_settings') {
        return [{ storeId: 0, value: { address: '9400 S Texas 6 Suite C, Houston, TX 77083' } }];
      }
      return [];
    });
    prismaMock.addressGeocodeCache.findUnique.mockResolvedValue(null);
    prismaMock.addressGeocodeCache.upsert.mockResolvedValue({});
    vi.stubGlobal('fetch', vi.fn());
    process.env.GOOGLE_GEOCODING_API_KEY = '';
    process.env.GOOGLE_GEOCODING_TIMEOUT_MS = '50';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.GOOGLE_GEOCODING_API_KEY = originalApiKey;
    process.env.GOOGLE_GEOCODING_TIMEOUT_MS = originalTimeout;
  });

  it('uses cached coordinates to evaluate the delivery radius', async () => {
    prismaMock.addressGeocodeCache.findUnique.mockImplementation(async ({ where }) => {
      if (where.normalizedAddress === '123 main st houston tx 77083') {
        return {
          latitude: 29.702,
          longitude: -95.646,
          formattedAddress: '123 Main St, Houston, TX 77083',
          city: 'Houston',
          state: 'TX',
          zipCode: '77083',
        };
      }

      if (where.normalizedAddress === '9400 s texas 6 suite c houston tx 77083') {
        return {
          latitude: 29.699,
          longitude: -95.641,
          formattedAddress: '9400 S Texas 6 Suite C, Houston, TX 77083',
          city: 'Houston',
          state: 'TX',
          zipCode: '77083',
        };
      }

      return null;
    });

    const { DeliveryEligibilityService } = await import('./deliveryEligibility.service');
    const service = new DeliveryEligibilityService();

    const result = await service.checkDeliveryEligibility({
      street: '123 Main St',
      city: 'Houston',
      state: 'TX',
      zipCode: '77083',
    });

    expect(result).toEqual(expect.objectContaining({
      deliverable: true,
      deliveryStatus: 'IN_ZONE',
      deliverySource: 'ADDRESS_CACHE',
    }));
    expect(result.distanceMiles).not.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses ZIP fallback when Google is unavailable and the ZIP is allowlisted', async () => {
    prismaMock.uiSetting.findFirst.mockImplementation(async ({ where }) => {
      if (where.key === 'ordering_constraints') {
        return {
          value: {
            minimumDeliveryOrder: 35,
            minimumDeliveryOrderEnabled: true,
            deliveryRadiusMiles: 5,
            offlineZipFallbackEnabled: true,
            offlineDeliveryZipCodes: ['77083'],
          },
        };
      }

      return {
        value: {
          address: '9400 S Texas 6 Suite C, Houston, TX 77083',
        },
      };
    });

    const { DeliveryEligibilityService } = await import('./deliveryEligibility.service');
    const service = new DeliveryEligibilityService();

    const result = await service.checkDeliveryEligibility({
      street: '123 Main St',
      city: 'Houston',
      state: 'TX',
      zipCode: '77083',
    });

    expect(result).toEqual(expect.objectContaining({
      deliverable: true,
      deliveryStatus: 'IN_ZONE',
      deliverySource: 'ZIP_FALLBACK',
      distanceMiles: null,
    }));
    expect(logger.warn).toHaveBeenCalledWith('Delivery eligibility ZIP fallback used', expect.objectContaining({
      zipCode: '77083',
      deliverable: true,
    }));
  });

  it('does not use ZIP fallback when Google returns zero results', async () => {
    process.env.GOOGLE_GEOCODING_API_KEY = 'google-key';
    prismaMock.uiSetting.findFirst.mockImplementation(async ({ where }) => {
      if (where.key === 'ordering_constraints') {
        return {
          value: {
            minimumDeliveryOrder: 35,
            minimumDeliveryOrderEnabled: true,
            deliveryRadiusMiles: 5,
            offlineZipFallbackEnabled: true,
            offlineDeliveryZipCodes: ['77083'],
          },
        };
      }

      return {
        value: {
          address: '9400 S Texas 6 Suite C, Houston, TX 77083',
        },
      };
    });
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'ZERO_RESULTS',
        results: [],
      }),
    });

    const { DeliveryEligibilityService } = await import('./deliveryEligibility.service');
    const service = new DeliveryEligibilityService();

    const result = await service.checkDeliveryEligibility({
      street: '999 Unknown Rd',
      city: 'Houston',
      state: 'TX',
      zipCode: '77083',
    });

    expect(result).toEqual(expect.objectContaining({
      deliverable: false,
      deliveryStatus: 'UNVERIFIED',
      deliverySource: 'NONE',
      distanceMiles: null,
    }));
  });
});

describe('invalidateStoreAddressCache', () => {
  const storeSettingsCallCount = (calls: any[][]) =>
    calls.filter(([args]) => args.where.key === 'store_settings').length;

  // Pre-geocoded coords for both the store and customer address so the radius check runs
  // and therefore getStoreAddress() is actually invoked.
  const STORE_GEOCODE = {
    latitude: 29.699, longitude: -95.641,
    formattedAddress: '9400 S Texas 6 Suite C, Houston, TX 77083',
    city: 'Houston', state: 'TX', zipCode: '77083',
  };
  const CUSTOMER_GEOCODE = {
    latitude: 29.702, longitude: -95.646,
    formattedAddress: '123 Main St, Houston, TX 77083',
    city: 'Houston', state: 'TX', zipCode: '77083',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const { invalidateStoreAddressCache } = await import('./deliveryEligibility.service');
    invalidateStoreAddressCache();

    prismaMock.uiSetting.findFirst.mockImplementation(async ({ where }) => {
      if (where.key === 'ordering_constraints') {
        return {
          value: {
            minimumDeliveryOrder: 35, minimumDeliveryOrderEnabled: true,
            deliveryRadiusMiles: 5, offlineZipFallbackEnabled: false,
            offlineDeliveryZipCodes: [],
          },
        };
      }
      return null;
    });
    // getStoreAddress uses findMany for store_settings (not findFirst).
    prismaMock.uiSetting.findMany.mockImplementation(async ({ where }) => {
      if (where.key === 'store_settings') {
        return [{ storeId: 0, value: { address: '9400 S Texas 6 Suite C, Houston, TX 77083' } }];
      }
      return [];
    });
    // Both addresses have cached geocodes so resolveStructuredAddress returns 'resolved',
    // which is the only path that subsequently calls getStoreAddress().
    prismaMock.addressGeocodeCache.findUnique.mockImplementation(async ({ where }) => {
      if (where.normalizedAddress === '123 main st houston tx 77083') return CUSTOMER_GEOCODE;
      if (where.normalizedAddress === '9400 s texas 6 suite c houston tx 77083') return STORE_GEOCODE;
      return null;
    });
    prismaMock.addressGeocodeCache.upsert.mockResolvedValue({});
    vi.stubGlobal('fetch', vi.fn());
    process.env.GOOGLE_GEOCODING_API_KEY = '';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('forces a DB re-fetch after the cache is invalidated', async () => {
    const { DeliveryEligibilityService, invalidateStoreAddressCache } = await import('./deliveryEligibility.service');
    const service = new DeliveryEligibilityService();
    const addr = { street: '123 Main St', city: 'Houston', state: 'TX', zipCode: '77083' };

    // First call — populates the module-level store address cache
    await service.checkDeliveryEligibility(addr);
    const callsAfterFirst = storeSettingsCallCount(prismaMock.uiSetting.findMany.mock.calls);
    expect(callsAfterFirst).toBeGreaterThan(0);

    // Second call — store address served from cache (no new store_settings DB read)
    await service.checkDeliveryEligibility(addr);
    const callsAfterSecond = storeSettingsCallCount(prismaMock.uiSetting.findMany.mock.calls);
    expect(callsAfterSecond).toBe(callsAfterFirst);

    // Invalidate cache → next call must re-fetch from DB
    invalidateStoreAddressCache();
    await service.checkDeliveryEligibility(addr);
    const callsAfterThird = storeSettingsCallCount(prismaMock.uiSetting.findMany.mock.calls);
    expect(callsAfterThird).toBeGreaterThan(callsAfterSecond);
  });
});

// Phase 2b Task 5: store-keyed address cache
// The cache must be keyed by "${tenantId}:${effectiveStoreId}" so two stores
// under the same tenant never share a cached store origin address.
describe('store-keyed address cache (Phase 2b Task 5)', () => {
  const STORE_A_ADDRESS = '9400 S Texas 6 Suite C, Houston, TX 77083';
  const STORE_B_ADDRESS = '100 Main St, New York, NY 10001';

  // Houston store — close to customer
  const STORE_A_GEOCODE = {
    latitude: 29.699, longitude: -95.641,
    formattedAddress: STORE_A_ADDRESS,
    city: 'Houston', state: 'TX', zipCode: '77083',
  };
  // New York store — far from customer
  const STORE_B_GEOCODE = {
    latitude: 40.712, longitude: -74.006,
    formattedAddress: STORE_B_ADDRESS,
    city: 'New York', state: 'NY', zipCode: '10001',
  };
  const CUSTOMER_GEOCODE = {
    latitude: 29.702, longitude: -95.646,
    formattedAddress: '123 Main St, Houston, TX 77083',
    city: 'Houston', state: 'TX', zipCode: '77083',
  };

  const CUSTOMER_ADDR = { street: '123 Main St', city: 'Houston', state: 'TX', zipCode: '77083' };

  const ORDERING_CONSTRAINTS = {
    minimumDeliveryOrder: 35,
    minimumDeliveryOrderEnabled: true,
    deliveryRadiusMiles: 5,
    offlineZipFallbackEnabled: false,
    offlineDeliveryZipCodes: [],
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const { invalidateStoreAddressCache } = await import('./deliveryEligibility.service');
    invalidateStoreAddressCache();

    prismaMock.uiSetting.findFirst.mockImplementation(async ({ where }) => {
      if (where.key === 'ordering_constraints') {
        return { value: ORDERING_CONSTRAINTS };
      }
      return null;
    });

    // findMany returns rows for both stores so each test can override per-case.
    prismaMock.uiSetting.findMany.mockImplementation(async ({ where }) => {
      if (where.key === 'store_settings') {
        const inList: number[] = where.storeId?.in ?? [];
        const allRows = [
          { storeId: 0, value: { address: 'Default Fallback, Houston, TX 77099' } },
          { storeId: 10, value: { address: STORE_A_ADDRESS } },
          { storeId: 20, value: { address: STORE_B_ADDRESS } },
        ];
        return allRows.filter((r) => inList.includes(r.storeId));
      }
      return [];
    });

    prismaMock.addressGeocodeCache.findUnique.mockImplementation(async ({ where }) => {
      const map: Record<string, object> = {
        '123 main st houston tx 77083': CUSTOMER_GEOCODE,
        '9400 s texas 6 suite c houston tx 77083': STORE_A_GEOCODE,
        '100 main st new york ny 10001': STORE_B_GEOCODE,
      };
      return map[where.normalizedAddress as string] ?? null;
    });
    prismaMock.addressGeocodeCache.upsert.mockResolvedValue({});
    vi.stubGlobal('fetch', vi.fn());
    process.env.GOOGLE_GEOCODING_API_KEY = '';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves the active store address and does not cross stores via cache', async () => {
    const { DeliveryEligibilityService } = await import('./deliveryEligibility.service');
    const service = new DeliveryEligibilityService();

    // Store A (Houston) — customer should be within the 5-mile radius
    const resultA = await runWithTenant(
      { tenantId: 1, storeId: 10, scope: 'tenant' },
      async () => service.checkDeliveryEligibility(CUSTOMER_ADDR),
    );

    // Store B (New York) — customer in Houston is far outside the 5-mile radius
    const resultB = await runWithTenant(
      { tenantId: 1, storeId: 20, scope: 'tenant' },
      async () => service.checkDeliveryEligibility(CUSTOMER_ADDR),
    );

    expect(resultA.deliveryStatus).toBe('IN_ZONE');
    expect(resultB.deliveryStatus).toBe('OUT_OF_ZONE');
    // The two stores must have produced different origin distances
    expect(resultA.distanceMiles).not.toBe(resultB.distanceMiles);
    // findMany must have been called separately for each store (no cache bleed)
    const storeSettingsCalls = prismaMock.uiSetting.findMany.mock.calls.filter(
      ([args]: [{ where: { key: string } }]) => args.where.key === 'store_settings',
    );
    expect(storeSettingsCalls.length).toBe(2);
  });

  it('inherits the storeId-0 default when the per-store override address is blank', async () => {
    // Override findMany: store 99 has a blank address, default (storeId=0) is Houston
    prismaMock.uiSetting.findMany.mockImplementation(async ({ where }) => {
      if (where.key === 'store_settings') {
        const inList: number[] = where.storeId?.in ?? [];
        const allRows = [
          { storeId: 0, value: { address: STORE_A_ADDRESS } },
          { storeId: 99, value: { address: '   ' } }, // blank override
        ];
        return allRows.filter((r) => inList.includes(r.storeId));
      }
      return [];
    });

    const { DeliveryEligibilityService } = await import('./deliveryEligibility.service');
    const service = new DeliveryEligibilityService();

    // Store 99 has a blank override → falls back to default Houston address → customer is IN_ZONE
    const result = await runWithTenant(
      { tenantId: 1, storeId: 99, scope: 'tenant' },
      async () => service.checkDeliveryEligibility(CUSTOMER_ADDR),
    );

    expect(result.deliveryStatus).toBe('IN_ZONE');
  });
});
