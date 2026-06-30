// backend/src/services/pos/orders/outboxWorker.tenant.test.ts
import { describe, it, expect, vi } from 'vitest';
import { getTenantContext } from '../../../config/tenantContext';
import { processOutboxRow } from './outboxWorker';

it('runs row processing inside that row tenant context', async () => {
  let seenTenant: number | undefined;
  const handler = vi.fn(async () => {
    seenTenant = getTenantContext()?.tenantId;
  });
  await processOutboxRow({ id: 1, tenantId: 77, storeId: 3 } as any, handler);
  expect(seenTenant).toBe(77);
});
