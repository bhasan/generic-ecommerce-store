import { DeliveryEligibilitySource, DeliveryZoneStatus } from '../../generated/prisma';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import {
  extractZipCodeFromFreeformAddress,
  formatStructuredDeliveryAddress,
  getStructuredDeliveryAddressCacheKey,
  isStructuredDeliveryAddressComplete,
  normalizeAddressCacheKey,
  normalizeStructuredDeliveryAddress,
  StructuredDeliveryAddress,
} from '../utils/address.util';
import { logger } from '../utils/logger';
import { OrderingConstraints, OrderingConstraintsService } from './orderingConstraints.service';

const GOOGLE_GEOCODING_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const DEFAULT_GEOCODING_TIMEOUT_MS = 5000;
const DEFAULT_STORE_ADDRESS = '9400 S Texas 6 Suite C, Houston, TX 77083';

const orderingConstraintsService = new OrderingConstraintsService();

type ResolvedAddress = {
  kind: 'resolved';
  source: DeliveryEligibilitySource;
  latitude: number;
  longitude: number;
  formattedAddress: string;
  city: string | null;
  state: string | null;
  zipCode: string | null;
};

type ProviderUnavailableAddress = {
  kind: 'provider_unavailable';
  zipCode: string | null;
  reason: string;
};

type InvalidAddress = {
  kind: 'invalid_address' | 'no_results';
  zipCode: string | null;
  reason: string;
};

type AddressResolution = ResolvedAddress | ProviderUnavailableAddress | InvalidAddress;

export interface DeliveryEligibilityResult {
  deliverable: boolean;
  deliveryZoneStatus: DeliveryZoneStatus;
  deliveryZoneSource: DeliveryEligibilitySource;
  distanceMiles: number | null;
  thresholdMiles: number;
  message: string;
  canonicalAddress: string | null;
  checkedAt: Date;
}

export interface DeliveryZoneMetadata {
  deliveryZoneStatus: DeliveryZoneStatus;
  deliveryZoneSource: DeliveryEligibilitySource;
  deliveryZoneDistanceMiles: number | null;
  deliveryZoneCheckedAt: Date;
}

interface ParsedGoogleResult {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  aliasCacheKeys: string[];
}

const roundMiles = (value: number | null): number | null => (
  typeof value === 'number'
    ? Number(value.toFixed(2))
    : null
);

const haversineMiles = (
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number
): number => {
  const toRadians = (degrees: number) => degrees * (Math.PI / 180);
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(toLatitude - fromLatitude);
  const dLon = toRadians(toLongitude - fromLongitude);
  const lat1 = toRadians(fromLatitude);
  const lat2 = toRadians(toLatitude);

  const a = (
    Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2)
  );
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMiles * c;
};

export class DeliveryEligibilityService {
  async checkDeliveryEligibility(deliveryAddress: StructuredDeliveryAddress): Promise<DeliveryEligibilityResult> {
    const constraints = await orderingConstraintsService.getOrderingConstraints();
    return this.evaluateStructuredAddress(deliveryAddress, constraints);
  }

  async evaluateRegistrationAddress(address?: string | null): Promise<DeliveryZoneMetadata | null> {
    const trimmedAddress = address?.trim();
    if (!trimmedAddress) {
      return null;
    }

    const constraints = await orderingConstraintsService.getOrderingConstraints();
    const result = await this.evaluateFreeformAddress(trimmedAddress, constraints);

    return {
      deliveryZoneStatus: result.deliveryZoneStatus,
      deliveryZoneSource: result.deliveryZoneSource,
      deliveryZoneDistanceMiles: result.distanceMiles,
      deliveryZoneCheckedAt: result.checkedAt,
    };
  }

