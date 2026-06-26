import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ProductVisibilityFilter } from './search.service';

// --- Prisma mock ---
const prismaMock = {
  $queryRaw: vi.fn(),
  product: { findMany: vi.fn() },
};
vi.mock('../../config/database', () => ({ default: prismaMock }));

describe('PostgresSearchService', () => {
  beforeEach(() => vi.clearAllMocks());

  const makeProduct = (id: number, overrides = {}) => ({
    id, name: 'Test', slug: 'test', categoryId: 1,
    hidden: false, vipOnly: false, sortOrder: 0, createdAt: new Date(),
    updatedAt: new Date(), category: { id: 1, sortOrder: 0, parent: null },
    images: [], variants: [], ...overrides,
  });

  const visibleAll: ProductVisibilityFilter = { includeHidden: true, includeVipOnly: true };
  const visibleGuest: ProductVisibilityFilter = { includeHidden: false, includeVipOnly: false };

  describe('empty query', () => {
    it('falls back to prisma.findMany with sort order', async () => {
      prismaMock.product.findMany.mockResolvedValue([makeProduct(1)]);
      const { PostgresSearchService } = await import('./postgres.search.service');
      const svc = new PostgresSearchService();

      await svc.searchProducts(visibleGuest, '', { limit: 10, offset: 0 });

      expect(prismaMock.product.findMany).toHaveBeenCalledOnce();
      expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    });

    it('applies hidden filter for guest on empty query', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      const { PostgresSearchService } = await import('./postgres.search.service');
      const svc = new PostgresSearchService();

      await svc.searchProducts(visibleGuest, '  ', { limit: 10, offset: 0 });

      const whereArg = prismaMock.product.findMany.mock.calls[0][0].where;
      expect(whereArg).toMatchObject({ hidden: false, vipOnly: false });
    });

    it('passes empty where for admin (includeHidden + includeVipOnly)', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      const { PostgresSearchService } = await import('./postgres.search.service');
      const svc = new PostgresSearchService();

      await svc.searchProducts(visibleAll, '', { limit: 10, offset: 0 });

      const whereArg = prismaMock.product.findMany.mock.calls[0][0].where;
      expect(whereArg).toEqual({});
    });
  });

  describe('non-empty query', () => {
    it('calls $queryRaw and fetches full products by ranked IDs', async () => {
      prismaMock.$queryRaw.mockResolvedValue([{ id: 2 }, { id: 1 }]);
      prismaMock.product.findMany.mockResolvedValue([makeProduct(1), makeProduct(2)]);
      const { PostgresSearchService } = await import('./postgres.search.service');
      const svc = new PostgresSearchService();

      const results = await svc.searchProducts(visibleGuest, 'kush', { limit: 25, offset: 0 });

      expect(prismaMock.$queryRaw).toHaveBeenCalledOnce();
      expect(prismaMock.product.findMany).toHaveBeenCalledOnce();
      // Results should be ordered by rank (id:2 first, then id:1)
      expect(results.map((r) => r.id)).toEqual([2, 1]);
    });

    it('includes visibility filter in $queryRaw for guest', async () => {
      prismaMock.$queryRaw.mockResolvedValue([]);
      const { PostgresSearchService } = await import('./postgres.search.service');
      const svc = new PostgresSearchService();

      await svc.searchProducts({ includeHidden: false, includeVipOnly: false }, 'kush', { limit: 10, offset: 0 });

      // For a tagged template literal call tag`...${a}...${b}...`, the mock receives
      // (templateStringsArray, a, b, ...). The conditional Prisma.sql fragments are
      // interpolated values (indices 2 and 3: term, hiddenFrag, vipOnlyFrag, term, limit, offset).
      const callArgs = prismaMock.$queryRaw.mock.calls[0];
      const hiddenFrag = callArgs[2] as { strings: readonly string[] };
      const vipOnlyFrag = callArgs[3] as { strings: readonly string[] };
      expect(hiddenFrag.strings.join('')).toContain('"hidden"');
      expect(vipOnlyFrag.strings.join('')).toContain('"vipOnly"');
    });

    it('returns empty array when $queryRaw finds no matches', async () => {
      prismaMock.$queryRaw.mockResolvedValue([]);
      const { PostgresSearchService } = await import('./postgres.search.service');
      const svc = new PostgresSearchService();

      const results = await svc.searchProducts(visibleGuest, 'zzznomatch', { limit: 25, offset: 0 });

      expect(results).toEqual([]);
      expect(prismaMock.product.findMany).not.toHaveBeenCalled();
    });
  });
});
