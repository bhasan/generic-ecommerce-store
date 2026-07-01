import { Prisma } from '../../generated/prisma';

export interface VariantOverrideLike {
  stock: Prisma.Decimal | number;
  priceOverride: Prisma.Decimal | number | null;
  activeOverride: boolean | null;
}

export interface EffectiveVariant {
  price: number;
  stock: number;
  active: boolean;
  available: boolean;
  /**
   * True when `price` came from a real per-store `priceOverride` (an override row with
   * `priceOverride != null`), rather than the passthrough variant base price. Callers use
   * this to decide pricing semantics — notably: a per-store price override is FLAT, so the
   * tenant's quantity price breaks must NOT be applied on top of it.
   */
  priceOverridden: boolean;
}

export function resolveVariantEffective(
  variant: { basePrice: Prisma.Decimal; stock: Prisma.Decimal; stockEnabled: boolean; active: boolean },
  override: VariantOverrideLike | undefined,
  isDefaultStore: boolean,
): EffectiveVariant {
  const priceOverridden = override?.priceOverride != null;
  const rawPrice = override?.priceOverride ?? variant.basePrice;
  const price = Number(rawPrice instanceof Prisma.Decimal ? rawPrice.toNumber() : rawPrice);

  const rawStock = override ? override.stock : (isDefaultStore ? variant.stock : 0);
  const stock = Number(rawStock instanceof Prisma.Decimal ? rawStock.toNumber() : rawStock);

  const active = override?.activeOverride ?? variant.active;

  const available = active && (!variant.stockEnabled || stock > 0);

  return { price, stock, active, available, priceOverridden };
}
