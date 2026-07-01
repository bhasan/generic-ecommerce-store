import { getUnscopedPrisma } from '../config/database';
import { getTenantContextOrThrow } from '../config/tenantContext';
import { AppError } from '../middleware/error.middleware';

// `stores` is UNSCOPED (tenantScope.ts), so filter tenantId explicitly from context.
// Never use getTenantPrisma() for store queries — it will not inject tenantId.

export class StoreService {
  // ── List (customer-facing: ACTIVE only) ──────────────────────────────────
  async listStores() {
    const { tenantId } = getTenantContextOrThrow();
    return getUnscopedPrisma().store.findMany({
      where: { tenantId, status: 'ACTIVE' },
      select: { id: true, name: true, slug: true, isDefault: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  // ── List All (admin: includes SUSPENDED, exposes status) ──────────────────
  async listAllStores() {
    const { tenantId } = getTenantContextOrThrow();
    return getUnscopedPrisma().store.findMany({
      where: { tenantId },
      select: { id: true, name: true, slug: true, isDefault: true, status: true },
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

    // Never suspend the tenant's current default store — that would leave the
    // tenant with no ACTIVE default, so resolveActiveStore returns null and every
    // store-scoped create (checkout) fails closed. Require another default first.
    if (data.status === 'SUSPENDED') {
      const current = await db.store.findFirst({ where: { id, tenantId } });
      if (current?.isDefault) {
        throw new AppError('Set another store as default before suspending this one', 400);
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

      // A suspended store must never become the default: resolveActiveStore only
      // returns ACTIVE stores, so a SUSPENDED default yields a null store context
      // and every store-scoped create (checkout) fails closed. Reject up front.
      if (store.status !== 'ACTIVE') {
        throw new AppError('Cannot set a suspended store as the default', 400);
      }

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
  // SEEDS a new (non-default) store from the tenant's BASE catalog so it opens
  // already STOCKED and SELLABLE — instead of all-out-of-stock. Concretely:
  //  1. For EVERY ProductVariant in the tenant, UPSERT a StoreVariantOverride for
  //     the target store (idempotent on the @@unique([storeId, variantId]) key).
  //  2. Copy the tenant-default store_settings row (storeId=0 sentinel) → per-store
  //     row for the target (upsert) — unchanged.
  //
  // Why seed from base variants (not from the default store's override rows): the
  // default store keeps its stock in the BASE ProductVariant and has ~0 override
  // rows, so copying its overrides copies nothing meaningful and, for a non-default
  // store, resolveVariantEffective returns stock 0 (out of stock) for every variant.
  //
  // Seeded override values:
  //   • stock          = variant.stock  → the new store opens with the catalog's
  //                       stock as its OWN independent per-store pool.
  //   • priceOverride  = null           → INHERIT the base price AND the tenant's
  //                       quantity price breaks. A non-null priceOverride is treated
  //                       as FLAT (F5: order.crud.service drops priceBreaks when
  //                       effective.priceOverridden), which is NOT what a base seed
  //                       wants — the store should track base pricing exactly.
  //   • activeOverride = null           → INHERIT the base variant's active flag.
  async cloneFromDefault(id: number) {
    const { tenantId } = getTenantContextOrThrow();
    const db = getUnscopedPrisma();

    // Validate target store belongs to this tenant.
    const target = await db.store.findFirst({ where: { id, tenantId } });
    if (!target) throw new AppError('Store not found', 404);

    // Require a default store (kept behavior).
    const defaultStore = await db.store.findFirst({ where: { tenantId, isDefault: true } });
    if (!defaultStore) {
      throw new AppError('No default store is configured for this tenant', 400, 'BAD_REQUEST');
    }

    // ── Seed per-store overrides from the tenant's BASE variants ──────────
    // Upserts key on the distinct (storeId, variantId) unique index, so they
    // are independent writes with no ordering dependency — fire them
    // concurrently instead of one-at-a-time to avoid N sequential round-trips
    // for tenants with large catalogs (see other bulk-upsert call sites, e.g.
    // deliveryEligibility.service.ts, which use the same Promise.all pattern).
    const variants = await db.productVariant.findMany({ where: { tenantId } });

    await Promise.all(
      variants.map((v) =>
        db.storeVariantOverride.upsert({
          where: { storeId_variantId: { storeId: id, variantId: v.id } },
          create: {
            tenantId,
            storeId: id,
            variantId: v.id,
            stock: v.stock,
            priceOverride: null, // inherit base price + quantity price breaks (not flat)
            activeOverride: null, // inherit base active
          },
          update: {
            stock: v.stock,
            priceOverride: null,
            activeOverride: null,
            tenantId,
          },
        }),
      ),
    );

    // ── Copy tenant-default store_settings (storeId=0 sentinel) — unchanged ──
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

    return { store: target, overridesCopied: variants.length, settingsCopied };
  }
}
