// backend/src/config/tenantContext.test.ts
import { describe, it, expect } from 'vitest';
import {
  runWithTenant,
  getTenantContext,
  getTenantContextOrThrow,
  MissingTenantContextError,
} from './tenantContext';

describe('tenantContext', () => {
  it('returns undefined outside a context', () => {
    expect(getTenantContext()).toBeUndefined();
  });

  it('exposes the context inside runWithTenant', () => {
    const result = runWithTenant(
      { tenantId: 42, storeId: 7, scope: 'tenant' },
      () => getTenantContext(),
    );
    expect(result).toEqual({ tenantId: 42, storeId: 7, scope: 'tenant' });
  });

  it('isolates nested contexts and restores the outer one', () => {
    runWithTenant({ tenantId: 1, storeId: null, scope: 'tenant' }, () => {
      runWithTenant({ tenantId: 2, storeId: null, scope: 'tenant' }, () => {
        expect(getTenantContext()?.tenantId).toBe(2);
      });
      expect(getTenantContext()?.tenantId).toBe(1);
    });
  });

  it('getTenantContextOrThrow throws outside a context', () => {
    expect(() => getTenantContextOrThrow()).toThrow(MissingTenantContextError);
  });

  it('propagates context across awaits', async () => {
    const seen = await runWithTenant(
      { tenantId: 9, storeId: null, scope: 'tenant' },
      async () => {
        await Promise.resolve();
        return getTenantContext()?.tenantId;
      },
    );
    expect(seen).toBe(9);
  });
});
