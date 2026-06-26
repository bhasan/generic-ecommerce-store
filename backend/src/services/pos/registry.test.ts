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
import { getPosProvider, registerPosProvider } from './registry';
import type { PosProvider } from './PosProvider';

const makeMockProvider = (): PosProvider => ({
  shouldPushStatus: vi.fn().mockReturnValue(true),
  pushOrder: vi.fn().mockResolvedValue(undefined),
  pushPayment: vi.fn().mockResolvedValue(undefined),
});

describe('registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getPosProvider returns a non-null provider for foreverpos', () => {
    const provider = getPosProvider({ posProvider: 'foreverpos' });
    expect(provider).not.toBeNull();
  });

  it('getPosProvider returns null for null posProvider without warning', () => {
    const provider = getPosProvider({ posProvider: null });
    expect(provider).toBeNull();
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('getPosProvider returns null for undefined posProvider without warning', () => {
    const provider = getPosProvider({ posProvider: undefined });
    expect(provider).toBeNull();
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('getPosProvider returns null and logs a warning for an unknown provider', () => {
    const provider = getPosProvider({ posProvider: 'unknown-provider' });
    expect(provider).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Unknown POS provider configured',
      expect.objectContaining({ posProvider: 'unknown-provider' })
    );
  });

  it('registerPosProvider then getPosProvider returns the registered provider', () => {
    const mock = makeMockProvider();
    registerPosProvider('test-key', mock);
    const result = getPosProvider({ posProvider: 'test-key' });
    expect(result).toBe(mock);
  });
});
