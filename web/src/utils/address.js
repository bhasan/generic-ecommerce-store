const collapseWhitespace = (value = '') => value.replace(/\s+/g, ' ').trim();

export const normalizeZipCode = (value = '') => {
  const match = `${value}`.match(/(\d{5})/);
  return match ? match[1] : '';
};

export const normalizeDeliveryAddress = (address = {}) => ({
  street: collapseWhitespace(address.street || ''),
  apartment: collapseWhitespace(address.apartment || ''),
  city: collapseWhitespace(address.city || ''),
  state: collapseWhitespace(address.state || 'TX').toUpperCase(),
  zipCode: normalizeZipCode(address.zipCode || ''),
});

export const isDeliveryAddressComplete = (address = {}) => {
  const normalized = normalizeDeliveryAddress(address);
  return Boolean(
    normalized.street
    && normalized.city
    && normalized.state
    && normalized.zipCode
  );
};

export const formatDeliveryAddress = (address = {}) => {
  const normalized = normalizeDeliveryAddress(address);
  const parts = [normalized.street];

  if (normalized.apartment) {
    parts.push(`Apt ${normalized.apartment}`);
  }

  if (normalized.city) {
    parts.push(normalized.city);
  }

  if (normalized.state || normalized.zipCode) {
    parts.push(`${normalized.state} ${normalized.zipCode}`.trim());
  }

  return parts.filter(Boolean).join(', ');
};

export const parseAddress = (addressStr) => {
  if (!addressStr) {
    return {
      street: '',
      apartment: '',
      city: '',
      state: 'TX',
      zipCode: '',
    };
  }

  const parts = addressStr.split(',').map((part) => collapseWhitespace(part));

  if (parts.length >= 3) {
    const secondPart = parts[1]?.toLowerCase() || '';
    const hasApartment = secondPart.includes('apt') || secondPart.includes('suite');

    if (hasApartment && parts.length >= 4) {
      const stateZip = parts[3]?.split(/\s+/) || [];
      return normalizeDeliveryAddress({
        street: parts[0],
        apartment: parts[1]?.replace(/^(apt|suite)\s*/i, ''),
        city: parts[2],
        state: stateZip[0] || 'TX',
        zipCode: stateZip[1] || '',
      });
    }

    const stateZip = parts[2]?.split(/\s+/) || [];
    return normalizeDeliveryAddress({
      street: parts[0],
      city: parts[1],
      state: stateZip[0] || 'TX',
      zipCode: stateZip[1] || '',
    });
  }

  return normalizeDeliveryAddress({
    street: addressStr,
    state: 'TX',
  });
};
