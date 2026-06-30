import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppError } from '../middleware/error.middleware';

const prismaMock = vi.hoisted(() => ({
  uiSetting: {
    findFirst: vi.fn(),
    upsert: vi.fn(),
  },
}));
const deliveryEligibilityService = vi.hoisted(() => ({
  verifyStoreAddress: vi.fn(),
}));

vi.mock('../config/database', () => ({
  default: prismaMock,
  getTenantPrisma: () => prismaMock,
  getUnscopedPrisma: () => prismaMock,
}));

vi.mock('./deliveryEligibility.service', () => ({
  DeliveryEligibilityService: vi.fn(() => deliveryEligibilityService),
  invalidateStoreAddressCache: vi.fn(),
}));

vi.mock('./orderingConstraints.service', () => ({
  OrderingConstraintsService: vi.fn(),
  invalidateOfflineZipsCache: vi.fn(),
}));

vi.mock('./thermalPrinter.service', () => ({
  invalidateStoreNameCache: vi.fn(),
  thermalPrinterService: {},
}));

describe('store settings service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns defaults when no persisted settings exist', async () => {
    prismaMock.uiSetting.findFirst.mockResolvedValue(null);
    const { StoreSettingsService } = await import('./storeSettings.service');

    const result = await new StoreSettingsService().getStoreSettings();

    expect(result).toEqual({
      name: '',
      address: '',
      phoneNumber: '',
      tagline: '',
      notificationEmails: {
        adminEmail: '',
        managementEmail: '',
        employeeEmail: '',
      },
      posProvider: null,
      posConfig: {
        baseUrl: undefined,
        username: undefined,
        password: undefined,
        apiKey: undefined,
      },
    });
  });

  it('upserts validated store settings', async () => {
    const settings = {
      name: 'Smoke Station West',
      address: '101 Example Ave',
      phoneNumber: '555-0100',
      tagline: 'Your neighborhood smoke shop',
      notificationEmails: {
        adminEmail: 'admin@example.com',
        managementEmail: 'manager@example.com',
        employeeEmail: '',
      },
      posProvider: null,
      posConfig: {},
    };
    const settingsWithPosDefaults = {
      ...settings,
      posConfig: {
        baseUrl: undefined,
        username: undefined,
        password: undefined,
        apiKey: undefined,
      },
    };
    prismaMock.uiSetting.upsert.mockResolvedValue({ value: settings });
    const { StoreSettingsService } = await import('./storeSettings.service');

    const result = await new StoreSettingsService().updateStoreSettings(settings);

    expect(deliveryEligibilityService.verifyStoreAddress).toHaveBeenCalledWith('101 Example Ave');
    expect(prismaMock.uiSetting.upsert).toHaveBeenCalledWith({
      where: { tenantId_key: { tenantId: 0, key: 'store_settings' } },
      update: { value: settingsWithPosDefaults },
      create: { key: 'store_settings', value: settingsWithPosDefaults },
    });
    expect(result).toEqual(settingsWithPosDefaults);
  });

  it('rejects store names longer than the allowed limit', async () => {
    const { StoreSettingsService } = await import('./storeSettings.service');

    await expect(new StoreSettingsService().updateStoreSettings({
      name: 'x'.repeat(129),
      address: '101 Example Ave',
      phoneNumber: '555-0100',
    })).rejects.toEqual(expect.any(AppError));
  });

  it('skips store-address verification when the address did not change', async () => {
    prismaMock.uiSetting.findFirst.mockResolvedValue({
      value: {
        name: 'Smoke Station',
        address: '101 Example Ave',
        phoneNumber: '555-0100',
        notificationEmails: {
          adminEmail: '',
          managementEmail: '',
          employeeEmail: '',
        },
      },
    });
    prismaMock.uiSetting.upsert.mockResolvedValue({
      value: {
        name: 'Smoke Station West',
        address: '101 Example Ave',
        phoneNumber: '555-0100',
        notificationEmails: {
          adminEmail: 'admin@example.com',
          managementEmail: '',
          employeeEmail: '',
        },
      },
    });
    const { StoreSettingsService } = await import('./storeSettings.service');

    await new StoreSettingsService().updateStoreSettings({
      name: 'Smoke Station West',
      address: '101 Example Ave',
      phoneNumber: '555-0100',
      notificationEmails: {
        adminEmail: 'admin@example.com',
        managementEmail: '',
        employeeEmail: '',
      },
    });

    expect(deliveryEligibilityService.verifyStoreAddress).not.toHaveBeenCalled();
  });

  it('sanitizes invalid persisted notification routing emails and falls back safely', async () => {
    prismaMock.uiSetting.findFirst.mockResolvedValue({
      value: {
        name: 'Smoke Station',
        address: '9400 S Texas 6 Suite C, Houston, TX 77083',
        phoneNumber: '',
        notificationEmails: {
          adminEmail: 'not-an-email',
          managementEmail: '3',
          employeeEmail: '   ',
        },
      },
    });
    const { StoreSettingsService } = await import('./storeSettings.service');

    const result = await new StoreSettingsService().getStoreSettings();

    expect(result.notificationEmails).toEqual({
      adminEmail: '',
      managementEmail: '',
      employeeEmail: '',
    });
  });

  it('rejects invalid notification email formats', async () => {
    const { StoreSettingsService } = await import('./storeSettings.service');

    await expect(new StoreSettingsService().updateStoreSettings({
      name: 'Smoke Station West',
      address: '101 Example Ave',
      phoneNumber: '555-0100',
      notificationEmails: {
        adminEmail: 'invalid-email',
        managementEmail: '',
        employeeEmail: '',
      },
    })).rejects.toEqual(expect.any(AppError));
  });

  it('persists SAK catch-all product ids in posConfig', async () => {
    const svc = new (await import('./storeSettings.service')).StoreSettingsService();
    prismaMock.uiSetting.upsert.mockResolvedValue({
      value: {
        name: 'S',
        address: '',
        phoneNumber: '',
        tagline: '',
        notificationEmails: { adminEmail: '', managementEmail: '', employeeEmail: '' },
        posProvider: 'foreverpos',
        posConfig: { baseUrl: 'https://api.sakretailsolutions.com', sakCatchAllProductId: 93147, sakCatchAllVariantId: 104831 },
      },
    });
    const saved = await svc.updateStoreSettings({
      name: 'S',
      address: '',
      phoneNumber: '',
      tagline: '',
      notificationEmails: { adminEmail: '', managementEmail: '', employeeEmail: '' },
      posProvider: 'foreverpos',
      posConfig: { baseUrl: 'https://api.sakretailsolutions.com', sakCatchAllProductId: 93147, sakCatchAllVariantId: 104831 },
    } as any);
    expect(saved.posConfig.sakCatchAllProductId).toBe(93147);
    expect(saved.posConfig.sakCatchAllVariantId).toBe(104831);
  });
});
