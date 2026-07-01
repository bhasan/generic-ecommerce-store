import { AsyncLocalStorage } from 'async_hooks';
import { AppError } from '../utils/appError';

export type TenantContext = {
  tenantId: number;
  storeId: number | null;
  scope: 'tenant' | 'super-admin';
  isDefaultStore?: boolean;
};

export class MissingTenantContextError extends Error {
  constructor() {
    super('Execution context is missing active tenantScope. Wrap database operations inside runWithTenant(...) first.');
    this.name = 'MissingTenantContextError';
  }
}

/**
 * Thrown by the scoped Prisma client when a CREATE (create / createMany / upsert)
 * is attempted on a store-scoped table while the active tenant context has
 * storeId === 0 (the "all stores" aggregate sentinel).
 *
 * There is no legitimate use-case for creating a store-scoped row without a real
 * store id — the operation is rejected with HTTP 400 so callers see a clear error
 * instead of a silent NULL storeId that would make the row invisible to everyone.
 */
export class MissingStoreContextError extends AppError {
  constructor(table: string) {
    super(
      `Cannot create store-scoped "${table}" in the all-stores context (storeId 0). Select a specific store.`,
      400,
      'MISSING_STORE_CONTEXT',
    );
    this.name = 'MissingStoreContextError';
  }
}

const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function runWithTenant<T>(ctx: TenantContext, fn: () => T): T {
  return tenantStorage.run(ctx, () => {
    const result = fn();
    if (result && typeof (result as any).then === 'function') {
      return (result as any).then(
        (resolved: any) => resolved,
        (err: any) => {
          throw err;
        }
      );
    }
    return result;
  });
}

export function getTenantContext(): TenantContext | undefined {
  return tenantStorage.getStore();
}

export function getTenantContextOrThrow(): TenantContext {
  const ctx = getTenantContext();
  if (!ctx) {
    throw new MissingTenantContextError();
  }
  return ctx;
}

/**
 * Resolve the storeId used for store-scoped settings rows: the default store (or
 * a missing/zero storeId) maps to the tenant-default sentinel 0; a real non-default
 * store maps to its own id. Single source of truth for this mapping so per-store
 * reads/writes and their caches stay consistent.
 */
export function getEffectiveStoreId(ctx: TenantContext | undefined): number {
  return ctx?.isDefaultStore ? 0 : (ctx?.storeId ?? 0);
}
