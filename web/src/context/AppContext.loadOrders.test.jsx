import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Paths relative to this test file (src/context/)
vi.mock('../services/ordersApi', () => ({ getAllOrders: vi.fn() }));
vi.mock('../services/authApi', () => ({
  // AppContext calls getProfile() for its auth check (not getCurrentUser)
  getProfile: vi.fn().mockResolvedValue({
    id: 1, username: 'testuser', email: 'test@example.com', roles: ['CUSTOMER'],
  }),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
}));
vi.mock('../services/productsApi', () => ({ getAllProducts: vi.fn().mockResolvedValue([]) }));
vi.mock('../services/categoriesApi', () => ({ getAllCategories: vi.fn().mockResolvedValue([]) }));
vi.mock('../services/notificationsApi', () => ({
  getNotifications: vi.fn().mockResolvedValue([]),
  getUnreadNotificationCount: vi.fn().mockResolvedValue({ count: 0 }),
  getStaffNotificationCounts: vi.fn().mockResolvedValue({ ordersByStatus: {}, pendingRegistrations: 0 }),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));
vi.mock('../services/configApi', () => ({ getConfig: vi.fn().mockResolvedValue({}) }));
// AppContext calls getUserCredit(userId), not getMyCredit
vi.mock('../services/creditApi', () => ({ getUserCredit: vi.fn().mockResolvedValue({ balance: 0 }) }));
// Return a token so the auth check proceeds and isAuthenticated becomes true
vi.mock('../services/api', () => ({ getAuthToken: vi.fn().mockReturnValue('test-token') }));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useLocation: () => ({ pathname: '/' }),
  };
});

/**
 * Renders AppProvider + useApp hook and waits for the initial auth check to
 * settle (isLoading → false, isAuthenticated → true).
 */
async function setupHook() {
  const { AppProvider, useApp } = await import('./AppContext');
  const ordersApi = await import('../services/ordersApi');

  // Block the initial orders fetch so the hook starts in a clean state.
  let resolveInitial;
  ordersApi.getAllOrders.mockReturnValue(
    new Promise((r) => { resolveInitial = r; })
  );

  const wrapper = ({ children }) => <AppProvider>{children}</AppProvider>;
  const { result } = renderHook(() => useApp(), { wrapper });

  // Wait for auth to finish (isLoading → false, isAuthenticated → true)
  await waitFor(() => {
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isAuthenticated).toBe(true);
  });

  // Drain any pending orders fetch triggered by the mount effect
  await act(async () => { resolveInitial([]); });
  await waitFor(() => expect(result.current.isLoadingOrders).toBe(false));

  return { result, ordersApi };
}

describe('AppContext › loadOrders silent parameter', () => {

  it('sets isLoadingOrders=true while a normal (non-silent) fetch is in flight', async () => {
    const { result, ordersApi } = await setupHook();

    let resolveFetch;
    ordersApi.getAllOrders.mockReturnValue(
      new Promise((r) => { resolveFetch = r; })
    );

    // Start a non-silent fetch without awaiting — observe in-flight loading state
    act(() => { result.current.loadOrders(); });

    // isLoadingOrders must be true while the request is pending
    await waitFor(() => expect(result.current.isLoadingOrders).toBe(true));

    // Resolve and confirm loading clears
    await act(async () => { resolveFetch([]); });
    expect(result.current.isLoadingOrders).toBe(false);
  });

  it('never sets isLoadingOrders=true during a silent fetch', async () => {
    const { result, ordersApi } = await setupHook();

    let resolveFetch;
    ordersApi.getAllOrders.mockReturnValue(
      new Promise((r) => { resolveFetch = r; })
    );

    // Start a silent background fetch
    act(() => { result.current.loadOrders(true); });

    // isLoadingOrders must stay false while the request is in flight
    expect(result.current.isLoadingOrders).toBe(false);

    await act(async () => { resolveFetch([]); });

    // Must also be false after resolution
    expect(result.current.isLoadingOrders).toBe(false);
  });
});
