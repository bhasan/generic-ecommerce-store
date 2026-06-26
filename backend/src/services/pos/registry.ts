import { logger } from '../../utils/logger';
import { PosOrderSync } from './orders/PosOrderSync';
import { ForeverPosClient, ForeverPosConfig } from './providers/foreverpos/client';
import { ForeverPosOrderSync } from './providers/foreverpos/orders';
import type { StoreSettings } from '../storeSettings.service';

const FOREVERPOS = 'foreverpos';

/**
 * Build the shared ForeverPOS transport client from store settings, or null if not configured.
 * Every ForeverPOS capability (orders now, inventory later) resolves its client through here so
 * auth/config validation lives in one place.
 */
function buildForeverPosClient(settings: StoreSettings): ForeverPosClient | null {
  const c = settings.posConfig ?? {};
  if (!c.baseUrl || !c.username || !c.password) {
    logger.warn('ForeverPOS configured but transport config incomplete', { event: 'pos_auth_failed', have: Object.keys(c) });
    return null;
  }
  const cfg: ForeverPosConfig = { baseUrl: c.baseUrl, username: c.username, password: c.password };
  return new ForeverPosClient(cfg);
}

export function getOrderSync(settings: StoreSettings): PosOrderSync | null {
  if (!settings.posProvider) return null;
  if (settings.posProvider === FOREVERPOS) {
    const client = buildForeverPosClient(settings);
    if (!client) return null;
    const c = settings.posConfig ?? {};
    if (c.sakCatchAllProductId == null || c.sakCatchAllVariantId == null) {
      logger.warn('ForeverPOS order sync configured but catch-all product ids missing', { event: 'pos_auth_failed' });
      return null;
    }
    return new ForeverPosOrderSync(client, {
      sakCatchAllProductId: c.sakCatchAllProductId,
      sakCatchAllVariantId: c.sakCatchAllVariantId,
    });
  }
  logger.warn('Unknown POS provider configured', { posProvider: settings.posProvider });
  return null;
}
