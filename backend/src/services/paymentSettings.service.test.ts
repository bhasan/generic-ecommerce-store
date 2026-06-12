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
      cc_payment: { enabled: false, loginId: '', transactionKey: '', sandboxMode: true },
    });
  });

  it('upserts validated payment settings', async () => {
    const settings = {
      cashapp: { enabled: true, handle: '$SmokeStationHQ' },
      zelle: { enabled: true, handle: 'billing@example.com' },
      venmo: { enabled: false, handle: '' },
      cc_payment: { enabled: false, loginId: '', transactionKey: '', sandboxMode: true },
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
      cc_payment: { enabled: false, loginId: '', transactionKey: '', sandboxMode: true },
    })).rejects.toEqual(expect.any(AppError));
  });

  it('returns cc_payment defaults when no persisted settings exist', async () => {
    prismaMock.uiSetting.findUnique.mockResolvedValue(null);
    const { PaymentSettingsService } = await import('./paymentSettings.service');

    const result = await new PaymentSettingsService().getPaymentSettings();

    expect(result.cc_payment).toEqual({
      enabled: false,
      loginId: '',
      transactionKey: '',
      sandboxMode: true,
    });
  });

  it('saves and returns cc_payment credentials', async () => {
    const settings = {
      cashapp: { enabled: true, handle: '$SmokeStationHQ' },
      zelle: { enabled: false, handle: '' },
      venmo: { enabled: false, handle: '' },
      cc_payment: { enabled: true, loginId: 'abc123', transactionKey: 'xyz789', sandboxMode: false },
    };
    prismaMock.uiSetting.upsert.mockResolvedValue({ value: settings });
    const { PaymentSettingsService } = await import('./paymentSettings.service');

    const result = await new PaymentSettingsService().updatePaymentSettings(settings);

    expect(result.cc_payment).toEqual({ enabled: true, loginId: 'abc123', transactionKey: 'xyz789', sandboxMode: false });
  });

  it('throws when cc_payment is enabled but loginId is missing', async () => {
    const { PaymentSettingsService } = await import('./paymentSettings.service');
    const settings = {
      cashapp: { enabled: true, handle: '$x' },
      zelle: { enabled: false, handle: '' },
      venmo: { enabled: false, handle: '' },
      cc_payment: { enabled: true, loginId: '', transactionKey: 'xyz', sandboxMode: true },
    };

    await expect(new PaymentSettingsService().updatePaymentSettings(settings)).rejects.toThrow(
      'cc_payment.loginId is required when card payments are enabled'
    );
  });

  it('throws when cc_payment is enabled but transactionKey is missing', async () => {
    const { PaymentSettingsService } = await import('./paymentSettings.service');
    const settings = {
      cashapp: { enabled: true, handle: '$x' },
      zelle: { enabled: false, handle: '' },
      venmo: { enabled: false, handle: '' },
      cc_payment: { enabled: true, loginId: 'abc', transactionKey: '', sandboxMode: true },
    };

    await expect(new PaymentSettingsService().updatePaymentSettings(settings)).rejects.toThrow(
      'cc_payment.transactionKey is required when card payments are enabled'
    );
  });
});
