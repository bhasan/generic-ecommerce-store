import { getUnscopedPrisma } from '../src/config/database';

const prisma = getUnscopedPrisma();

async function backfillCategories() {
  console.log('🔧 Backfilling categories from legacy product.category...');

  const legacyColumn = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'products' AND column_name = 'category'
    ) as "exists"
  `;

  if (!legacyColumn[0]?.exists) {
    console.log('ℹ️ No legacy category column found. Nothing to backfill.');
    return;
  }

  const legacyRows = await prisma.$queryRaw<Array<{ id: number; category: string }>>`
    SELECT "id", "category"
    FROM "products"
    WHERE "category" IS NOT NULL AND ("categoryId" IS NULL OR "categoryId" = 0)
  `;

  if (legacyRows.length === 0) {
    console.log('✅ No products missing categoryId.');
    return;
  }

  const uniqueNames = Array.from(
    new Set(legacyRows.map(row => row.category.trim()).filter(Boolean))
  );

  const categoryMap = new Map<string, number>();
  for (const name of uniqueNames) {
    const existing = await prisma.category.findFirst({
      where: { name, parentId: null }
    });

    const category = existing ?? await prisma.category.create({
      data: { name }
    });

    categoryMap.set(name, category.id);
  }

  for (const row of legacyRows) {
    const categoryId = categoryMap.get(row.category.trim());
    if (!categoryId) continue;

    await prisma.productItem.update({
      where: { id: row.id },
      data: { categoryId }
    });
  }

  console.log(`✅ Backfilled ${legacyRows.length} products`);
}

backfillCategories()
  .catch((error) => {
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
