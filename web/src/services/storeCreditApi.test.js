import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('./api', () => api);

import * as storeCreditApi from './storeCreditApi';

describe('storeCreditApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('URL paths use /storecredit/ (not /credits/)', () => {
    it('getUserCredit calls GET /storecredit/:userId', async () => {
      api.get.mockResolvedValue({ balance: 42 });
      await storeCreditApi.getUserCredit(7);
      expect(api.get).toHaveBeenCalledWith('/storecredit/7');
    });

    it('getStoreCreditTransactions calls GET /storecredit/:userId/transactions', async () => {
      api.get.mockResolvedValue([]);
      await storeCreditApi.getStoreCreditTransactions(7);
      expect(api.get).toHaveBeenCalledWith('/storecredit/7/transactions');
    });

    it('addCredit calls POST /storecredit/:userId/add', async () => {
      api.post.mockResolvedValue({ newBalance: 67 });
      await storeCreditApi.addCredit(7, 25, 'bonus');
      expect(api.post).toHaveBeenCalledWith('/storecredit/7/add', { amount: 25, note: 'bonus' });
    });

    it('removeCredit calls POST /storecredit/:userId/remove', async () => {
      api.post.mockResolvedValue({ newBalance: 17 });
      await storeCreditApi.removeCredit(7, 25, 'correction');
      expect(api.post).toHaveBeenCalledWith('/storecredit/7/remove', { amount: 25, note: 'correction' });
    });
  });

  it('addCredit omits note from payload when not provided', async () => {
    api.post.mockResolvedValue({ newBalance: 50 });
    await storeCreditApi.addCredit(3, 10);
    expect(api.post).toHaveBeenCalledWith('/storecredit/3/add', { amount: 10 });
  });

  it('removeCredit omits note from payload when not provided', async () => {
    api.post.mockResolvedValue({ newBalance: 0 });
    await storeCreditApi.removeCredit(3, 10);
    expect(api.post).toHaveBeenCalledWith('/storecredit/3/remove', { amount: 10 });
  });
});
