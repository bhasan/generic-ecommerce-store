import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { DeliveryEligibilityService } from './deliveryEligibility.service';

export interface NotificationEmailRouting {
  adminEmail: string;
  managementEmail: string;
  employeeEmail: string;
}

export interface StoreSettings {
  name: string;
  address: string;
  phoneNumber: string;
  notificationEmails: NotificationEmailRouting;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ADMIN_EMAIL_FALLBACK_ENV_KEYS = [
  'STORE_SUPPORT_EMAIL',
  'SUPPORT_EMAIL',
  'ADMIN_ALERT_EMAIL',
  'ADMIN_EMAIL',
] as const;

const resolveDefaultAdminNotificationEmail = () => {
  for (const key of ADMIN_EMAIL_FALLBACK_ENV_KEYS) {
    const rawValue = process.env[key];
    if (typeof rawValue !== 'string') continue;
    const value = rawValue.trim();
    if (!value) continue;
    if (EMAIL_PATTERN.test(value)) {
      return value;
    }
  }

  return '';
};

const getDefaultNotificationEmailRouting = (): NotificationEmailRouting => ({
  adminEmail: resolveDefaultAdminNotificationEmail(),
  managementEmail: '',
  employeeEmail: '',
});

const getDefaultStoreSettings = (): StoreSettings => ({
  name: 'Smoke Station',
  address: '9400 S Texas 6 Suite C, Houston, TX 77083',
  phoneNumber: '',
  notificationEmails: getDefaultNotificationEmailRouting(),
});

const deliveryEligibilityService = new DeliveryEligibilityService();

const normalizeEmailField = (
  value: unknown,
  fallback: string,
  sanitizeInvalid: boolean,
) => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (EMAIL_PATTERN.test(trimmed)) return trimmed;
  return sanitizeInvalid ? fallback : trimmed;
};

export class StoreSettingsService {
  private normalize(
    data: Partial<StoreSettings> | null | undefined,
    options: { sanitizeInvalidEmails: boolean } = { sanitizeInvalidEmails: true },
  ): StoreSettings {
    const defaults = getDefaultStoreSettings();
    const { sanitizeInvalidEmails } = options;

    return {
      name: typeof data?.name === 'string' ? data.name : defaults.name,
      address: typeof data?.address === 'string' ? data.address : defaults.address,
      phoneNumber: typeof data?.phoneNumber === 'string' ? data.phoneNumber : defaults.phoneNumber,
      notificationEmails: {
        adminEmail: normalizeEmailField(
          data?.notificationEmails?.adminEmail,
          defaults.notificationEmails.adminEmail,
          sanitizeInvalidEmails,
        ),
        managementEmail: normalizeEmailField(
          data?.notificationEmails?.managementEmail,
          defaults.notificationEmails.managementEmail,
          sanitizeInvalidEmails,
        ),
        employeeEmail: normalizeEmailField(
          data?.notificationEmails?.employeeEmail,
          defaults.notificationEmails.employeeEmail,
          sanitizeInvalidEmails,
        ),
      },
    };
  }

  async getStoreSettings(): Promise<StoreSettings> {
    const row = await prisma.uiSetting.findUnique({
      where: { key: 'store_settings' },
    });

    if (!row) {
      return getDefaultStoreSettings();
    }

    return this.normalize(row.value as Partial<StoreSettings>);
  }

  async getNotificationEmailRouting(): Promise<NotificationEmailRouting> {
    const settings = await this.getStoreSettings();
    return settings.notificationEmails;
  }

  async updateStoreSettings(data: StoreSettings): Promise<StoreSettings> {
    const normalized = this.normalize(data, { sanitizeInvalidEmails: false });
    this.validate(normalized);
    const currentSettings = await this.getStoreSettings();
    if (currentSettings.address.trim() !== normalized.address.trim()) {
      await deliveryEligibilityService.verifyStoreAddress(normalized.address);
    }

    const row = await prisma.uiSetting.upsert({
      where: { key: 'store_settings' },
      update: { value: normalized as object },
      create: { key: 'store_settings', value: normalized as object },
    });

    return this.normalize(row.value as Partial<StoreSettings>);
  }

  private validate(data: StoreSettings): void {
    if (!data || typeof data.name !== 'string') {
      throw new AppError('Invalid store settings: name must be a string', 400);
    }
    if (typeof data.address !== 'string') {
      throw new AppError('Invalid store settings: address must be a string', 400);
    }
    if (typeof data.phoneNumber !== 'string') {
      throw new AppError('Invalid store settings: phoneNumber must be a string', 400);
    }
    if (data.name.length > 128) {
      throw new AppError('Invalid store settings: name must be 128 characters or fewer', 400);
    }
    if (!data.name.trim()) {
      throw new AppError('Invalid store settings: name is required', 400);
    }
    if (data.address.length > 256) {
      throw new AppError('Invalid store settings: address must be 256 characters or fewer', 400);
    }
    if (!data.address.trim()) {
      throw new AppError('Invalid store settings: address is required', 400);
    }
    if (data.phoneNumber.length > 32) {
      throw new AppError('Invalid store settings: phoneNumber must be 32 characters or fewer', 400);
    }
    if (!data.notificationEmails || typeof data.notificationEmails !== 'object') {
      throw new AppError('Invalid store settings: notificationEmails must be an object', 400);
    }

    const validateEmailField = (fieldName: keyof NotificationEmailRouting) => {
      const value = data.notificationEmails[fieldName];
      if (typeof value !== 'string') {
        throw new AppError(`Invalid store settings: ${fieldName} must be a string`, 400);
      }
      if (value.length > 254) {
        throw new AppError(`Invalid store settings: ${fieldName} must be 254 characters or fewer`, 400);
      }
      if (value && !EMAIL_PATTERN.test(value)) {
        throw new AppError(`Invalid store settings: ${fieldName} must be a valid email`, 400);
      }
    };

    validateEmailField('adminEmail');
    validateEmailField('managementEmail');
    validateEmailField('employeeEmail');
  }
}
