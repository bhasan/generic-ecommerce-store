import { Prisma } from '../../generated/prisma';
import type { ProductVisibilityFilter } from './search/search.service';

export const productInclude = {
  category: { include: { parent: true } },
  images: { orderBy: { sortOrder: 'asc' as const } },
  variants: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      quantityOptions: { orderBy: { sortOrder: 'asc' as const } },
      priceBreaks: { orderBy: { minQuantity: 'asc' as const } },
    },
  },
} satisfies Prisma.ProductInclude;

export function visibilityFilterToWhere(f: ProductVisibilityFilter): Prisma.ProductWhereInput {
  if (f.includeHidden && f.includeVipOnly) return {};
  if (f.includeHidden) return { vipOnly: false };
  if (f.includeVipOnly) return { hidden: false };
  return { hidden: false, vipOnly: false };
}
