import { AppError } from '../middleware/error.middleware';

const prismaMock = vi.hoisted(() => ({
  uiSetting: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}));
const deliveryEligibilityService = vi.hoisted(() => ({
  verifyStoreAddress: vi.fn(),
}));

vi.mock('../config/database', () => ({
  default: prismaMock,
}));

vi.mock('./deliveryEligibility.service', () => ({
  DeliveryEligibilityService: vi.fn(() => deliveryEligibilityService),
}));

describe('store settings service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns defaults when no persisted settings exist', async () => {
    prismaMock.uiSetting.findUnique.mockResolvedValue(null);
    const { StoreSettingsService } = await import('./storeSettings.service');

    const result = await new StoreSettingsService().getStoreSettings();

    expect(result).toEqual({
      name: 'Smoke Station',
      address: '9400 S Texas 6 Suite C, Houston, TX 77083',
      phoneNumber: '',
    });
  });

  it('upserts validated store settings', async () => {
    const settings = {
      name: 'Smoke Station West',
      address: '101 Example Ave',
      phoneNumber: '555-0100',
    };
    prismaMock.uiSetting.upsert.mockResolvedValue({ value: settings });
    const { StoreSettingsService } = await import('./storeSettings.service');

    const result = await new StoreSettingsService().updateStoreSettings(settings);

    expect(deliveryEligibilityService.verifyStoreAddress).toHaveBeenCalledWith('101 Example Ave');
    expect(prismaMock.uiSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'store_settings' },
      update: { value: settings },
      create: { key: 'store_settings', value: settings },
    });
    expect(result).toEqual(settings);
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
    prismaMock.uiSetting.findUnique.mockResolvedValue({
      value: {
        name: 'Smoke Station',
        address: '101 Example Ave',
        phoneNumber: '555-0100',
      },
    });
    prismaMock.uiSetting.upsert.mockResolvedValue({
      value: {
        name: 'Smoke Station West',
        address: '101 Example Ave',
        phoneNumber: '555-0100',
      },
    });
    const { StoreSettingsService } = await import('./storeSettings.service');

    await new StoreSettingsService().updateStoreSettings({
      name: 'Smoke Station West',
      address: '101 Example Ave',
      phoneNumber: '555-0100',
    });

    expect(deliveryEligibilityService.verifyStoreAddress).not.toHaveBeenCalled();
  });
});
