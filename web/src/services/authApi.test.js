import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => ({
  post: vi.fn(),
  get: vi.fn(),
  setAuthToken: vi.fn(),
  clearAuthToken: vi.fn(),
}));

describe('authApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('stores token and user data on login', async () => {
    const api = await import('./api');
    api.post.mockResolvedValue({
      user: { id: 1, name: 'User' },
      token: 'token-123',
    });
    const authApi = await import('./authApi');

    const result = await authApi.login('user@test.com', 'secret');

    expect(api.setAuthToken).toHaveBeenCalledWith('token-123');
    expect(JSON.parse(localStorage.getItem('userData'))).toEqual({ id: 1, name: 'User' });
    expect(result).toEqual({
      user: { id: 1, name: 'User' },
      token: 'token-123',
    });
  });

  it('always clears auth token on logout', async () => {
    const api = await import('./api');
    api.post.mockRejectedValue(new Error('network'));
    const authApi = await import('./authApi');

    await expect(authApi.logout()).rejects.toThrow('network');

    expect(api.clearAuthToken).toHaveBeenCalled();
  });
});
