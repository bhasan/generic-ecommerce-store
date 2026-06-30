import { describe, it, expect } from 'vitest';
import { getTenantPrisma } from './database';
import { MissingTenantContextError } from './tenantContext';

// The Vitest runner sets process.env.VITEST='true'. A scoped query with no
// active tenant context must fail closed rather than silently run unscoped.
describe('tenant extension fails closed in test env', () => {
  it('throws MissingTenantContextError when no context is active', async () => {
    await expect(getTenantPrisma().category.findMany()).rejects.toBeInstanceOf(
      MissingTenantContextError,
    );
  });
});
