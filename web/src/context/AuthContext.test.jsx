// web/src/context/AuthContext.test.jsx
import { renderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuthContext } from './AuthContext';
import { UIProvider } from './UIContext';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../services/authApi', () => ({
  getProfile: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('../services/usersApi', () => ({ updateUser: vi.fn() }));
vi.mock('../services/storeCreditApi', () => ({ getUserCredit: vi.fn() }));
vi.mock('../services/api', () => ({ getAuthToken: vi.fn(() => null), newSession: vi.fn() }));

import * as authApi from '../services/authApi';
import * as storeCreditApi from '../services/storeCreditApi';

const wrapper = ({ children }) => (
  <MemoryRouter>
    <UIProvider>
      <AuthProvider>{children}</AuthProvider>
    </UIProvider>
  </MemoryRouter>
);

describe('AuthContext', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts unauthenticated when no token is stored', async () => {
    const { result } = renderHook(() => useAuthContext(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('login sets isAuthenticated on success', async () => {
    authApi.login.mockResolvedValue({ user: { id: 1, username: 'bilal', roles: ['CUSTOMER'] } });
    storeCreditApi.getUserCredit.mockResolvedValue({ balance: 0 });
    const { result } = renderHook(() => useAuthContext(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(() => result.current.login('bilal', 'pw'));
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.currentUser.username).toBe('bilal');
  });

  it('logout clears currentUser', async () => {
    authApi.login.mockResolvedValue({ user: { id: 1, username: 'bilal', roles: ['CUSTOMER'] } });
    authApi.logout.mockResolvedValue({});
    storeCreditApi.getUserCredit.mockResolvedValue({ balance: 0 });
    const { result } = renderHook(() => useAuthContext(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(() => result.current.login('bilal', 'pw'));
    await act(() => result.current.logout());
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('logout clears the persisted store selection', async () => {
    authApi.login.mockResolvedValue({ user: { id: 1, username: 'bilal', roles: ['CUSTOMER'] } });
    authApi.logout.mockResolvedValue({});
    storeCreditApi.getUserCredit.mockResolvedValue({ balance: 0 });
    localStorage.setItem('selectedStoreId', '0');
    const { result } = renderHook(() => useAuthContext(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(() => result.current.login('bilal', 'pw'));
    await act(() => result.current.logout());
    // Next principal on this browser must not inherit the prior store selection.
    expect(localStorage.getItem('selectedStoreId')).toBeNull();
  });

  it('throws when used outside AuthProvider', () => {
    const miniWrapper = ({ children }) => <MemoryRouter><UIProvider>{children}</UIProvider></MemoryRouter>;
    expect(() => renderHook(() => useAuthContext(), { wrapper: miniWrapper })).toThrow('useAuthContext must be used within AuthProvider');
  });
});
