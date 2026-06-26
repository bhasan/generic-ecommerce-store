import { logger } from '../../../utils/logger';
import { PosOrderSync, PosContext } from '../orders/PosOrderSync';

// TODO: refine once ForeverPOS vendor behavior is verified
const FOREVERPOS_PUSHABLE_STATUSES = ['APPROVED', 'DELIVERED'];

/**
 * Auth: lazy token fetch on first call, cache in-memory, refresh on 401
 * TODO: implement once ForeverPOS auth approach confirmed (user/password → token, or API key)
 * Credentials: read from posConfig (decrypted) passed to constructor, or env vars
 */
export class ForeverPosProvider implements PosOrderSync {
  constructor(config?: { baseUrl?: string }) {
    // TODO: store baseUrl from config or FOREVERPOS_BASE_URL env var when implementing actual API calls
    void config; // Suppress unused parameter warning
  }

  shouldPushStatus(status: string): boolean {
    // TODO: refine once ForeverPOS vendor behavior is verified
    return FOREVERPOS_PUSHABLE_STATUSES.includes(status);
  }

  async pushOrder(ctx: PosContext): Promise<{ externalId: string | null }> {
    logger.info('ForeverPOS: pushOrder called', { orderId: ctx.order.id, status: ctx.order.status });

    // TODO: implement when API docs available
    // POST to ForeverPOS order endpoint with order payload
    // Auth: see auth stub below
    return { externalId: null };
  }

  async pushStatus(ctx: PosContext): Promise<void> {
    logger.info('ForeverPOS: pushStatus called', { orderId: ctx.order.id, externalId: ctx.externalId });

    // TODO: implement when API docs available
    // POST to ForeverPOS status endpoint with order payload
  }
}
