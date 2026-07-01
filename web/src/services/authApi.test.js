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

  it('does not store any refresh token in JS on login (cookie-based)', async () => {
    api.post.mockResolvedValue({
      user: { id: 1, name: 'User' },
      token: 'token-123',
    });

    await authApi.login('user@test.com', 'secret');

    // Only the access token is stored; the refresh token is an httpOnly cookie.
    expect(api.setAuthToken).toHaveBeenCalledWith('token-123');
    expect(api.setAuthToken).toHaveBeenCalledTimes(1);
  });

  it('logs out by posting to /auth/logout (cookie sent automatically)', async () => {
    api.post.mockResolvedValue({ message: 'Logout successful' });

    await authApi.logout();

    expect(api.post).toHaveBeenCalledWith('/auth/logout', {});
    expect(api.clearAuthToken).toHaveBeenCalled();
  });

  it('always clears auth token on logout', async () => {
    api.post.mockRejectedValue(new Error('network'));

    await expect(authApi.logout()).rejects.toThrow('network');

    expect(api.clearAuthToken).toHaveBeenCalled();
  });

  it('exchanges the refresh cookie for a new access token', async () => {
    api.post.mockResolvedValue({ token: 'new-access' });

    const result = await authApi.refresh();

    expect(api.post).toHaveBeenCalledWith('/auth/refresh', {}, { skipAutoLogout: true });
    expect(api.setAuthToken).toHaveBeenCalledWith('new-access');
    expect(result).toEqual({ token: 'new-access' });
  });
});
