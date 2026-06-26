import { logger } from '../../utils/logger';
import { PosOrderSync } from './orders/PosOrderSync';
import { ForeverPosClient } from './providers/foreverpos/client';
import { ForeverPosOrderSync } from './providers/foreverpos/orders';
import type { StoreSettings } from '../storeSettings.service';

export function getOrderSync(settings: StoreSettings): PosOrderSync | null {
  if (!settings.posProvider) return null;
  if (settings.posProvider === 'foreverpos') {
    const c = settings.posConfig ?? {};
    if (!c.baseUrl || !c.username || !c.password || c.sakCatchAllProductId == null || c.sakCatchAllVariantId == null) {
      logger.warn('ForeverPOS configured but posConfig incomplete', { event: 'pos_auth_failed', have: Object.keys(c) });
      return null;
    }
    const cfg = {
      baseUrl: c.baseUrl, username: c.username, password: c.password,
      sakCatchAllProductId: c.sakCatchAllProductId, sakCatchAllVariantId: c.sakCatchAllVariantId,
    };
    return new ForeverPosOrderSync(new ForeverPosClient(cfg), cfg);
  }
  logger.warn('Unknown POS provider configured', { posProvider: settings.posProvider });
  return null;
}
