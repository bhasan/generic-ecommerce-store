import { AsyncLocalStorage } from 'async_hooks';

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
