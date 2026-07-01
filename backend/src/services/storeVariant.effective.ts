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
}

export function resolveVariantEffective(
  variant: { basePrice: Prisma.Decimal; stock: Prisma.Decimal; stockEnabled: boolean; active: boolean },
  override: VariantOverrideLike | undefined,
  isDefaultStore: boolean,
): EffectiveVariant {
  const rawPrice = override?.priceOverride ?? variant.basePrice;
  const price = Number(rawPrice instanceof Prisma.Decimal ? rawPrice.toNumber() : rawPrice);

  const rawStock = override ? override.stock : (isDefaultStore ? variant.stock : 0);
  const stock = Number(rawStock instanceof Prisma.Decimal ? rawStock.toNumber() : rawStock);

  const active = override?.activeOverride ?? variant.active;

  const available = active && (!variant.stockEnabled || stock > 0);

  return { price, stock, active, available };
}
