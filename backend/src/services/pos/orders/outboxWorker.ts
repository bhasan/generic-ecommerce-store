import prisma from '../../../config/database';
import { Prisma } from '../../../../generated/prisma';
import { logger } from '../../../utils/logger';
import { processOutboxRow, countPending, DeferralError } from './posOrderService';

const MAX_ATTEMPTS = 5;
const POLL_MS = Number(process.env.POS_OUTBOX_POLL_MS ?? 30000);
const BATCH = 10;
const BACKLOG_THRESHOLD = Number(process.env.POS_OUTBOX_BACKLOG_THRESHOLD ?? 50);

interface OutboxRow { id: number; orderId: number; provider: string; type: string; attempts: number; }

export async function runOutboxOnce(): Promise<void> {
  const rows = await prisma.$queryRaw<OutboxRow[]>(Prisma.sql`
    SELECT id, "orderId", provider, type, attempts
    FROM pos_outbox
    WHERE status = 'PENDING'
    ORDER BY id
    LIMIT ${BATCH}
    FOR UPDATE SKIP LOCKED
  `);

  for (const row of rows) {
    try {
      await processOutboxRow(row);
      await prisma.posOutbox.update({ where: { id: row.id }, data: { status: 'DONE' } });
    } catch (err) {
      if (err instanceof DeferralError) continue;
      const attempts = row.attempts + 1;
      const lastError = err instanceof Error ? err.message : String(err);
      if (attempts >= MAX_ATTEMPTS) {
        await prisma.posOutbox.update({ where: { id: row.id }, data: { status: 'FAILED', attempts, lastError } });
        logger.error('POS outbox row failed permanently', err, { event: 'pos_outbox_failed', rowId: row.id, orderId: row.orderId, attempts });
      } else {
        await prisma.posOutbox.update({ where: { id: row.id }, data: { status: 'PENDING', attempts, lastError } });
        logger.warn('POS outbox row will retry', { event: 'pos_outbox_retry', rowId: row.id, orderId: row.orderId, attempts, error: lastError });
      }
    }
  }

  if (rows.length === 0) return;

  const pending = await countPending();
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
