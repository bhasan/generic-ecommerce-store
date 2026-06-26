import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { logger as mockLogger } from '../../../utils/logger';
import { ForeverPosProvider } from './foreverpos.provider';
import type { PosOrderPayload } from '../orders/PosOrderSync';

const payload: PosOrderPayload = {
  id: 1,
  status: 'APPROVED',
  subtotal: 10,
  tax: 1,
  total: 11,
  deliveryMethod: 'PICKUP',
  items: [],
  payments: [{ id: 5, method: 'EXTERNAL', amount: 11, status: 'SETTLED' }],
};

describe('ForeverPosProvider', () => {
  let provider: ForeverPosProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new ForeverPosProvider();
  });

  it('shouldPushStatus returns true for APPROVED', () => {
    expect(provider.shouldPushStatus('APPROVED')).toBe(true);
  });

  it('shouldPushStatus returns true for DELIVERED', () => {
    expect(provider.shouldPushStatus('DELIVERED')).toBe(true);
  });

  it('shouldPushStatus returns false for PENDING', () => {
    expect(provider.shouldPushStatus('PENDING')).toBe(false);
  });

  it('shouldPushStatus returns false for ARRIVED', () => {
    expect(provider.shouldPushStatus('ARRIVED')).toBe(false);
  });

  it('pushOrder calls logger.info with orderId and status', async () => {
    await expect(provider.pushOrder(payload)).resolves.toBeUndefined();
    expect(mockLogger.info).toHaveBeenCalledWith(
      'ForeverPOS: pushOrder called',
      expect.objectContaining({ orderId: 1, status: 'APPROVED' })
    );
  });

  it('pushPayment calls logger.info with orderId and paymentIds', async () => {
    await expect(provider.pushPayment(payload)).resolves.toBeUndefined();
    expect(mockLogger.info).toHaveBeenCalledWith(
      'ForeverPOS: pushPayment called',
      expect.objectContaining({ orderId: 1, paymentIds: [5] })
    );
  });
});
