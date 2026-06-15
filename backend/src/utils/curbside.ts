export interface CurbsideFields {
  vehicleDescription: string | null;
  parkingSpot: string | null;
}

// Parses the legacy deliveryAddress string used by CURBSIDE orders.
// Handles: "CURBSIDE: Black Honda Civic" and "CURBSIDE: Black Honda Civic | SPOT: A-12"
export function parseCurbsideAddress(raw: string | null | undefined): CurbsideFields {
  if (!raw) return { vehicleDescription: null, parkingSpot: null };

  const [vehiclePart, spotPart] = raw.split(' | SPOT:');
  const vehicleDescription = vehiclePart.replace(/^\s*CURBSIDE:\s*/i, '').trim() || null;
  const parkingSpot = spotPart ? spotPart.trim() || null : null;

  return { vehicleDescription, parkingSpot };
}

// Rebuilds the legacy string from structured fields (used for dual-write during transition).
export function formatCurbsideAddress(fields: CurbsideFields): string {
  const base = `CURBSIDE: ${fields.vehicleDescription ?? ''}`;
  return fields.parkingSpot ? `${base} | SPOT: ${fields.parkingSpot}` : base;
}
