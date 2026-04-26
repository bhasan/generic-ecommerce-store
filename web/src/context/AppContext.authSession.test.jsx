import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleCategories, sampleConfig, sampleOrders, sampleProducts, users } from '../test/appFixtures';

const authApi = vi.hoisted(() => ({
  getProfile: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
}));

const usersApi = vi.hoisted(() => ({
  updateUser: vi.fn(),
}));

const productsApi = vi.hoisted(() => ({
  getAllProducts: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
}));

const ordersApi = vi.hoisted(() => ({
  getAllOrders: vi.fn(),
  createOrder: vi.fn(),
  checkDeliveryEligibility: vi.fn(),
  updateOrderStatus: vi.fn(),
  deleteOrder: vi.fn(),
  addItemToOrder: vi.fn(),
  voidOrderItem: vi.fn(),
  deleteOrderItem: vi.fn(),
  printOrderReceipt: vi.fn(),
}));

const categoriesApi = vi.hoisted(() => ({
  getAllCategories: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
}));

const notificationsApi = vi.hoisted(() => ({
  getNotifications: vi.fn(),
  getUnreadNotificationCount: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  getStaffNotificationCounts: vi.fn(),
}));

const configApi = vi.hoisted(() => ({
  getConfig: vi.fn(),
}));

const creditApi = vi.hoisted(() => ({
  getUserCredit: vi.fn(),
}));

const apiModule = vi.hoisted(() => ({
  getAuthToken: vi.fn(),
}));

const navigateSpy = vi.hoisted(() => vi.fn());

vi.mock('../services/authApi', () => authApi);
vi.mock('../services/usersApi', () => usersApi);
vi.mock('../services/productsApi', () => productsApi);
vi.mock('../services/ordersApi', () => ordersApi);
vi.mock('../services/categoriesApi', () => categoriesApi);
vi.mock('../services/notificationsApi', () => notificationsApi);
vi.mock('../services/configApi', () => configApi);
vi.mock('../services/creditApi', () => creditApi);
vi.mock('../services/api', async () => {
  const actual = await vi.importActual('../services/api');
  return {
    ...actual,
    getAuthToken: apiModule.getAuthToken,
  };
});

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateSpy,
    useLocation: () => ({ pathname: '/orders' }),
  };
});

describe('AppContext auth session recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    vi.spyOn(globalThis, 'setInterval').mockImplementation(() => 0);
    vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => {});
    apiModule.getAuthToken.mockReturnValue('token-123');
    authApi.getProfile.mockResolvedValue(users.customer);
    authApi.login.mockResolvedValue({ user: users.customer });
    productsApi.getAllProducts.mockResolvedValue(sampleProducts);
    ordersApi.getAllOrders.mockResolvedValue(sampleOrders);
    categoriesApi.getAllCategories.mockResolvedValue(sampleCategories);
    notificationsApi.getNotifications.mockResolvedValue([]);
    notificationsApi.getUnreadNotificationCount.mockResolvedValue({ count: 0 });
    notificationsApi.getStaffNotificationCounts.mockResolvedValue(null);
    notificationsApi.markNotificationRead.mockResolvedValue({ updated: true });
    notificationsApi.markAllNotificationsRead.mockResolvedValue({ updated: 0 });
    configApi.getConfig.mockResolvedValue(sampleConfig);
    creditApi.getUserCredit.mockResolvedValue({ balance: 20 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('recovers in the same tab after a forced logout when the user signs back in again', async () => {
    const { AppProvider, useApp } = await import('./AppContext');
    const wrapper = ({ children }) => <AppProvider>{children}</AppProvider>;
    const { result } = renderHook(() => useApp(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isAuthenticated).toBe(true);
    });

    await act(async () => {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.notification?.message).toBe('Your session has expired. Please log in again.');
    });
    expect(navigateSpy).toHaveBeenCalledWith('/login');

    await act(async () => {
      await result.current.login('customer-one', 'password123');
    });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.currentUser?.username).toBe('customer-one');
      expect(result.current.notification?.message).toBe('Login successful!');
    });
    expect(navigateSpy).toHaveBeenCalledWith('/products');
  });
});
