// web/src/services/storeOverridesApi.js
import { get, put, del } from './api';

/**
 * Fetch per-store override rows + base variant data for a given store.
 * Returns { storeId, overrides: [...], variants: [...] }
 * Rejects for storeId 0 (default store) or stores that don't belong to this tenant.
 */
export const getStoreOverrides = (storeId) =>
  get(`/store-overrides?storeId=${storeId}`);

/**
 * Upsert a per-store override for a single variant.
 * Body: { storeId, variantId, stock?, priceOverride?, activeOverride? }
 */
export const upsertStoreOverride = (body) =>
  put('/store-overrides', body);

/**
 * Delete a per-store override row, reverting the variant to base values.
 */
export const deleteStoreOverride = (storeId, variantId) =>
  del(`/store-overrides?storeId=${storeId}&variantId=${variantId}`);
