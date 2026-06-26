import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { ForeverPosClient, ForeverPosConfig } from './client';
import { logger } from '../../../../utils/logger';

const cfg: ForeverPosConfig = {
  baseUrl: 'https://sak.test', username: 'u@e.com', password: 'pw',
  sakCatchAllProductId: 1, sakCatchAllVariantId: 2,
};

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

beforeEach(() => vi.restoreAllMocks());

describe('ForeverPosClient', () => {
  it('authenticates then sends the request with a bearer token', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'TOK' }))   // login
      .mockResolvedValueOnce(jsonResponse({ voucherId: 7 }));        // POST
    vi.stubGlobal('fetch', fetchMock);

    const client = new ForeverPosClient(cfg);
    const res = await client.request<{ voucherId: number }>('POST', '/api/Voucher/order', { a: 1 });

    expect(res.voucherId).toBe(7);
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://sak.test/api/Users/login-email', expect.objectContaining({ method: 'POST' }));
    const second = fetchMock.mock.calls[1];
    expect(second[0]).toBe('https://sak.test/api/Voucher/order');
    expect((second[1] as any).headers.Authorization).toBe('Bearer TOK');
  });

  it('refreshes the token once on 401 and retries', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'OLD' }))   // login
      .mockResolvedValueOnce(jsonResponse({ msg: 'no' }, 401))        // first call 401
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'NEW' }))   // re-login
      .mockResolvedValueOnce(jsonResponse({ ok: true }));            // retry ok
    vi.stubGlobal('fetch', fetchMock);

    const client = new ForeverPosClient(cfg);
    await client.request('PUT', '/api/Voucher/bulk-update', {});
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('logs pos_auth_failed and throws when login fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'bad' }, 401)));
    const client = new ForeverPosClient(cfg);
    await expect(client.request('POST', '/x', {})).rejects.toThrow();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('auth'), expect.anything(), expect.objectContaining({ event: 'pos_auth_failed' }));
  });
});