  async verifyStoreAddress(address: string): Promise<void> {
    const trimmedAddress = address.trim();
    if (!trimmedAddress) {
      throw new AppError(
        'Invalid store settings: address is required so delivery origin can be verified',
        400,
        'INVALID_STORE_SETTINGS'
      );
    }

    const resolution = await this.resolveFreeformAddress(trimmedAddress);
    if (resolution.kind === 'resolved') {
      return;
    }

    if (resolution.kind === 'provider_unavailable') {
      throw new AppError(
        'Invalid store settings: the address could not be verified because Google Geocoding is unavailable and this address is not cached yet',
        400,
        'STORE_ADDRESS_UNVERIFIED'
      );
    }

    throw new AppError(
      'Invalid store settings: the address could not be verified. Please save a valid address before enabling delivery.',
      400,
      'STORE_ADDRESS_UNVERIFIED'
    );
  }

  private async evaluateStructuredAddress(
    deliveryAddress: StructuredDeliveryAddress,
    constraints: OrderingConstraints
  ): Promise<DeliveryEligibilityResult> {
    const normalizedAddress = normalizeStructuredDeliveryAddress(deliveryAddress);
    const canonicalAddress = formatStructuredDeliveryAddress(normalizedAddress);
    const checkedAt = new Date();

    if (!isStructuredDeliveryAddressComplete(normalizedAddress)) {
      return {
        deliverable: false,
        deliveryZoneStatus: DeliveryZoneStatus.UNVERIFIED,
        deliveryZoneSource: DeliveryEligibilitySource.NONE,
        distanceMiles: null,
        thresholdMiles: constraints.deliveryRadiusMiles,
        message: 'Enter your full delivery address so we can verify eligibility.',
        canonicalAddress,
        checkedAt,
      };
    }

    const addressResolution = await this.resolveStructuredAddress(normalizedAddress);
    return this.finalizeEligibilityResult({
      constraints,
      canonicalAddress,
      checkedAt,
      addressResolution,
    });
  }

  private async evaluateFreeformAddress(
    address: string,
    constraints: OrderingConstraints
  ): Promise<DeliveryEligibilityResult> {
    const checkedAt = new Date();
    const addressResolution = await this.resolveFreeformAddress(address);

    return this.finalizeEligibilityResult({
      constraints,
      canonicalAddress: address,
      checkedAt,
      addressResolution,
    });
  }

  private async finalizeEligibilityResult({
    constraints,
    canonicalAddress,
    checkedAt,
    addressResolution,
  }: {
    constraints: OrderingConstraints;
    canonicalAddress: string;
    checkedAt: Date;
    addressResolution: AddressResolution;
  }): Promise<DeliveryEligibilityResult> {
    if (addressResolution.kind === 'provider_unavailable') {
      return this.resolveZipFallbackResult({
        constraints,
        zipCode: addressResolution.zipCode,
        canonicalAddress,
        checkedAt,
        reason: addressResolution.reason,
      });
    }

    if (addressResolution.kind !== 'resolved') {
      const message = addressResolution.kind === 'no_results'
        ? 'We could not match that delivery address. Please double-check the address details.'
        : 'We could not verify that delivery address. Please double-check the address details.';

      return {
        deliverable: false,
        deliveryZoneStatus: DeliveryZoneStatus.UNVERIFIED,
        deliveryZoneSource: DeliveryEligibilitySource.NONE,
        distanceMiles: null,
        thresholdMiles: constraints.deliveryRadiusMiles,
        message,
        canonicalAddress,
        checkedAt,
      };
    }

    const storeResolution = await this.resolveStoreOriginAddress();

    if (storeResolution.kind === 'provider_unavailable') {
      return this.resolveZipFallbackResult({
        constraints,
        zipCode: addressResolution.zipCode,
        canonicalAddress,
        checkedAt,
        reason: storeResolution.reason,
      });
    }

    if (storeResolution.kind !== 'resolved') {
      return {
        deliverable: false,
        deliveryZoneStatus: DeliveryZoneStatus.UNVERIFIED,
        deliveryZoneSource: DeliveryEligibilitySource.NONE,
        distanceMiles: null,
        thresholdMiles: constraints.deliveryRadiusMiles,
        message: 'Delivery verification is temporarily unavailable. Please contact the store for help.',
        canonicalAddress,
        checkedAt,
      };
    }

    const distanceMiles = roundMiles(haversineMiles(
      storeResolution.latitude,
      storeResolution.longitude,
      addressResolution.latitude,
      addressResolution.longitude
    ));

    const inZone = typeof distanceMiles === 'number' && distanceMiles <= constraints.deliveryRadiusMiles;

    return {
      deliverable: inZone,
      deliveryZoneStatus: inZone ? DeliveryZoneStatus.IN_ZONE : DeliveryZoneStatus.OUT_OF_ZONE,
      deliveryZoneSource: addressResolution.source,
      distanceMiles,
      thresholdMiles: constraints.deliveryRadiusMiles,
      message: inZone
        ? `Delivery available. This address is ${distanceMiles?.toFixed(2)} miles from the store.`
        : `This address is ${distanceMiles?.toFixed(2)} miles away, outside the ${constraints.deliveryRadiusMiles.toFixed(2)} mile delivery radius.`,
      canonicalAddress,
      checkedAt,
    };
  }

