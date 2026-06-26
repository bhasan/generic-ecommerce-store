import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppError } from '../middleware/error.middleware';
import { clearSettingsCache } from './settingsStore';

const TEST_KEY = 'a'.repeat(64);

const prismaMock = vi.hoisted(() => ({
  uiSetting: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock('../config/database', () => ({
  default: prismaMock,
}));

vi.mock('../utils/crypto.util', () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace(/^enc:/, '')),
}));

describe('payment settings service', () => {
  beforeEach(() => {
    clearSettingsCache();
    vi.clearAllMocks();
  });

  it('returns defaults when no persisted settings exist', async () => {
    prismaMock.uiSetting.findUnique.mockResolvedValue(null);
    const { PaymentSettingsService } = await import('./paymentSettings.service');

    const result = await new PaymentSettingsService(TEST_KEY).getPaymentSettings();

    expect(result).toEqual({
      cashapp: { enabled: true, handle: '' },
      zelle: { enabled: false, handle: '' },
      venmo: { enabled: false, handle: '' },
      cc_payment: { enabled: false, loginId: '', transactionKey: '', sandboxMode: true },
    });
  });

  it('upserts validated payment settings and returns plaintext to caller', async () => {
    const settings = {
      cashapp: { enabled: true, handle: '$SmokeStationHQ' },
      zelle: { enabled: true, handle: 'billing@example.com' },
      venmo: { enabled: false, handle: '' },
      cc_payment: { enabled: false, loginId: '', transactionKey: '', sandboxMode: true },
    };
    prismaMock.uiSetting.upsert.mockResolvedValue({ value: settings });
    const { PaymentSettingsService } = await import('./paymentSettings.service');

    const result = await new PaymentSettingsService(TEST_KEY).updatePaymentSettings(settings);

    expect(prismaMock.uiSetting.upsert).toHaveBeenCalledOnce();
    expect(result).toEqual(settings);
  });

  it('rejects enabled cashapp handles without a leading dollar sign', async () => {
    const { PaymentSettingsService } = await import('./paymentSettings.service');

    await expect(new PaymentSettingsService(TEST_KEY).updatePaymentSettings({
      cashapp: { enabled: true, handle: 'SmokeStationHQ' },
      zelle: { enabled: false, handle: '' },
      venmo: { enabled: false, handle: '' },
      cc_payment: { enabled: false, loginId: '', transactionKey: '', sandboxMode: true },
    })).rejects.toEqual(expect.any(AppError));
  });

  it('returns cc_payment defaults when no persisted settings exist', async () => {
    prismaMock.uiSetting.findUnique.mockResolvedValue(null);
    const { PaymentSettingsService } = await import('./paymentSettings.service');

    const result = await new PaymentSettingsService(TEST_KEY).getPaymentSettings();

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

    const result = await new PaymentSettingsService(TEST_KEY).updatePaymentSettings(settings);

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

    await expect(new PaymentSettingsService(TEST_KEY).updatePaymentSettings(settings)).rejects.toThrow(
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

    await expect(new PaymentSettingsService(TEST_KEY).updatePaymentSettings(settings)).rejects.toThrow(
      'cc_payment.transactionKey is required when card payments are enabled'
    );
  });

  it('stores encrypted loginId and transactionKey, not plaintext', async () => {
    const { encrypt } = await import('../utils/crypto.util');
    const { PaymentSettingsService } = await import('./paymentSettings.service');
    const settings = {
      cashapp: { enabled: true, handle: '$SmokeStationHQ' },
      zelle: { enabled: false, handle: '' },
      venmo: { enabled: false, handle: '' },
      cc_payment: { enabled: true, loginId: 'myLoginId', transactionKey: 'myTxKey', sandboxMode: true },
    };
    prismaMock.uiSetting.upsert.mockResolvedValue({ value: settings });

    await new PaymentSettingsService(TEST_KEY).updatePaymentSettings(settings);

    const upsertedValue = prismaMock.uiSetting.upsert.mock.calls[0][0].update.value;
    expect(upsertedValue.cc_payment.loginId).not.toBe('myLoginId');
    expect(upsertedValue.cc_payment.transactionKey).not.toBe('myTxKey');
    expect(encrypt).toHaveBeenCalledWith('myLoginId', TEST_KEY);
    expect(encrypt).toHaveBeenCalledWith('myTxKey', TEST_KEY);
  });

  it('treats undecryptable stored credentials as empty instead of throwing', async () => {
    const { decrypt } = await import('../utils/crypto.util');
    const boom = () => { throw new Error('Invalid encrypted value format'); };
    vi.mocked(decrypt).mockImplementationOnce(boom).mockImplementationOnce(boom);
    prismaMock.uiSetting.findUnique.mockResolvedValue({
      value: {
        cashapp: { enabled: true, handle: '$x' },
        zelle: { enabled: false, handle: '' },
        venmo: { enabled: false, handle: '' },
        cc_payment: { enabled: true, loginId: 'plaintext-legacy', transactionKey: 'plaintext-legacy', sandboxMode: true },
      },
    });
    const { PaymentSettingsService } = await import('./paymentSettings.service');

    const result = await new PaymentSettingsService(TEST_KEY).getPaymentSettings();

    expect(result.cc_payment.loginId).toBe('');
    expect(result.cc_payment.transactionKey).toBe('');
  });

  it('decrypts loginId and transactionKey when reading from DB', async () => {
    const { PaymentSettingsService } = await import('./paymentSettings.service');
    prismaMock.uiSetting.findUnique.mockResolvedValue({
      value: {
        cashapp: { enabled: true, handle: '$x' },
        zelle: { enabled: false, handle: '' },
        venmo: { enabled: false, handle: '' },
        cc_payment: { enabled: true, loginId: 'enc:myLoginId', transactionKey: 'enc:myTxKey', sandboxMode: false },
      },
    });

    const result = await new PaymentSettingsService(TEST_KEY).getPaymentSettings();

    expect(result.cc_payment.loginId).toBe('myLoginId');
    expect(result.cc_payment.transactionKey).toBe('myTxKey');
  });

  it('skips decryption for empty credentials (e.g. when cc_payment is disabled)', async () => {
    const { PaymentSettingsService } = await import('./paymentSettings.service');
    prismaMock.uiSetting.findUnique.mockResolvedValue({
      value: {
        cashapp: { enabled: true, handle: '$x' },
        zelle: { enabled: false, handle: '' },
        venmo: { enabled: false, handle: '' },
        cc_payment: { enabled: false, loginId: '', transactionKey: '', sandboxMode: true },
      },
    });

    const result = await new PaymentSettingsService(TEST_KEY).getPaymentSettings();

    expect(result.cc_payment.loginId).toBe('');
    expect(result.cc_payment.transactionKey).toBe('');
  });
});
