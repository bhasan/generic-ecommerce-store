import { getUnscopedPrisma } from '../config/database';
import { getTenantContextOrThrow } from '../config/tenantContext';
import { AppError } from '../middleware/error.middleware';

// `stores` is UNSCOPED (tenantScope.ts), so filter tenantId explicitly from context.
// Never use getTenantPrisma() for store queries — it will not inject tenantId.

export class StoreService {
  // ── List ──────────────────────────────────────────────────────────────────
  async listStores() {
    const { tenantId } = getTenantContextOrThrow();
    return getUnscopedPrisma().store.findMany({
      where: { tenantId, status: 'ACTIVE' },
      select: { id: true, name: true, slug: true, isDefault: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  // ── Create ────────────────────────────────────────────────────────────────
  async createStore(data: { name: string; slug: string }) {
    const { tenantId } = getTenantContextOrThrow();
    const db = getUnscopedPrisma();

    const duplicate = await db.store.findFirst({ where: { tenantId, slug: data.slug } });
    if (duplicate) {
      throw new AppError(
        `A store with slug '${data.slug}' already exists in this tenant`,
        409,
        'CONFLICT',
      );
    }

    return db.store.create({
      data: { tenantId, name: data.name, slug: data.slug, isDefault: false, status: 'ACTIVE' },
    });
  }

  // ── Update ────────────────────────────────────────────────────────────────
  async updateStore(
    id: number,
    data: { name?: string; slug?: string; status?: string },
  ) {
    const { tenantId } = getTenantContextOrThrow();
    const db = getUnscopedPrisma();

    // Tenant-scoped slug-collision check: exclude the current store so a no-op
    // slug update (same value) is never flagged as a collision.
    if (data.slug !== undefined) {
      const collision = await db.store.findFirst({
        where: { tenantId, slug: data.slug, id: { not: id } },
      });
      if (collision) {
        throw new AppError(
          `A store with slug '${data.slug}' already exists in this tenant`,
          409,
          'CONFLICT',
        );
      }
    }

    // Only allow known fields; ignore anything else from the caller.
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.slug !== undefined) patch.slug = data.slug;
    if (data.status !== undefined) patch.status = data.status;

    // tenantId is part of the write predicate — closes the TOCTOU window
    // between a pre-check and the mutation.
    const { count } = await db.store.updateMany({ where: { id, tenantId }, data: patch });
    if (count === 0) throw new AppError('Store not found', 404);

    const updated = await db.store.findFirst({ where: { id, tenantId } });
    if (!updated) throw new AppError('Store not found', 404);
    return updated;
  }

  // ── Set Default ───────────────────────────────────────────────────────────
  // Atomically verifies ownership, unsets every current default for the tenant,
  // then sets this store — all inside a single transaction to close TOCTOU.
  async setDefaultStore(id: number) {
    const { tenantId } = getTenantContextOrThrow();
    const db = getUnscopedPrisma();

    return db.$transaction(async (tx) => {
      // (1) Verify the target belongs to this tenant inside the tx.
      const store = await tx.store.findFirst({ where: { id, tenantId } });
      if (!store) throw new AppError('Store not found', 404);

      // (2) Unset the current default for this tenant.
      await tx.store.updateMany({
        where: { tenantId, isDefault: true },
        data: { isDefault: false },
      });

      // (3) Set the new default — tenantId in the predicate closes the TOCTOU
      // window; count===0 means a foreign id slipped through and we roll back.
      const { count } = await tx.store.updateMany({
        where: { id, tenantId },
        data: { isDefault: true },
      });
      if (count === 0) throw new AppError('Store not found', 404);

      const updated = await tx.store.findFirst({ where: { id, tenantId } });
      if (!updated) throw new AppError('Store not found', 404);
      return updated;
    });
  }

  // ── Clone from Default ────────────────────────────────────────────────────
  // Copies:
  //  1. All StoreVariantOverride rows from the tenant's default store → target store (upsert).
  //  2. The tenant-default store_settings row (storeId=0) → per-store row for target (upsert).
  //
  // Note: the default store in this system normally uses BASE variant values and may have
  // few or no override rows in practice. The copy is faithful regardless — seeds 0+ rows.
  async cloneFromDefault(id: number) {
    const { tenantId } = getTenantContextOrThrow();
    const db = getUnscopedPrisma();

    // Validate target store belongs to this tenant.
    const target = await db.store.findFirst({ where: { id, tenantId } });
    if (!target) throw new AppError('Store not found', 404);

    // Find the tenant's default store.
    const defaultStore = await db.store.findFirst({ where: { tenantId, isDefault: true } });
    if (!defaultStore) {
      throw new AppError('No default store is configured for this tenant', 400, 'BAD_REQUEST');
    }

    // ── Copy StoreVariantOverride rows ────────────────────────────────────
    const overrides = await db.storeVariantOverride.findMany({
      where: { tenantId, storeId: defaultStore.id },
    });

    for (const ov of overrides) {
      await db.storeVariantOverride.upsert({
        where: { storeId_variantId: { storeId: id, variantId: ov.variantId } },
        create: {
          tenantId,
          storeId: id,
          variantId: ov.variantId,
          stock: ov.stock,
          priceOverride: ov.priceOverride,
          activeOverride: ov.activeOverride,
        },
        update: {
          stock: ov.stock,
          priceOverride: ov.priceOverride,
          activeOverride: ov.activeOverride,
          tenantId,
        },
      });
    }

    // ── Copy tenant-default store_settings (storeId=0 sentinel) ──────────
    const defaultSettings = await db.uiSetting.findFirst({
      where: { tenantId, storeId: 0, key: 'store_settings' },
    });

    let settingsCopied = 0;
    if (defaultSettings) {
      await db.uiSetting.upsert({
        where: { tenantId_storeId_key: { tenantId, storeId: id, key: 'store_settings' } },
        create: { tenantId, storeId: id, key: 'store_settings', value: defaultSettings.value as object },
        update: { value: defaultSettings.value as object },
      });
      settingsCopied = 1;
    }

    return { store: target, overridesCopied: overrides.length, settingsCopied };
  }
}