  private resolveZipFallbackResult({
    constraints,
    zipCode,
    canonicalAddress,
    checkedAt,
    reason,
  }: {
    constraints: OrderingConstraints;
    zipCode: string | null;
    canonicalAddress: string;
    checkedAt: Date;
    reason: string;
  }): DeliveryEligibilityResult {
    if (!constraints.offlineZipFallbackEnabled) {
      return {
        deliverable: false,
        deliveryZoneStatus: DeliveryZoneStatus.UNVERIFIED,
        deliveryZoneSource: DeliveryEligibilitySource.NONE,
        distanceMiles: null,
        thresholdMiles: constraints.deliveryRadiusMiles,
        message: 'Delivery verification is temporarily unavailable. Please try again shortly.',
        canonicalAddress,
        checkedAt,
      };
    }

    if (!zipCode) {
      return {
        deliverable: false,
        deliveryZoneStatus: DeliveryZoneStatus.UNVERIFIED,
        deliveryZoneSource: DeliveryEligibilitySource.NONE,
        distanceMiles: null,
        thresholdMiles: constraints.deliveryRadiusMiles,
        message: 'Delivery verification is temporarily unavailable, and we could not extract a ZIP code from this address.',
        canonicalAddress,
        checkedAt,
      };
    }

    const deliverable = constraints.offlineDeliveryZipCodes.includes(zipCode);
    logger.warn('Delivery eligibility ZIP fallback used', {
      zipCode,
      reason,
      deliverable,
    });

    return {
      deliverable,
      deliveryZoneStatus: deliverable ? DeliveryZoneStatus.IN_ZONE : DeliveryZoneStatus.OUT_OF_ZONE,
      deliveryZoneSource: DeliveryEligibilitySource.ZIP_FALLBACK,
      distanceMiles: null,
      thresholdMiles: constraints.deliveryRadiusMiles,
      message: deliverable
        ? 'Delivery verified by ZIP fallback while Google address verification is temporarily unavailable.'
        : 'This ZIP code is outside the store delivery fallback area.',
      canonicalAddress,
      checkedAt,
    };
  }

  private async resolveStoreOriginAddress(): Promise<AddressResolution> {
    const row = await prisma.uiSetting.findUnique({
      where: { key: 'store_settings' },
    });

    const address = (
      row?.value
      && typeof row.value === 'object'
      && typeof (row.value as { address?: unknown }).address === 'string'
    )
      ? (row.value as { address: string }).address
      : DEFAULT_STORE_ADDRESS;

    return this.resolveFreeformAddress(address);
  }

