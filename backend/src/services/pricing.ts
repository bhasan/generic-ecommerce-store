import { Prisma } from '../../generated/prisma';

// Fractional weight quantities mean we compare with a small tolerance, never ===.
const EPSILON = 1e-9;

type DecimalLike = Prisma.Decimal | number | string;

const toNumber = (value: DecimalLike): number =>
  typeof value === 'number' ? value : Number(value.toString());

export interface PricingVariant {
  basePrice: DecimalLike;
  quantityOptions?: { quantity: DecimalLike }[];
  priceBreaks?: { minQuantity: DecimalLike; unitPrice: DecimalLike }[];
}

/**
 * Resolves the unit price for an ordered quantity: the price break with the largest
 * `minQuantity <= quantity`, otherwise the variant's `basePrice`. Returns a Decimal so
 * downstream money math stays exact.
 */
export function resolveUnitPrice(variant: PricingVariant, quantity: number): Prisma.Decimal {
  const applicable = (variant.priceBreaks ?? [])
    .map((b) => ({ minQuantity: toNumber(b.minQuantity), unitPrice: b.unitPrice }))
    .filter((b) => b.minQuantity <= quantity + EPSILON)
    .sort((a, b) => b.minQuantity - a.minQuantity);

  const chosen = applicable.length > 0 ? applicable[0].unitPrice : variant.basePrice;
  return new Prisma.Decimal(chosen);
}

/** Line total = resolved unit price × quantity, in Decimal. */
export function resolveLineTotal(variant: PricingVariant, quantity: number): Prisma.Decimal {
  return resolveUnitPrice(variant, quantity).mul(quantity);
}

/** The selectable quantities for a variant (empty for plain UNIT products). */
export function getAllowedQuantities(variant: PricingVariant): number[] {
  return (variant.quantityOptions ?? []).map((o) => toNumber(o.quantity));
}

/**
 * Whether an ordered quantity is permitted: any positive quantity when the variant has no
 * quantity options (UNIT), otherwise it must match one of the options (WEIGHT/tiered).
 */
export function isQuantityAllowed(variant: PricingVariant, quantity: number): boolean {
  if (!(quantity > 0)) return false;
  const options = getAllowedQuantities(variant);
  if (options.length === 0) return true;
  return options.some((allowed) => Math.abs(allowed - quantity) < EPSILON);
}

