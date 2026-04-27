import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './AppContext';
import { sampleCategories, sampleConfig, sampleOrders, sampleProducts, users } from '../test/appFixtures';
import { renderWithProviders } from '../test/renderWithProviders';

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

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function AuthHarness() {
  const { isLoading, isAuthenticated, currentUser, notification, login } = useApp();

  return (
    <div>
      <div data-testid="loading">{String(isLoading)}</div>
      <div data-testid="authenticated">{String(isAuthenticated)}</div>
      <div data-testid="username">{currentUser?.username || 'guest'}</div>
      <div data-testid="notification">{notification?.message || ''}</div>
      <button type="button" onClick={() => login('customer-one', 'password123')}>
        Trigger Login
      </button>
    </div>
  );
}

describe('AppContext auth session recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
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
    renderWithProviders(
      <AppProvider>
        <LocationProbe />
        <AuthHarness />
      </AppProvider>,
      { route: '/orders' }
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
    });

    await act(async () => {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
      expect(screen.getByTestId('notification')).toHaveTextContent('Your session has expired. Please log in again.');
    });
    expect(screen.getByTestId('location')).toHaveTextContent('/login');

    await act(async () => {
      fireEvent.click(screen.getByText('Trigger Login'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
      expect(screen.getByTestId('username')).toHaveTextContent('customer-one');
      expect(screen.getByTestId('notification')).toHaveTextContent('Login successful!');
    });
    expect(screen.getByTestId('location')).toHaveTextContent('/products');
  });
});