  private async resolveStructuredAddress(address: StructuredDeliveryAddress): Promise<AddressResolution> {
    const formattedAddress = formatStructuredDeliveryAddress(address);
    return this.resolveAddress({
      cacheKeys: [getStructuredDeliveryAddressCacheKey(address)],
      lookupAddress: formattedAddress,
      fallbackZipCode: address.zipCode,
    });
  }

  private async resolveFreeformAddress(address: string): Promise<AddressResolution> {
    const trimmedAddress = address.trim();
    const cacheKey = normalizeAddressCacheKey(trimmedAddress);
    return this.resolveAddress({
      cacheKeys: [cacheKey],
      lookupAddress: trimmedAddress,
      fallbackZipCode: extractZipCodeFromFreeformAddress(trimmedAddress),
    });
  }

  private async resolveAddress({
    cacheKeys,
    lookupAddress,
    fallbackZipCode,
  }: {
    cacheKeys: string[];
    lookupAddress: string;
    fallbackZipCode: string | null;
  }): Promise<AddressResolution> {
    for (const cacheKey of cacheKeys) {
      const cached = await prisma.addressGeocodeCache.findUnique({
        where: { normalizedAddress: cacheKey },
      });

      if (cached) {
        return {
          kind: 'resolved',
          source: DeliveryEligibilitySource.ADDRESS_CACHE,
          latitude: cached.latitude,
          longitude: cached.longitude,
          formattedAddress: cached.formattedAddress,
          city: cached.city,
          state: cached.state,
          zipCode: cached.zipCode,
        };
      }
    }

    return this.geocodeAddress({
      cacheKeys,
      lookupAddress,
      fallbackZipCode,
    });
  }

