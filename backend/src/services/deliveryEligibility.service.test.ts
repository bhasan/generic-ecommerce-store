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
    findUnique: vi.fn(),
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
    prismaMock.uiSetting.findUnique.mockImplementation(async ({ where }) => {
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

      if (where.key === 'store_settings') {
        return {
          value: {
            address: '9400 S Texas 6 Suite C, Houston, TX 77083',
          },
        };
      }

      return null;
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
      deliveryZoneStatus: 'IN_ZONE',
      deliveryZoneSource: 'ADDRESS_CACHE',
    }));
    expect(result.distanceMiles).not.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses ZIP fallback when Google is unavailable and the ZIP is allowlisted', async () => {
    prismaMock.uiSetting.findUnique.mockImplementation(async ({ where }) => {
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
      deliveryZoneStatus: 'IN_ZONE',
      deliveryZoneSource: 'ZIP_FALLBACK',
      distanceMiles: null,
    }));
    expect(logger.warn).toHaveBeenCalledWith('Delivery eligibility ZIP fallback used', expect.objectContaining({
      zipCode: '77083',
      deliverable: true,
    }));
  });

  it('does not use ZIP fallback when Google returns zero results', async () => {
    process.env.GOOGLE_GEOCODING_API_KEY = 'google-key';
    prismaMock.uiSetting.findUnique.mockImplementation(async ({ where }) => {
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
      deliveryZoneStatus: 'UNVERIFIED',
      deliveryZoneSource: 'NONE',
      distanceMiles: null,
    }));
  });
});
