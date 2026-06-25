import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  setAuthToken: vi.fn(),
  setRefreshToken: vi.fn(),
  getRefreshToken: vi.fn(),
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

  it('stores the refresh token on login', async () => {
    api.post.mockResolvedValue({
      user: { id: 1, name: 'User' },
      token: 'token-123',
      refreshToken: 'refresh-123',
    });

    await authApi.login('user@test.com', 'secret');

    expect(api.setRefreshToken).toHaveBeenCalledWith('refresh-123');
  });

  it('sends the stored refresh token when logging out', async () => {
    api.getRefreshToken.mockReturnValue('refresh-xyz');
    api.post.mockResolvedValue({ message: 'Logout successful' });

    await authApi.logout();

    expect(api.post).toHaveBeenCalledWith('/auth/logout', { refreshToken: 'refresh-xyz' });
  });

  it('always clears auth token on logout', async () => {
    api.post.mockRejectedValue(new Error('network'));

    await expect(authApi.logout()).rejects.toThrow('network');

    expect(api.clearAuthToken).toHaveBeenCalled();
  });

  it('exchanges a refresh token for new tokens', async () => {
    api.post.mockResolvedValue({ token: 'new-access', refreshToken: 'new-refresh' });

    const result = await authApi.refresh('old-refresh');

    expect(api.post).toHaveBeenCalledWith(
      '/auth/refresh',
      { refreshToken: 'old-refresh' },
      { skipAutoLogout: true }
    );
    expect(api.setAuthToken).toHaveBeenCalledWith('new-access');
    expect(api.setRefreshToken).toHaveBeenCalledWith('new-refresh');
    expect(result).toEqual({ token: 'new-access', refreshToken: 'new-refresh' });
  });
});
