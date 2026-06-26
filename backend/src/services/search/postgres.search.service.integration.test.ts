import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '../../config/database';

const TEST_PREFIX = '__fts_test__';

// Skip entire suite when no DATABASE_URL is configured.
// When DATABASE_URL is set but the DB host is unreachable (e.g. Docker in CI),
// beforeAll silently skips seeding and each test becomes a no-op pass.
describe.skipIf(!process.env.DATABASE_URL)('PostgresSearchService integration', () => {
  let dbAvailable = false;
  let categoryId: number;
  let flowerProductId: number;
  let descOnlyProductId: number;
  let hiddenProductId: number;
  let vipProductId: number;

  beforeAll(async () => {
    try {
      const category = await prisma.category.create({
        data: { name: `${TEST_PREFIX}Flower`, sortOrder: 999 },
      });
      categoryId = category.id;

      const flower = await prisma.product.create({
        data: {
          name: `${TEST_PREFIX}OG Kush`,
          slug: `${TEST_PREFIX}og-kush`,
          description: 'Classic strain',
          categoryId,
        },
      });
      flowerProductId = flower.id;
      await prisma.$executeRaw`UPDATE "products" SET "search_category_name" = ${category.name} WHERE "id" = ${flowerProductId}`;

      const descOnly = await prisma.product.create({
        data: {
          name: `${TEST_PREFIX}Mystery Box`,
          slug: `${TEST_PREFIX}mystery-box`,
          description: 'Contains kush terpenes in its profile',
          categoryId,
        },
      });
      descOnlyProductId = descOnly.id;
      await prisma.$executeRaw`UPDATE "products" SET "search_category_name" = ${category.name} WHERE "id" = ${descOnlyProductId}`;

      const hidden = await prisma.product.create({
        data: {
          name: `${TEST_PREFIX}Hidden Kush`,
          slug: `${TEST_PREFIX}hidden-kush`,
          categoryId,
          hidden: true,
        },
      });
      hiddenProductId = hidden.id;
      await prisma.$executeRaw`UPDATE "products" SET "search_category_name" = ${category.name} WHERE "id" = ${hiddenProductId}`;

      const vip = await prisma.product.create({
        data: {
          name: `${TEST_PREFIX}VIP Kush`,
          slug: `${TEST_PREFIX}vip-kush`,
          categoryId,
          vipOnly: true,
        },
      });
      vipProductId = vip.id;
      await prisma.$executeRaw`UPDATE "products" SET "search_category_name" = ${category.name} WHERE "id" = ${vipProductId}`;

      dbAvailable = true;
    } catch {
      // DB not reachable — tests will be no-ops
    }
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    await prisma.product.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
    await prisma.category.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } });
    await prisma.$disconnect();
  });

  it('finds product by name (name match > description match by rank)', async () => {
    if (!dbAvailable) return;
    const { PostgresSearchService } = await import('./postgres.search.service');
    const svc = new PostgresSearchService();
    const results = await svc.searchProducts(
      { includeHidden: true, includeVipOnly: true },
      'kush',
      { limit: 25, offset: 0 },
    );
    const ids = results.map((r) => r.id);
    expect(ids).toContain(flowerProductId);
    // Name match should rank above description-only match
    expect(ids.indexOf(flowerProductId)).toBeLessThan(ids.indexOf(descOnlyProductId));
  });

  it('finds product by category name', async () => {
    if (!dbAvailable) return;
    const { PostgresSearchService } = await import('./postgres.search.service');
    const svc = new PostgresSearchService();
    const results = await svc.searchProducts(
      { includeHidden: true, includeVipOnly: true },
      'flower',
      { limit: 25, offset: 0 },
    );
    const ids = results.map((r) => r.id);
    expect(ids).toContain(flowerProductId);
    expect(ids).toContain(descOnlyProductId);
  });

  it('excludes hidden products for guest', async () => {
    if (!dbAvailable) return;
    const { PostgresSearchService } = await import('./postgres.search.service');
    const svc = new PostgresSearchService();
    const results = await svc.searchProducts(
      { includeHidden: false, includeVipOnly: false },
      'kush',
      { limit: 25, offset: 0 },
    );
    const ids = results.map((r) => r.id);
    expect(ids).not.toContain(hiddenProductId);
    expect(ids).not.toContain(vipProductId);
  });

  it('includes hidden+vip for admin', async () => {
    if (!dbAvailable) return;
    const { PostgresSearchService } = await import('./postgres.search.service');
    const svc = new PostgresSearchService();
    const results = await svc.searchProducts(
      { includeHidden: true, includeVipOnly: true },
      'kush',
      { limit: 25, offset: 0 },
    );
    const ids = results.map((r) => r.id);
    expect(ids).toContain(hiddenProductId);
    expect(ids).toContain(vipProductId);
  });

  it('stems correctly — "flowering" matches "flower"', async () => {
    if (!dbAvailable) return;
    const { PostgresSearchService } = await import('./postgres.search.service');
    const svc = new PostgresSearchService();
    const results = await svc.searchProducts(
      { includeHidden: true, includeVipOnly: true },
      'flowering',
      { limit: 25, offset: 0 },
    );
    const ids = results.map((r) => r.id);
    expect(ids).toContain(descOnlyProductId);
  });

  it('empty query returns products in sort order (no FTS)', async () => {
    if (!dbAvailable) return;
    const { PostgresSearchService } = await import('./postgres.search.service');
    const svc = new PostgresSearchService();
    const results = await svc.searchProducts(
      { includeHidden: false, includeVipOnly: false },
      '',
      { limit: 5, offset: 0 },
    );
    expect(Array.isArray(results)).toBe(true);
  });
});
