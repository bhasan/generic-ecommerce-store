import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { logger } from '../../utils/logger';
import { getOrderSync } from './registry';
import type { StoreSettings } from '../storeSettings.service';

const baseSettings: StoreSettings = {
  name: 'Test Store',
  address: '123 Main St',
  phoneNumber: '555-1234',
  tagline: '',
  notificationEmails: { adminEmail: '', managementEmail: '', employeeEmail: '' },
  posProvider: null,
  posConfig: {},
};

const completeForeverposSettings: StoreSettings = {
  ...baseSettings,
  posProvider: 'foreverpos',
  posConfig: {
    baseUrl: 'https://pos.example.com',
    username: 'admin',
    password: 'secret',
    sakCatchAllProductId: 1,
    sakCatchAllVariantId: 2,
  },
};

describe('getOrderSync', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns non-null for foreverpos with complete config', () => {
    const result = getOrderSync(completeForeverposSettings);
    expect(result).not.toBeNull();
  });

  it('returns null and warns when foreverpos config is incomplete (missing baseUrl)', () => {
    const result = getOrderSync({
      ...completeForeverposSettings,
      posConfig: { username: 'admin', password: 'secret', sakCatchAllProductId: 1, sakCatchAllVariantId: 2 },
    });
    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      'ForeverPOS configured but posConfig incomplete',
      expect.objectContaining({ event: 'pos_auth_failed' }),
    );
  });

  it('returns null without warning when posProvider is null', () => {
    const result = getOrderSync({ ...baseSettings, posProvider: null });
    expect(result).toBeNull();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('returns null and warns for an unknown provider', () => {
    const result = getOrderSync({ ...baseSettings, posProvider: 'unknown-provider' });
    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      'Unknown POS provider configured',
      expect.objectContaining({ posProvider: 'unknown-provider' }),
    );
  });
});
