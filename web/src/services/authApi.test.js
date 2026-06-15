import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  setAuthToken: vi.fn(),
  clearAuthToken: vi.fn(),
}));

vi.mock('./api', () => api);

import * as authApi from './authApi';

describe('authApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('stores token and user data on login', async () => {
    api.post.mockResolvedValue({
      user: { id: 1, name: 'User' },
      token: 'token-123',
    });

    const result = await authApi.login('user@test.com', 'secret');

    expect(api.setAuthToken).toHaveBeenCalledWith('token-123');
    expect(JSON.parse(localStorage.getItem('userData'))).toEqual({ id: 1, name: 'User' });
    expect(result).toEqual({
      user: { id: 1, name: 'User' },
      token: 'token-123',
    });
  });

  it('always clears auth token on logout', async () => {
    api.post.mockRejectedValue(new Error('network'));

    await expect(authApi.logout()).rejects.toThrow('network');

    expect(api.clearAuthToken).toHaveBeenCalled();
  });
});