  private async geocodeAddress({
    cacheKeys,
    lookupAddress,
    fallbackZipCode,
  }: {
    cacheKeys: string[];
    lookupAddress: string;
    fallbackZipCode: string | null;
  }): Promise<AddressResolution> {
    const apiKey = process.env.GOOGLE_GEOCODING_API_KEY?.trim();
    if (!apiKey) {
      return {
        kind: 'provider_unavailable',
        zipCode: fallbackZipCode,
        reason: 'missing_api_key',
      };
    }

    const timeoutMs = Number(process.env.GOOGLE_GEOCODING_TIMEOUT_MS || DEFAULT_GEOCODING_TIMEOUT_MS);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(
        `${GOOGLE_GEOCODING_URL}?address=${encodeURIComponent(lookupAddress)}&key=${encodeURIComponent(apiKey)}`,
        { signal: controller.signal }
      );

      const payload = await response.json() as Record<string, unknown>;

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          return { kind: 'provider_unavailable', zipCode: fallbackZipCode, reason: 'auth_failure' };
        }
        if (response.status === 429) {
          return { kind: 'provider_unavailable', zipCode: fallbackZipCode, reason: 'quota_exhausted' };
        }
        if (response.status >= 500) {
          return { kind: 'provider_unavailable', zipCode: fallbackZipCode, reason: 'google_5xx' };
        }
        return { kind: 'invalid_address', zipCode: fallbackZipCode, reason: `http_${response.status}` };
      }

      const status = typeof payload.status === 'string' ? payload.status : 'UNKNOWN';
      if (status === 'OK') {
        const firstResult = Array.isArray(payload.results) ? payload.results[0] : null;
        const parsed = this.parseGoogleResult(firstResult, lookupAddress);
        if (!parsed) {
          return { kind: 'no_results', zipCode: fallbackZipCode, reason: 'missing_coordinates' };
        }

        const allCacheKeys = Array.from(new Set([...cacheKeys, ...parsed.aliasCacheKeys]));
        await Promise.all(allCacheKeys.map((cacheKey) => prisma.addressGeocodeCache.upsert({
          where: { normalizedAddress: cacheKey },
          update: {
            formattedAddress: parsed.formattedAddress,
            latitude: parsed.latitude,
            longitude: parsed.longitude,
            city: parsed.city,
            state: parsed.state,
            zipCode: parsed.zipCode,
          },
          create: {
            normalizedAddress: cacheKey,
            formattedAddress: parsed.formattedAddress,
            latitude: parsed.latitude,
            longitude: parsed.longitude,
            city: parsed.city,
            state: parsed.state,
            zipCode: parsed.zipCode,
          },
        })));

        return {
          kind: 'resolved',
          source: DeliveryEligibilitySource.GOOGLE_GEOCODING,
          latitude: parsed.latitude,
          longitude: parsed.longitude,
          formattedAddress: parsed.formattedAddress,
          city: parsed.city,
          state: parsed.state,
          zipCode: parsed.zipCode || fallbackZipCode,
        };
      }

      if (status === 'ZERO_RESULTS') {
        return { kind: 'no_results', zipCode: fallbackZipCode, reason: 'zero_results' };
      }

      if (status === 'INVALID_REQUEST') {
        return { kind: 'invalid_address', zipCode: fallbackZipCode, reason: 'invalid_request' };
      }

      if (
        status === 'REQUEST_DENIED'
        || status === 'OVER_DAILY_LIMIT'
        || status === 'OVER_QUERY_LIMIT'
        || status === 'UNKNOWN_ERROR'
      ) {
        const reason = typeof payload.error_message === 'string' ? payload.error_message : status.toLowerCase();
        return {
          kind: 'provider_unavailable',
          zipCode: fallbackZipCode,
          reason,
        };
      }

      return { kind: 'invalid_address', zipCode: fallbackZipCode, reason: status.toLowerCase() };
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return { kind: 'provider_unavailable', zipCode: fallbackZipCode, reason: 'timeout' };
      }

      logger.warn('Google geocoding request failed', {
        lookupAddress,
        message: error instanceof Error ? error.message : String(error),
      });
      return { kind: 'provider_unavailable', zipCode: fallbackZipCode, reason: 'network_error' };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private parseGoogleResult(result: unknown, fallbackAddress: string): ParsedGoogleResult | null {
    if (!result || typeof result !== 'object') {
      return null;
    }

    const latitude = Number((result as any).geometry?.location?.lat);
    const longitude = Number((result as any).geometry?.location?.lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    let streetNumber = '';
    let route = '';
    let subpremise = '';
    let city = '';
    let state = '';
    let zipCode = '';

    const components = Array.isArray((result as any).address_components)
      ? (result as any).address_components
      : [];

    for (const component of components) {
      if (!component || typeof component !== 'object' || !Array.isArray(component.types)) {
        continue;
      }

      const types = component.types as string[];
      const longName = typeof component.long_name === 'string' ? component.long_name : '';
      const shortName = typeof component.short_name === 'string' ? component.short_name : longName;

      if (types.includes('street_number')) {
        streetNumber = longName;
      }
      if (types.includes('route')) {
        route = longName;
      }
      if (types.includes('subpremise')) {
        subpremise = longName;
      }
      if (types.includes('locality')) {
        city = longName;
      }
      if (!city && types.includes('postal_town')) {
        city = longName;
      }
      if (!city && types.includes('sublocality')) {
        city = longName;
      }
      if (types.includes('administrative_area_level_1')) {
        state = shortName;
      }
      if (types.includes('postal_code')) {
        zipCode = longName;
      }
    }

    const aliasCacheKeys: string[] = [];
    if (streetNumber && route && city && state && zipCode) {
      aliasCacheKeys.push(getStructuredDeliveryAddressCacheKey({
        street: `${streetNumber} ${route}`,
        ...(subpremise ? { apartment: subpremise } : {}),
        city,
        state,
        zipCode,
      }));
    }

    return {
      latitude,
      longitude,
      formattedAddress: typeof (result as any).formatted_address === 'string'
        ? (result as any).formatted_address
        : fallbackAddress,
      city: city || null,
      state: state || null,
      zipCode: zipCode || null,
      aliasCacheKeys,
    };
  }
}
