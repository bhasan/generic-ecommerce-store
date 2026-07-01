import { getUnscopedPrisma } from '../config/database';
import { getTenantContextOrThrow } from '../config/tenantContext';

// `stores` is UNSCOPED (tenantScope.ts), so filter tenantId explicitly from context.
export class StoreService {
  async listStores() {
    const { tenantId } = getTenantContextOrThrow();
    return getUnscopedPrisma().store.findMany({
      where: { tenantId, status: 'ACTIVE' },
      select: { id: true, name: true, slug: true, isDefault: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }
}
