import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../storeSettings.service');
vi.mock('./registry');
vi.mock('./retry');
vi.mock('../../config/database');

import { StoreSettingsService } from '../storeSettings.service';
import { getPosProvider } from './registry';
import { retryWithBackoff } from './retry';
import prisma from '../../config/database';
import { pushOrderCreated, pushOrderUpdated } from './posService';
import type { PosProvider } from './PosProvider';

const mockOrder = {
  id: 1,
  status: 'APPROVED',
  deliveryMethod: 'PICKUP',
  subtotal: { toNumber: () => 10 },
  tax: { toNumber: () => 1 },
  total: { toNumber: () => 11 },
  items: [{ productName: 'A', variantLabel: 'B', quantity: 1, unitPrice: { toNumber: () => 10 } }],
  payments: [{ id: 5, method: 'EXTERNAL', amount: { toNumber: () => 11 }, status: 'SETTLED' }],
};

const makeMockProvider = (overrides: Partial<PosProvider> = {}): PosProvider => ({
  shouldPushStatus: vi.fn().mockReturnValue(true),
  pushOrder: vi.fn().mockResolvedValue(undefined),
  pushPayment: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe('posService', () => {
  let mockGetStoreSettings: ReturnType<typeof vi.fn>;
  let mockGetPosProvider: ReturnType<typeof vi.mocked<typeof getPosProvider>>;
  let mockRetryWithBackoff: ReturnType<typeof vi.mocked<typeof retryWithBackoff>>;
  let mockPrisma: ReturnType<typeof vi.mocked<typeof prisma>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetStoreSettings = vi.fn().mockResolvedValue({ posProvider: 'foreverpos' });
    vi.mocked(StoreSettingsService).mockImplementation(() => ({
      getStoreSettings: mockGetStoreSettings,
    }) as any);

    mockGetPosProvider = vi.mocked(getPosProvider);
    mockRetryWithBackoff = vi.mocked(retryWithBackoff).mockResolvedValue(undefined);
    mockPrisma = vi.mocked(prisma) as any;
  });

  describe('pushOrderCreated', () => {
    it('returns early without calling retry when getPosProvider returns null', async () => {
      mockGetPosProvider.mockReturnValue(null);

      await pushOrderCreated(1);

      expect(mockRetryWithBackoff).not.toHaveBeenCalled();
    });

    it('returns early when order is not found', async () => {
      const provider = makeMockProvider();
      mockGetPosProvider.mockReturnValue(provider);
      (mockPrisma as any).order = { findUnique: vi.fn().mockResolvedValue(null) };

      await pushOrderCreated(1);

      expect(mockRetryWithBackoff).not.toHaveBeenCalled();
    });

    it('calls retryWithBackoff twice with correct payload when provider exists', async () => {
      const provider = makeMockProvider();
      mockGetPosProvider.mockReturnValue(provider);
      (mockPrisma as any).order = { findUnique: vi.fn().mockResolvedValue(mockOrder) };

      await pushOrderCreated(1);

      expect(mockRetryWithBackoff).toHaveBeenCalledTimes(2);
      expect(mockRetryWithBackoff).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ label: 'ForeverPOS pushOrder', context: { orderId: 1 } })
      );
      expect(mockRetryWithBackoff).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ label: 'ForeverPOS pushPayment', context: { orderId: 1 } })
      );
    });
  });

  describe('pushOrderUpdated', () => {
    it('returns early when getPosProvider returns null', async () => {
      mockGetPosProvider.mockReturnValue(null);

      await pushOrderUpdated(1);

      expect(mockRetryWithBackoff).not.toHaveBeenCalled();
    });

    it('returns early when provider.shouldPushStatus returns false', async () => {
      const provider = makeMockProvider({ shouldPushStatus: vi.fn().mockReturnValue(false) });
      mockGetPosProvider.mockReturnValue(provider);
      (mockPrisma as any).order = { findUnique: vi.fn().mockResolvedValue(mockOrder) };

      await pushOrderUpdated(1);

      expect(mockRetryWithBackoff).not.toHaveBeenCalled();
    });

    it('calls retryWithBackoff twice when shouldPushStatus returns true', async () => {
      const provider = makeMockProvider({ shouldPushStatus: vi.fn().mockReturnValue(true) });
      mockGetPosProvider.mockReturnValue(provider);
      (mockPrisma as any).order = { findUnique: vi.fn().mockResolvedValue(mockOrder) };

      await pushOrderUpdated(1);

      expect(mockRetryWithBackoff).toHaveBeenCalledTimes(2);
    });

    it('payload has correct payment shape including id and toNumber fields', async () => {
      const provider = makeMockProvider({ shouldPushStatus: vi.fn().mockReturnValue(true) });
      mockGetPosProvider.mockReturnValue(provider);
      (mockPrisma as any).order = { findUnique: vi.fn().mockResolvedValue(mockOrder) };

      // Capture the fn passed to retryWithBackoff for pushOrder
      let capturedPayload: any;
      mockRetryWithBackoff.mockImplementation(async (fn, opts) => {
        if (opts.label === 'ForeverPOS pushOrder') {
          // Spy on provider.pushOrder to capture payload
          const original = provider.pushOrder;
          (provider as any).pushOrder = async (p: any) => { capturedPayload = p; };
          await fn();
          (provider as any).pushOrder = original;
        }
      });

      await pushOrderUpdated(1);

      expect(capturedPayload).toBeDefined();
      expect(capturedPayload.payments).toHaveLength(1);
      expect(capturedPayload.payments[0]).toMatchObject({
        id: 5,
        method: 'EXTERNAL',
        amount: 11,
        status: 'SETTLED',
      });
    });
  });
});
