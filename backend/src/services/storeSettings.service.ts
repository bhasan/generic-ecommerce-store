import { z } from 'zod';
import { SettingsStore, parseOrThrow } from './settingsStore';
import { DeliveryEligibilityService, invalidateStoreAddressCache } from './deliveryEligibility.service';
import { invalidateOfflineZipsCache } from './orderingConstraints.service';
import { invalidateStoreNameCache } from './thermalPrinter.service';
import { encrypt, decrypt } from '../utils/crypto.util';
import { logger } from '../utils/logger';

export interface NotificationEmailRouting {
  adminEmail: string;
  managementEmail: string;
  employeeEmail: string;
}

export interface PosConfig {
  baseUrl?: string;
  username?: string;
  password?: string;
  apiKey?: string;
  sakCatchAllProductId?: number;
  sakCatchAllVariantId?: number;
}

export interface StoreSettings {
  name: string;
  address: string;
  phoneNumber: string;
  tagline: string;
  notificationEmails: NotificationEmailRouting;
  posProvider: string | null;
  posConfig: PosConfig;
}

function safePosDecrypt(value: string | undefined, key: string, field: string): string | undefined {
  if (!value) return undefined;
  try {
    return decrypt(value, key);
  } catch {
    logger.warn('Stored POS credential could not be decrypted — treating as unconfigured', { field });
    return undefined;
  }
}

const POS_ENCRYPTION_KEY = process.env.POS_ENCRYPTION_KEY ?? '';

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
  posProvider: null,
  posConfig: {},
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
    posProvider: data?.posProvider ?? null,
    posConfig: {
      baseUrl: data?.posConfig?.baseUrl,
      username: data?.posConfig?.username,
      password: data?.posConfig?.password,
      apiKey: data?.posConfig?.apiKey,
      sakCatchAllProductId: data?.posConfig?.sakCatchAllProductId,
      sakCatchAllVariantId: data?.posConfig?.sakCatchAllVariantId,
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
  posProvider: z.string().nullable().default(null),
  posConfig: z.object({
    baseUrl: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    apiKey: z.string().optional(),
    sakCatchAllProductId: z.number().int().optional(),
    sakCatchAllVariantId: z.number().int().optional(),
  }).default({}),
});

const store = new SettingsStore<StoreSettings>({
  key: 'store_settings',
  schema: StoreSettingsSchema,
  defaults: getDefaultStoreSettings,
  onRead: (raw) => {
    const normalized = normalize(raw);
    if (!POS_ENCRYPTION_KEY) return normalized;
    return {
      ...normalized,
      posConfig: {
        ...normalized.posConfig,
        username: safePosDecrypt(normalized.posConfig.username, POS_ENCRYPTION_KEY, 'username'),
        password: safePosDecrypt(normalized.posConfig.password, POS_ENCRYPTION_KEY, 'password'),
        apiKey: safePosDecrypt(normalized.posConfig.apiKey, POS_ENCRYPTION_KEY, 'apiKey'),
      },
    };
  },
  onWrite: (data) => {
    if (!POS_ENCRYPTION_KEY) return data;
    return {
      ...data,
      posConfig: {
        ...data.posConfig,
        username: data.posConfig.username ? encrypt(data.posConfig.username, POS_ENCRYPTION_KEY) : undefined,
        password: data.posConfig.password ? encrypt(data.posConfig.password, POS_ENCRYPTION_KEY) : undefined,
        apiKey: data.posConfig.apiKey ? encrypt(data.posConfig.apiKey, POS_ENCRYPTION_KEY) : undefined,
      },
    };
  },
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
