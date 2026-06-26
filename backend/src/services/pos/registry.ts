import { logger } from '../../utils/logger';
import { PosProvider } from './PosProvider';
import { ForeverPosProvider } from './providers/foreverpos.provider';

// Use a minimal local type to avoid coupling to StoreSettings before Step 6 adds posProvider
type PosSettingsSlice = { posProvider?: string | null };

const providers = new Map<string, PosProvider>();

export function getPosProvider(settings: PosSettingsSlice): PosProvider | null {
  if (!settings.posProvider) return null;
  const provider = providers.get(settings.posProvider);
  if (!provider) {
    logger.warn('Unknown POS provider configured', { posProvider: settings.posProvider });
    return null;
  }
  return provider;
}

export function registerPosProvider(key: string, provider: PosProvider): void {
  providers.set(key, provider);
}

// Register built-in providers
registerPosProvider('foreverpos', new ForeverPosProvider());
