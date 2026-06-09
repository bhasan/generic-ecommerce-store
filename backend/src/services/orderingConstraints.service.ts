import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { normalizeZipCode, extractZipCodeFromFreeformAddress } from '../utils/address.util';

export interface OrderingConstraints {
  minimumDeliveryOrder: number;
  minimumDeliveryOrderEnabled: boolean;
  deliveryDisabled: boolean;
  deliveryDisabledMessage: string;
  deliveryRadiusMiles: number;
  offlineZipFallbackEnabled: boolean;
  offlineDeliveryZipCodes: string[];
}

const DEFAULT_ORDERING_CONSTRAINTS: OrderingConstraints = {
  minimumDeliveryOrder: 35,
  minimumDeliveryOrderEnabled: true,
  deliveryDisabled: false,
  deliveryDisabledMessage: '',
  deliveryRadiusMiles: 5,
  offlineZipFallbackEnabled: true,
  offlineDeliveryZipCodes: [],
};

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

    return this.normalize(row.value);
  }

  async updateOrderingConstraints(data: Partial<OrderingConstraints>): Promise<OrderingConstraints> {
    const normalized = this.normalize(data);

    const row = await prisma.uiSetting.upsert({
      where: { key: 'ordering_constraints' },
      update: { value: normalized as object },
      create: { key: 'ordering_constraints', value: normalized as object },
    });

    return this.normalize(row.value);
  }

  private normalize(data: unknown): OrderingConstraints {
    const raw = this.validate(data);
    return {
      minimumDeliveryOrder: raw.minimumDeliveryOrder,
      minimumDeliveryOrderEnabled: raw.minimumDeliveryOrderEnabled,
      deliveryDisabled: raw.deliveryDisabled,
      deliveryDisabledMessage: raw.deliveryDisabledMessage,
      deliveryRadiusMiles: raw.deliveryRadiusMiles,
      offlineZipFallbackEnabled: raw.offlineZipFallbackEnabled,
      offlineDeliveryZipCodes: raw.offlineDeliveryZipCodes,
    };
  }

  private validate(data: unknown): OrderingConstraints {
    const merged = {
      ...DEFAULT_ORDERING_CONSTRAINTS,
      ...((data && typeof data === 'object') ? data : {}),
    } as Partial<OrderingConstraints>;

    if (typeof merged.minimumDeliveryOrder !== 'number') {
      throw new AppError('Invalid ordering constraints: minimumDeliveryOrder must be a number', 400);
    }
    if (merged.minimumDeliveryOrder < 0) {
      throw new AppError('Invalid ordering constraints: minimumDeliveryOrder must be 0 or greater', 400);
    }
    if (typeof merged.minimumDeliveryOrderEnabled !== 'boolean') {
      throw new AppError('Invalid ordering constraints: minimumDeliveryOrderEnabled must be a boolean', 400);
    }
    if (typeof merged.deliveryDisabled !== 'boolean') {
      throw new AppError('Invalid ordering constraints: deliveryDisabled must be a boolean', 400);
    }
    if (typeof merged.deliveryDisabledMessage !== 'string') {
      throw new AppError('Invalid ordering constraints: deliveryDisabledMessage must be a string', 400);
    }
    if (merged.deliveryDisabledMessage.length > 300) {
      throw new AppError('Invalid ordering constraints: deliveryDisabledMessage cannot exceed 300 characters', 400);
    }
    if (typeof merged.deliveryRadiusMiles !== 'number') {
      throw new AppError('Invalid ordering constraints: deliveryRadiusMiles must be a number', 400);
    }
    if (merged.deliveryRadiusMiles <= 0) {
      throw new AppError('Invalid ordering constraints: deliveryRadiusMiles must be greater than 0', 400);
    }
    if (typeof merged.offlineZipFallbackEnabled !== 'boolean') {
      throw new AppError('Invalid ordering constraints: offlineZipFallbackEnabled must be a boolean', 400);
    }

    const rawZipCodes = merged.offlineDeliveryZipCodes;
    if (!Array.isArray(rawZipCodes)) {
      throw new AppError('Invalid ordering constraints: offlineDeliveryZipCodes must be an array', 400);
    }

    const normalizedZipCodes = rawZipCodes.map((entry) => {
      if (typeof entry !== 'string') {
        throw new AppError('Invalid ordering constraints: offlineDeliveryZipCodes entries must be strings', 400);
      }

      const normalizedZip = normalizeZipCode(entry);
      if (!normalizedZip) {
        throw new AppError(`Invalid ordering constraints: "${entry}" is not a valid ZIP code`, 400);
      }

      return normalizedZip;
    });

    return {
      minimumDeliveryOrder: merged.minimumDeliveryOrder,
      minimumDeliveryOrderEnabled: merged.minimumDeliveryOrderEnabled,
      deliveryDisabled: merged.deliveryDisabled,
      deliveryDisabledMessage: merged.deliveryDisabledMessage,
      deliveryRadiusMiles: Number(merged.deliveryRadiusMiles.toFixed(2)),
      offlineZipFallbackEnabled: merged.offlineZipFallbackEnabled,
      offlineDeliveryZipCodes: Array.from(new Set(normalizedZipCodes)).sort(),
    };
  }
}
