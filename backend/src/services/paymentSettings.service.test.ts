import { AppError } from '../middleware/error.middleware';

const prismaMock = vi.hoisted(() => ({
  uiSetting: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock('../config/database', () => ({
  default: prismaMock,
}));

describe('payment settings service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns defaults when no persisted settings exist', async () => {
    prismaMock.uiSetting.findUnique.mockResolvedValue(null);
    const { PaymentSettingsService } = await import('./paymentSettings.service');

    const result = await new PaymentSettingsService().getPaymentSettings();

    expect(result).toEqual({
      cashapp: { enabled: true, handle: '' },
      zelle: { enabled: false, handle: '' },
      venmo: { enabled: false, handle: '' },
    });
  });

  it('upserts validated payment settings', async () => {
    const settings = {
      cashapp: { enabled: true, handle: '$SmokeStationHQ' },
      zelle: { enabled: true, handle: 'billing@example.com' },
      venmo: { enabled: false, handle: '' },
    };
    prismaMock.uiSetting.upsert.mockResolvedValue({ value: settings });
    const { PaymentSettingsService } = await import('./paymentSettings.service');

    const result = await new PaymentSettingsService().updatePaymentSettings(settings);

    expect(prismaMock.uiSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'payment_settings' },
      update: { value: settings },
      create: { key: 'payment_settings', value: settings },
    });
    expect(result).toEqual(settings);
  });

  it('rejects enabled cashapp handles without a leading dollar sign', async () => {
    const { PaymentSettingsService } = await import('./paymentSettings.service');

    await expect(new PaymentSettingsService().updatePaymentSettings({
      cashapp: { enabled: true, handle: 'SmokeStationHQ' },
      zelle: { enabled: false, handle: '' },
      venmo: { enabled: false, handle: '' },
    })).rejects.toEqual(expect.any(AppError));
  });
});
