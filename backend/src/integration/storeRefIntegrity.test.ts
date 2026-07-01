import { describe, it, expect } from 'vitest';
import { getUnscopedPrisma } from '../config/database';

const prisma = getUnscopedPrisma();

describe('store-reference integrity (sentinel columns have no FK)', () => {
  // storeId 0 = "all stores / tenant default" sentinel; any OTHER value must be a real store.
  it('no user_roles row references a non-existent store', async () => {
    const orphans = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::bigint AS count FROM user_roles ur
      WHERE ur."storeId" IS NOT NULL AND ur."storeId" <> 0
        AND NOT EXISTS (SELECT 1 FROM stores s WHERE s.id = ur."storeId")`;
    expect(Number(orphans[0].count)).toBe(0);
  });

  it('no ui_settings row references a non-existent store', async () => {
    const orphans = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::bigint AS count FROM ui_settings u
      WHERE u."storeId" IS NOT NULL AND u."storeId" <> 0
        AND NOT EXISTS (SELECT 1 FROM stores s WHERE s.id = u."storeId")`;
    expect(Number(orphans[0].count)).toBe(0);
  });
});
