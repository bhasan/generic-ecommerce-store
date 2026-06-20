import { z } from 'zod';
import { SettingsStore } from './settingsStore';
import { encrypt, decrypt } from '../utils/crypto.util';
import { logger } from '../utils/logger';

/**
 * Decrypt a stored credential, failing closed: if the value is empty or cannot be
 * decrypted (e.g. legacy plaintext written before encryption, or a wrong/rotated key),
 * return '' rather than throwing. This keeps the public /api/config endpoint and
 * checkout up; a loud warning tells operators to re-enter credentials.
 */
function safeDecrypt(value: string, key: string, field: string): string {
  if (!value) return '';
  try {
    return decrypt(value, key);
  } catch {
    logger.warn('Stored CC credential could not be decrypted — treating as unconfigured', { field });
    return '';
  }
}

const PaymentMethodSchema = z.object({
  enabled: z.boolean(),
  handle: z.string().max(64),
});

const CCPaymentSchema = z.object({
  enabled: z.boolean(),
  loginId: z.string().max(64),
  transactionKey: z.string().max(64),
  sandboxMode: z.boolean(),
});

const PaymentSettingsSchema = z
  .object({
    cashapp: PaymentMethodSchema,
    zelle: PaymentMethodSchema,
    venmo: PaymentMethodSchema,
    cc_payment: CCPaymentSchema,
  })
  .superRefine((data, ctx) => {
    if (data.cashapp.enabled && data.cashapp.handle && !data.cashapp.handle.startsWith('$')) {
      ctx.addIssue({ code: 'custom', message: 'CashApp handle must start with $', path: ['cashapp', 'handle'] });
    }
    if (data.cc_payment.enabled) {
      if (!data.cc_payment.loginId || data.cc_payment.loginId.trim().length === 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'cc_payment.loginId is required when card payments are enabled',
          path: ['cc_payment', 'loginId'],
        });
      }
      if (!data.cc_payment.transactionKey || data.cc_payment.transactionKey.trim().length === 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'cc_payment.transactionKey is required when card payments are enabled',
          path: ['cc_payment', 'transactionKey'],
        });
      }
    }
  });

export type CCPaymentSettings = z.infer<typeof CCPaymentSchema>;
export type PaymentSettings = z.infer<typeof PaymentSettingsSchema>;

const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  cashapp: { enabled: true, handle: '' },
  zelle: { enabled: false, handle: '' },
  venmo: { enabled: false, handle: '' },
  cc_payment: { enabled: false, loginId: '', transactionKey: '', sandboxMode: true },
};

export class PaymentSettingsService {
  private readonly store: SettingsStore<PaymentSettings>;

  constructor(encryptionKey?: string) {
    const key = encryptionKey ?? process.env.PAYMENT_ENCRYPTION_KEY ?? '';
    if (!key) {
      throw new Error('PAYMENT_ENCRYPTION_KEY must be set');
    }
    this.store = new SettingsStore<PaymentSettings>({
      key: 'payment_settings',
      schema: PaymentSettingsSchema,
      defaults: DEFAULT_PAYMENT_SETTINGS,
      onRead: (raw) => {
        const cc = { ...DEFAULT_PAYMENT_SETTINGS.cc_payment, ...raw.cc_payment };
        return {
          ...raw,
          cc_payment: {
            ...cc,
            loginId: safeDecrypt(cc.loginId, key, 'loginId'),
            transactionKey: safeDecrypt(cc.transactionKey, key, 'transactionKey'),
          },
        };
      },
      onWrite: (data) => ({
        ...data,
        cc_payment: {
          ...data.cc_payment,
          loginId: data.cc_payment.loginId ? encrypt(data.cc_payment.loginId, key) : '',
          transactionKey: data.cc_payment.transactionKey ? encrypt(data.cc_payment.transactionKey, key) : '',
        },
      }),
    });
  }

  async getPaymentSettings(): Promise<PaymentSettings> {
    return this.store.read();
  }

  async updatePaymentSettings(data: PaymentSettings): Promise<PaymentSettings> {
    return this.store.write(data);
  }
}
