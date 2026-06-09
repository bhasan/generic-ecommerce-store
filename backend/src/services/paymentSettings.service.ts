import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';

export interface PaymentMethodSettings {
  enabled: boolean;
  handle: string;
}

export interface PaymentSettings {
  cashapp: PaymentMethodSettings;
  zelle: PaymentMethodSettings;
  venmo: PaymentMethodSettings;
}

const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  cashapp: { enabled: true, handle: '' },
  zelle: { enabled: false, handle: '' },
  venmo: { enabled: false, handle: '' },
};

export class PaymentSettingsService {
  async getPaymentSettings(): Promise<PaymentSettings> {
    const row = await prisma.uiSetting.findUnique({
      where: { key: 'payment_settings' },
    });

    if (!row) {
      return DEFAULT_PAYMENT_SETTINGS;
    }

    return row.value as unknown as PaymentSettings;
  }

  async updatePaymentSettings(data: PaymentSettings): Promise<PaymentSettings> {
    this.validate(data);

    const row = await prisma.uiSetting.upsert({
      where: { key: 'payment_settings' },
      update: { value: data as object },
      create: { key: 'payment_settings', value: data as object },
    });

    return row.value as unknown as PaymentSettings;
  }

  private validate(data: PaymentSettings): void {
    const methods = ['cashapp', 'zelle', 'venmo'] as const;

    for (const method of methods) {
      const entry = data[method];
      if (!entry || typeof entry.enabled !== 'boolean') {
        throw new AppError(`Invalid payment settings: ${method}.enabled must be a boolean`, 400);
      }
      if (typeof entry.handle !== 'string') {
        throw new AppError(`Invalid payment settings: ${method}.handle must be a string`, 400);
      }
      if (entry.handle.length > 64) {
        throw new AppError(`Invalid payment settings: ${method}.handle must be 64 characters or fewer`, 400);
      }
      if (method === 'cashapp' && entry.enabled && entry.handle && !entry.handle.startsWith('$')) {
        throw new AppError('CashApp handle must start with $', 400);
      }
    }
  }
}
