import { Prisma } from '../../../generated/prisma';
import prisma from '../../config/database';
import type { SearchService, SearchedProduct, ProductVisibilityFilter, Pagination } from './search.service';

const productInclude = {
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

export class PostgresSearchService implements SearchService {
  async searchProducts(
    visibility: ProductVisibilityFilter,
    q: string,
    { limit, offset }: Pagination,
  ): Promise<SearchedProduct[]> {
    const term = q.trim();

    if (!term) {
      return this.fallback(visibility, limit, offset);
    }

    // Fetch ranked IDs from tsvector index, then load full product shape via Prisma.
    const ranked = await prisma.$queryRaw<{ id: number }[]>`
      SELECT p."id"
      FROM "products" p
      WHERE p."search_vector" @@ plainto_tsquery('english', ${term})
        ${!visibility.includeHidden ? Prisma.sql`AND p."hidden" = false` : Prisma.empty}
        ${!visibility.includeVipOnly ? Prisma.sql`AND p."vipOnly" = false` : Prisma.empty}
      ORDER BY ts_rank(p."search_vector", plainto_tsquery('english', ${term})) DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    if (ranked.length === 0) return [];

    const ids = ranked.map((r) => r.id);
    const products = await prisma.product.findMany({
      where: { id: { in: ids } },
      include: productInclude,
    });

    // Re-sort by rank order returned from FTS query.
    const rankIndex = new Map(ids.map((id, i) => [id, i]));
    return products
      .sort((a, b) => (rankIndex.get(a.id) ?? 0) - (rankIndex.get(b.id) ?? 0));
  }

  private buildVisibilityWhere(visibility: ProductVisibilityFilter): Prisma.ProductWhereInput {
    if (visibility.includeHidden && visibility.includeVipOnly) return {};
    if (visibility.includeHidden) return { vipOnly: false };
    if (visibility.includeVipOnly) return { hidden: false };
    return { hidden: false, vipOnly: false };
  }

  private async fallback(
    visibility: ProductVisibilityFilter,
    limit: number,
    offset: number,
  ): Promise<SearchedProduct[]> {
    const where = this.buildVisibilityWhere(visibility);
    const products = await prisma.product.findMany({
      where,
      include: productInclude,
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
      take: limit,
      skip: offset,
    });
    return products;
  }
}
