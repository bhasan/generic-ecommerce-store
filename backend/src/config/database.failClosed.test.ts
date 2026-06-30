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

  it('throws MissingTenantContextError for findFirstOrThrow with no context', async () => {
    await expect(getTenantPrisma().category.findFirstOrThrow()).rejects.toBeInstanceOf(
      MissingTenantContextError,
    );
  });

  it('throws MissingTenantContextError for findUniqueOrThrow with no context', async () => {
    await expect(
      getTenantPrisma().category.findUniqueOrThrow({ where: { id: 1 } }),
    ).rejects.toBeInstanceOf(MissingTenantContextError);
  });
});
