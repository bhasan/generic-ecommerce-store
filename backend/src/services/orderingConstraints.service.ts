import { z } from 'zod';
import prisma from '../config/database';
import { getEffectiveStoreId, getTenantContext } from '../config/tenantContext';
import { SettingsStore, parseOrThrow } from './settingsStore';
import {
  extractAddressFromSettingsValue,
  extractZipCodeFromFreeformAddress,
  normalizeZipCode,
} from '../utils/address.util';

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

// Module-level cache shared across service instances, keyed by "${tenantId}:${effectiveStoreId}"
// so one store's offline ZIPs are never served to another store of the same tenant.
const _offlineZipsCache = new Map<string, { zips: string[]; expiresAt: number }>();

export function invalidateOfflineZipsCache(): void {
  _offlineZipsCache.clear();
}

export class OrderingConstraintsService {
  private async getOfflineZips(): Promise<string[]> {
    const ctx = getTenantContext();
    const effectiveStoreId = getEffectiveStoreId(ctx);
    const cacheKey = `${ctx?.tenantId ?? 0}:${effectiveStoreId}`;
    const now = Date.now();
    const hit = _offlineZipsCache.get(cacheKey);
    if (hit && now < hit.expiresAt) {
      return hit.zips;
    }
    // findMany retrieves both the tenant default (storeId=0) and the per-store
    // override in one query; the $extends interceptor injects tenantId automatically.
    const rows = await prisma.uiSetting.findMany({
      where: { key: 'store_settings', storeId: { in: [0, effectiveStoreId] } },
    });
    const overrideRow = rows.find((r) => r.storeId === effectiveStoreId);
    const defaultRow = rows.find((r) => r.storeId === 0);
    const address =
      extractAddressFromSettingsValue(overrideRow?.value) ||
      extractAddressFromSettingsValue(defaultRow?.value);
    const zip = extractZipCodeFromFreeformAddress(address);
    const zips = zip ? [zip] : [];
    _offlineZipsCache.set(cacheKey, { zips, expiresAt: now + OFFLINE_ZIPS_TTL_MS });
    return zips;
  }

  async getOrderingConstraints(): Promise<OrderingConstraints> {
    const row = await prisma.uiSetting.findFirst({
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
