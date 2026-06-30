// backend/src/config/verifyDefaultTenant.ts
import { setDefaultTenantId } from './defaultTenant';

export async function verifyDefaultTenant(prisma: {
  tenant: { findFirst: (args: any) => Promise<any> };
}): Promise<void> {
  const tenant = await prisma.tenant.findFirst({
    where: { slug: 'app' },
  });
  if (!tenant) {
    throw new Error(
      'FATAL: Default tenant (slug: app) is missing from the database. Ensure database migrations have run.',
    );
  }
  setDefaultTenantId(tenant.id);
}
