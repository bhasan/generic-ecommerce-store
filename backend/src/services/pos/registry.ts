import { logger } from '../../utils/logger';
import { PosOrderSync } from './orders/PosOrderSync';
import { ForeverPosProvider } from './providers/foreverpos.provider';

export interface PosCapabilities {
  orderSync?: PosOrderSync;
}

type PosSettingsSlice = { posProvider?: string | null };

const providers = new Map<string, PosCapabilities>();

export function registerProvider(key: string, caps: PosCapabilities): void {
  providers.set(key, caps);
}

export function getOrderSync(settings: PosSettingsSlice): PosOrderSync | null {
  if (!settings.posProvider) return null;
  const caps = providers.get(settings.posProvider);
  if (!caps?.orderSync) {
    logger.warn('Unknown or order-sync-less POS provider configured', { posProvider: settings.posProvider });
    return null;
  }
  return caps.orderSync;
}

// Register built-in providers
registerProvider('foreverpos', { orderSync: new ForeverPosProvider() });
