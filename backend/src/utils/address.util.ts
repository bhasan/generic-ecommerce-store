export interface StructuredDeliveryAddress {
  street: string;
  apartment?: string;
  city: string;
  state: string;
  zipCode: string;
}

const collapseWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

export const normalizeAddressCacheKey = (value: string): string =>
  collapseWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const normalizeZipCode = (value?: string | null): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const match = value.match(/(\d{5})/);
  return match ? match[1] : null;
};

export const normalizeStructuredDeliveryAddress = (
  address: Partial<StructuredDeliveryAddress> | null | undefined
): StructuredDeliveryAddress => {
  const apartment = typeof address?.apartment === 'string' ? collapseWhitespace(address.apartment) : '';

  return {
    street: typeof address?.street === 'string' ? collapseWhitespace(address.street) : '',
    ...(apartment ? { apartment } : {}),
    city: typeof address?.city === 'string' ? collapseWhitespace(address.city) : '',
    state: typeof address?.state === 'string' ? collapseWhitespace(address.state).toUpperCase() : '',
    zipCode: normalizeZipCode(address?.zipCode) || '',
  };
};

export const isStructuredDeliveryAddressComplete = (
  address: Partial<StructuredDeliveryAddress> | null | undefined
): boolean => {
  const normalized = normalizeStructuredDeliveryAddress(address);
  return Boolean(
    normalized.street
    && normalized.city
    && normalized.state
    && normalized.zipCode
  );
};

export const formatStructuredDeliveryAddress = (
  address: Partial<StructuredDeliveryAddress> | null | undefined
): string => {
  const normalized = normalizeStructuredDeliveryAddress(address);
  const parts = [normalized.street];

  if (normalized.apartment) {
    parts.push(`Apt ${normalized.apartment}`);
  }

  parts.push(normalized.city);
  if (normalized.state || normalized.zipCode) {
    parts.push(`${normalized.state} ${normalized.zipCode}`.trim());
  }

  return parts.filter(Boolean).join(', ');
};

export const getStructuredDeliveryAddressCacheKey = (
  address: Partial<StructuredDeliveryAddress> | null | undefined
): string => normalizeAddressCacheKey(formatStructuredDeliveryAddress(address));

export const extractZipCodeFromFreeformAddress = (address?: string | null): string | null =>
  normalizeZipCode(address);
