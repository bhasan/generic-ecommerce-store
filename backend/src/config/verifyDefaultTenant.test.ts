// backend/src/config/verifyDefaultTenant.test.ts
import { describe, it, expect, vi } from 'vitest';
import { verifyDefaultTenant } from './verifyDefaultTenant';

it('throws when default tenant is missing', async () => {
  const prisma: any = { tenant: { findFirst: vi.fn().mockResolvedValue(null) } };
  await expect(verifyDefaultTenant(prisma)).rejects.toThrow(/default tenant/i);
});

it('passes when default tenant exists', async () => {
  const prisma: any = { tenant: { findFirst: vi.fn().mockResolvedValue({ id: 1, slug: 'app' }) } };
  await expect(verifyDefaultTenant(prisma)).resolves.toBeUndefined();
});
