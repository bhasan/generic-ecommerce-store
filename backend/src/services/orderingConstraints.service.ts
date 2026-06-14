import { z } from 'zod';
import prisma from '../config/database';
import { SettingsStore, parseOrThrow } from './settingsStore';
import { normalizeZipCode, extractZipCodeFromFreeformAddress } from '../utils/address.util';

const OrderingConstraintsSchema = z.object({
  minimumDeliveryOrder: z
    .number('Invalid ordering constraints: minimumDeliveryOrder must be a number')
    .min(0, 'Invalid ordering constraints: minimumDeliveryOrder must be 0 or greater'),
  minimumDeliveryOrderEnabled: z.boolean('Invalid ordering constraints: minimumDeliveryOrderEnabled must be a boolean'),
  deliveryDisabled: z.boolean('Invalid ordering constraints: deliveryDisabled must be a boolean'),
  deliveryDisabledMessage: z
    .string('Invalid ordering constraints: deliveryDisabledMessage must be a string')
    .max(300, 'Invalid ordering constraints: deliveryDisabledMessage cannot exceed 300 characters'),
  deliveryRadiusMiles: z
    .number('Invalid ordering constraints: deliveryRadiusMiles must be a number')
    .gt(0, 'Invalid ordering constraints: deliveryRadiusMiles must be greater than 0')
    .transform((v) => Number(v.toFixed(2))),
  offlineZipFallbackEnabled: z.boolean('Invalid ordering constraints: offlineZipFallbackEnabled must be a boolean'),
  offlineDeliveryZipCodes: z
    .array(
      z.string('Invalid ordering constraints: offlineDeliveryZipCodes entries must be strings'),
      'Invalid ordering constraints: offlineDeliveryZipCodes must be an array',
    )
    .transform((entries, ctx) => {
      const normalized: string[] = [];
      for (const entry of entries) {
        const normalizedZip = normalizeZipCode(entry);
        if (!normalizedZip) {
          ctx.addIssue({
            code: 'custom',
            message: `Invalid ordering constraints: "${entry}" is not a valid ZIP code`,
          });
          return z.NEVER;
        }
        normalized.push(normalizedZip);
      }
      return Array.from(new Set(normalized)).sort();
    }),
});

export type OrderingConstraints = z.infer<typeof OrderingConstraintsSchema>;

const DEFAULT_ORDERING_CONSTRAINTS: OrderingConstraints = {
  minimumDeliveryOrder: 35,
  minimumDeliveryOrderEnabled: true,
  deliveryDisabled: false,
  deliveryDisabledMessage: '',
  deliveryRadiusMiles: 5,
  offlineZipFallbackEnabled: true,
  offlineDeliveryZipCodes: [],
};

const store = new SettingsStore<OrderingConstraints>({
  key: 'ordering_constraints',
  schema: OrderingConstraintsSchema,
  defaults: DEFAULT_ORDERING_CONSTRAINTS,
});

const OFFLINE_ZIPS_TTL_MS = 5 * 60 * 1000;

// Module-level so all service instances share one cache.
let _cachedOfflineZips: string[] | null = null;
let _offlineZipsCacheExpiresAt = 0;

export function invalidateOfflineZipsCache(): void {
  _cachedOfflineZips = null;
}

export class OrderingConstraintsService {
  private async getOfflineZips(): Promise<string[]> {
    const now = Date.now();
    if (_cachedOfflineZips !== null && now < _offlineZipsCacheExpiresAt) {
      return _cachedOfflineZips;
    }
    const row = await prisma.uiSetting.findUnique({ where: { key: 'store_settings' } });
    const address = row && row.value && typeof (row.value as Record<string, unknown>).address === 'string'
      ? (row.value as Record<string, unknown>).address as string
      : null;
    const zip = extractZipCodeFromFreeformAddress(address);
    _cachedOfflineZips = zip ? [zip] : [];
    _offlineZipsCacheExpiresAt = now + OFFLINE_ZIPS_TTL_MS;
    return _cachedOfflineZips;
  }

  async getOrderingConstraints(): Promise<OrderingConstraints> {
    const row = await prisma.uiSetting.findUnique({
      where: { key: 'ordering_constraints' },
    });

    if (!row) {
      const offlineZips = await this.getOfflineZips();
      return { ...DEFAULT_ORDERING_CONSTRAINTS, offlineDeliveryZipCodes: offlineZips };
    }

    return parseOrThrow(OrderingConstraintsSchema, {
      ...DEFAULT_ORDERING_CONSTRAINTS,
      ...(row.value && typeof row.value === 'object' ? row.value : {}),
    });
  }

  async updateOrderingConstraints(data: Partial<OrderingConstraints>): Promise<OrderingConstraints> {
    return store.write({ ...DEFAULT_ORDERING_CONSTRAINTS, ...data });
  }
}
