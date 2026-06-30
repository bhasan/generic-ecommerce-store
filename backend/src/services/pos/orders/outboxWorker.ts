import { getUnscopedPrisma } from '../../../config/database';
import { Prisma } from '../../../../generated/prisma';
import { logger } from '../../../utils/logger';
import { StoreSettingsService } from '../../storeSettings.service';
import { getOrderSync } from '../registry';
import { processOutboxRow as runProcessOutboxRow, DeferralError } from './posOrderService';
import { runWithTenant } from '../../../config/tenantContext';

const MAX_ATTEMPTS = 5;
const POLL_MS = Number(process.env.POS_OUTBOX_POLL_MS ?? 30000);
const BATCH = 10;
const BACKLOG_THRESHOLD = Number(process.env.POS_OUTBOX_BACKLOG_THRESHOLD ?? 50);
// Rows claimed (PROCESSING) but never finished — e.g. the worker crashed mid-batch — are
// reclaimed after this lease expires so they can never get orphaned.
const LEASE_MS = Number(process.env.POS_OUTBOX_LEASE_MS ?? 5 * 60 * 1000);

interface OutboxRow { id: number; orderId: number; provider: string; type: string; attempts: number; tenantId: number; storeId: number | null; }

const storeSettingsService = new StoreSettingsService();

/**
 * Run the given handler inside the row's tenant context (its tenantId/storeId).
 * Exported for testing — see outboxWorker.tenant.test.ts.
 */
export async function processOutboxRow(
  row: { id: number; tenantId: number; storeId: number | null },
  handler: () => Promise<void>,
): Promise<void> {
  await runWithTenant(
    { tenantId: row.tenantId, storeId: row.storeId, scope: 'tenant' },
    handler,
  );
}

export async function runOutboxOnce(): Promise<void> {
  // The worker polls EVERY tenant's outbox, so it uses the unscoped client for
  // cross-tenant bookkeeping (claim + status updates, all keyed by the globally
  // unique row id). Per-row work (payload build, provider) runs inside the row's
  // tenant context — see phase 2.
  const base = getUnscopedPrisma();
  const leaseCutoff = new Date(Date.now() - LEASE_MS);

  // Phase 1 — claim a batch atomically across all tenants.
  // FOR UPDATE SKIP LOCKED inside a transaction holds the row locks until the UPDATE commits,
  // preventing concurrent worker instances from claiming the same rows. The locks are released
  // as soon as we mark rows PROCESSING, so HTTP calls in phase 2 never block a DB connection.
  const rows = await base.$transaction(async (tx) => {
    const claimed = await tx.$queryRaw<OutboxRow[]>(Prisma.sql`
      SELECT id, "orderId", provider, type, attempts, "tenantId", "storeId"
      FROM pos_outbox
      WHERE status = 'PENDING'
         OR (status = 'PROCESSING' AND "updatedAt" < ${leaseCutoff})
      ORDER BY id
      LIMIT ${BATCH}
      FOR UPDATE SKIP LOCKED
    `);
    if (claimed.length > 0) {
      await tx.posOutbox.updateMany({
        where: { id: { in: claimed.map(r => r.id) } },
        data: { status: 'PROCESSING' },
      });
    }
    return claimed;
  });

  if (rows.length === 0) return;

  // Phase 2 — process each claimed row IN ITS OWN TENANT CONTEXT, resolving THAT
  // tenant's POS provider/credentials per row. (POS config is per-tenant; a single
  // worker tick may span rows belonging to different tenants.)
  for (const row of rows) {
    try {
      await processOutboxRow(row, async () => {
        const settings = await storeSettingsService.getStoreSettings(); // this row's tenant settings
        const provider = getOrderSync(settings);
        if (!provider) {
          // This tenant has no POS configured — nothing to sync. Mark DONE so the
          // row doesn't loop forever; record why.
          await base.posOutbox.update({
            where: { id: row.id },
            data: { status: 'DONE', lastError: 'POS not configured for tenant' },
          });
          return;
        }
        await runProcessOutboxRow(row, provider);
        await base.posOutbox.update({ where: { id: row.id }, data: { status: 'DONE' } });
      });
    } catch (err) {
      if (err instanceof DeferralError) {
        // ORDER_CREATED not yet complete — reset to PENDING so the next tick retries.
        await base.posOutbox.update({ where: { id: row.id }, data: { status: 'PENDING' } });
        continue;
      }
      const attempts = row.attempts + 1;
      const lastError = err instanceof Error ? err.message : String(err);
      if (attempts >= MAX_ATTEMPTS) {
        await base.posOutbox.update({ where: { id: row.id }, data: { status: 'FAILED', attempts, lastError } });
        logger.error('POS outbox row failed permanently', err, { event: 'pos_outbox_failed', rowId: row.id, orderId: row.orderId, tenantId: row.tenantId, attempts });
      } else {
        await base.posOutbox.update({ where: { id: row.id }, data: { status: 'PENDING', attempts, lastError } });
        logger.warn('POS outbox row will retry', { event: 'pos_outbox_retry', rowId: row.id, orderId: row.orderId, tenantId: row.tenantId, attempts, error: lastError });
      }
    }
  }

  const pending = await base.posOutbox.count({ where: { status: 'PENDING' } });
  if (pending > BACKLOG_THRESHOLD) {
    logger.warn('POS outbox backlog high', { event: 'pos_outbox_backlog_high', pending, threshold: BACKLOG_THRESHOLD });
  }
}

export function startOutboxWorker(): NodeJS.Timeout {
  logger.info('POS outbox worker starting', { pollMs: POLL_MS });
  return setInterval(() => {
    runOutboxOnce().catch((err) => logger.error('POS outbox worker loop crashed', err, { event: 'pos_worker_crashed' }));
  }, POLL_MS);
}
