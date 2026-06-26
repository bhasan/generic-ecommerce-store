import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { logger as mockLogger } from '../../utils/logger';
import { getOrderSync, registerProvider } from './registry';
import type { PosOrderSync } from './orders/PosOrderSync';

const makeMockProvider = (): PosOrderSync => ({
  shouldPushStatus: vi.fn().mockReturnValue(true),
  pushOrder: vi.fn().mockResolvedValue(undefined),
  pushPayment: vi.fn().mockResolvedValue(undefined),
});

describe('registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getOrderSync returns a non-null provider for foreverpos', () => {
    const provider = getOrderSync({ posProvider: 'foreverpos' });
    expect(provider).not.toBeNull();
  });

  it('getOrderSync returns null for null posProvider without warning', () => {
    const provider = getOrderSync({ posProvider: null });
    expect(provider).toBeNull();
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('getOrderSync returns null for undefined posProvider without warning', () => {
    const provider = getOrderSync({ posProvider: undefined });
    expect(provider).toBeNull();
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('getOrderSync returns null and logs a warning for an unknown provider', () => {
    const provider = getOrderSync({ posProvider: 'unknown-provider' });
    expect(provider).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Unknown or order-sync-less POS provider configured',
      expect.objectContaining({ posProvider: 'unknown-provider' })
    );
  });

  it('registerProvider then getOrderSync returns the registered provider', () => {
    const mock = makeMockProvider();
    registerProvider('test-key', { orderSync: mock });
    const result = getOrderSync({ posProvider: 'test-key' });
    expect(result).toBe(mock);
  });
});
