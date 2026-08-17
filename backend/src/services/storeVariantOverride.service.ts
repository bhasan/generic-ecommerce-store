// backend/src/services/storeVariantOverride.service.ts
//
// Per-store inventory/pricing overrides for ProductVariant rows.
// store_variant_overrides is TENANT-scoped (tenantId only — NOT in STORE_SCOPED_TABLES),
// so storeId must always be passed EXPLICITLY. We use getUnscopedPrisma() throughout
// and call getTenantContextOrThrow() ourselves to get the tenantId from ALS.
//
// Why getUnscopedPrisma()?
//   The scoped client's $extends interceptor would attempt to auto-inject tenantId
//   into the upsert unique-where clause (`storeId_variantId`), which Prisma rejects
//   because the compound key has no tenantId column. Using the unscoped client and
//   threading tenantId manually keeps the scoped-client injector out of the way while
//   preserving the same isolation guarantee (every query filters on tenantId).

import { getUnscopedPrisma } from '../config/database';
import { getTenantContextOrThrow } from '../config/tenantContext';
import { AppError } from '../middleware/error.middleware';
import { Prisma } from '../../generated/prisma';

export class StoreVariantOverrideService {
  // Verify the store exists and belongs to the active tenant, or throw 404.
  private async assertStoreInTenant(storeId: number): Promise<void> {
    const { tenantId } = getTenantContextOrThrow();
    const store = await getUnscopedPrisma().store.findFirst({
      where: { id: storeId, tenantId },
    });
    if (!store) throw new AppError('Store not found', 404);
  }

  // ── List overrides + base variants for a store ─────────────────────────────
  // Returns the override rows for storeId plus all tenant variants (with their
  // product name/id) so a per-store inventory editor can show effective-vs-base.
  async listForStore(storeId: number) {
    const { tenantId } = getTenantContextOrThrow();
    const db = getUnscopedPrisma();

    // Validate storeId is a real store (> 0) that belongs to this tenant.
    if (!storeId || storeId <= 0) {
      throw new AppError('storeId must be a positive integer', 400);
    }
    await this.assertStoreInTenant(storeId);

    // Fetch per-store override rows.
    const overrides = await db.storeVariantOverride.findMany({
      where: { tenantId, storeId },
      orderBy: { variantId: 'asc' },
    });

    // Fetch all tenant variants with product info for the inventory editor.
    const variants = await db.productVariant.findMany({
      where: { tenantId },
      select: {
        id: true,
        label: true,
        sku: true,
        basePrice: true,
        stock: true,
        active: true,
        productId: true,
        product: {
          select: { id: true, name: true },
        },
      },
      orderBy: [{ productId: 'asc' }, { sortOrder: 'asc' }],
    });

    return { storeId, overrides, variants };
  }

  // ── Upsert a per-store override ────────────────────────────────────────────
  async upsertOverride(input: {
    storeId: number;
    variantId: number;
    stock?: number | string;
    priceOverride?: number | string | null;
    activeOverride?: boolean | null;
  }) {
    const { tenantId } = getTenantContextOrThrow();
    const db = getUnscopedPrisma();

    const { storeId, variantId, stock, priceOverride, activeOverride } = input;

    // Per-store overrides are per REAL store — storeId 0 is the sentinel for
    // "tenant-default" settings and must never receive an override row.
    if (storeId === 0) {
      throw new AppError(
        'storeId 0 is reserved for tenant-default settings; overrides must target a real store',
        400,
        'BAD_REQUEST',
      );
    }
    if (!storeId || storeId < 0) {
      throw new AppError('storeId must be a positive integer', 400);
    }

    // Validate store belongs to the tenant.
    await this.assertStoreInTenant(storeId);

    // Validate variant belongs to the tenant.
    const variant = await db.productVariant.findFirst({ where: { id: variantId, tenantId } });
    if (!variant) throw new AppError('Product variant not found', 404);

    // Validate stock >= 0 when provided.
    if (stock !== undefined && stock !== null) {
      const stockNum = Number(stock);
      if (isNaN(stockNum) || stockNum < 0) {
        throw new AppError('stock must be a non-negative number', 400);
      }
    }

    // Build create/update data.
    const createData: Record<string, unknown> = { tenantId, storeId, variantId };
    const updateData: Record<string, unknown> = {};

    if (stock !== undefined) {
      const stockDecimal = new Prisma.Decimal(String(stock));
      createData.stock = stockDecimal;
      updateData.stock = stockDecimal;
    }
    if (priceOverride !== undefined) {
      const priceVal = priceOverride === null ? null : new Prisma.Decimal(String(priceOverride));
      createData.priceOverride = priceVal;
      updateData.priceOverride = priceVal;
    }
    if (activeOverride !== undefined) {
      createData.activeOverride = activeOverride;
      updateData.activeOverride = activeOverride;
    }

    return db.storeVariantOverride.upsert({
      where: { storeId_variantId: { storeId, variantId } },
      create: createData as Parameters<typeof db.storeVariantOverride.create>[0]['data'],
      update: updateData,
    });
  }

  // ── Delete (revert) a per-store override ──────────────────────────────────
  // Idempotent: deleting a nonexistent override is a no-op success.
  // Removing the override reverts the variant to base/out-of-stock for this store.
  async deleteOverride(storeId: number, variantId: number) {
    const { tenantId } = getTenantContextOrThrow();
    const db = getUnscopedPrisma();

    if (!storeId || storeId <= 0) {
      throw new AppError('storeId must be a positive integer', 400);
    }

    // Validate store belongs to the tenant.
    await this.assertStoreInTenant(storeId);

    // deleteMany is idempotent — deletes 0 rows if the override does not exist.
    await db.storeVariantOverride.deleteMany({
      where: { tenantId, storeId, variantId },
    });

    return { deleted: true };
  }
}
