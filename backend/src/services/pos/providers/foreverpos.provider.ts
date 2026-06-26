import { logger } from '../../../utils/logger';
import { PosProvider, PosOrderPayload } from '../PosProvider';

// TODO: refine once ForeverPOS vendor behavior is verified
const FOREVERPOS_PUSHABLE_STATUSES = ['APPROVED', 'DELIVERED'];

/**
 * Auth: lazy token fetch on first call, cache in-memory, refresh on 401
 * TODO: implement once ForeverPOS auth approach confirmed (user/password → token, or API key)
 * Credentials: read from posConfig (decrypted) passed to constructor, or env vars
 */
export class ForeverPosProvider implements PosProvider {
  constructor(config?: { baseUrl?: string }) {
    // TODO: store baseUrl from config or FOREVERPOS_BASE_URL env var when implementing actual API calls
    void config; // Suppress unused parameter warning
  }

  shouldPushStatus(status: string): boolean {
    // TODO: refine once ForeverPOS vendor behavior is verified
    return FOREVERPOS_PUSHABLE_STATUSES.includes(status);
  }

  async pushOrder(order: PosOrderPayload): Promise<void> {
    logger.info('ForeverPOS: pushOrder called', { orderId: order.id, status: order.status });

    // TODO: implement when API docs available
    // POST to ForeverPOS order endpoint with order payload
    // Auth: see auth stub below
  }

  async pushPayment(order: PosOrderPayload): Promise<void> {
    logger.info('ForeverPOS: pushPayment called', {
      orderId: order.id,
      paymentIds: order.payments.map(p => p.id),
    });

    // TODO: implement when API docs available
    // POST to ForeverPOS payment endpoint with payment payload
    // Reference payments[].id as paymentId for correlation
  }
}
