import { z } from 'zod';
import { SettingsStore, parseOrThrow } from './settingsStore';
import { DeliveryEligibilityService, invalidateStoreAddressCache } from './deliveryEligibility.service';
import { invalidateOfflineZipsCache } from './orderingConstraints.service';
import { invalidateStoreNameCache } from './thermalPrinter.service';

export interface NotificationEmailRouting {
  adminEmail: string;
  managementEmail: string;
  employeeEmail: string;
}

export interface StoreSettings {
  name: string;
  address: string;
  phoneNumber: string;
  tagline: string;
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
  name: '',
  address: '',
  phoneNumber: '',
  tagline: '',
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

function normalize(
  data: Partial<StoreSettings> | null | undefined,
  options: { sanitizeInvalidEmails: boolean } = { sanitizeInvalidEmails: true },
): StoreSettings {
  const defaults = getDefaultStoreSettings();
  const { sanitizeInvalidEmails } = options;

  return {
    name: typeof data?.name === 'string' ? data.name : defaults.name,
    address: typeof data?.address === 'string' ? data.address : defaults.address,
    phoneNumber: typeof data?.phoneNumber === 'string' ? data.phoneNumber : defaults.phoneNumber,
    tagline: typeof data?.tagline === 'string' ? data.tagline : defaults.tagline,
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

const emailField = (fieldName: keyof NotificationEmailRouting) =>
  z
    .string(`Invalid store settings: ${fieldName} must be a string`)
    .max(254, `Invalid store settings: ${fieldName} must be 254 characters or fewer`)
    .refine((v) => v === '' || EMAIL_PATTERN.test(v), {
      message: `Invalid store settings: ${fieldName} must be a valid email`,
    });

const StoreSettingsSchema = z.object({
  name: z
    .string('Invalid store settings: name must be a string')
    .max(128, 'Invalid store settings: name must be 128 characters or fewer'),
  address: z
    .string('Invalid store settings: address must be a string')
    .max(256, 'Invalid store settings: address must be 256 characters or fewer'),
  phoneNumber: z
    .string('Invalid store settings: phoneNumber must be a string')
    .max(32, 'Invalid store settings: phoneNumber must be 32 characters or fewer'),
  tagline: z.string(),
  notificationEmails: z.object(
    {
      adminEmail: emailField('adminEmail'),
      managementEmail: emailField('managementEmail'),
      employeeEmail: emailField('employeeEmail'),
    },
    'Invalid store settings: notificationEmails must be an object',
  ),
});

const store = new SettingsStore<StoreSettings>({
  key: 'store_settings',
  schema: StoreSettingsSchema,
  defaults: getDefaultStoreSettings,
  onRead: (raw) => normalize(raw),
});

export class StoreSettingsService {
  async getStoreSettings(): Promise<StoreSettings> {
    return store.read();
  }

  async getNotificationEmailRouting(): Promise<NotificationEmailRouting> {
    const settings = await this.getStoreSettings();
    return settings.notificationEmails;
  }

  async updateStoreSettings(data: StoreSettings): Promise<StoreSettings> {
    const normalized = normalize(data, { sanitizeInvalidEmails: false });
    parseOrThrow(StoreSettingsSchema, normalized);
    const currentSettings = await this.getStoreSettings();
    if (currentSettings.address.trim() !== normalized.address.trim()) {
      await deliveryEligibilityService.verifyStoreAddress(normalized.address);
    }

    const written = await store.write(normalized);

    invalidateStoreAddressCache();
    invalidateOfflineZipsCache();
    invalidateStoreNameCache();

    return normalize(written);
  }
}
