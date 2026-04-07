import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, beforeEach, expect, it, vi } from 'vitest';
import { useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './AppContext';
import { renderWithProviders } from '../test/renderWithProviders';
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
  updateOrderStatus: vi.fn(),
  deleteOrder: vi.fn(),
  addItemToOrder: vi.fn(),
  voidOrderItem: vi.fn(),
  deleteOrderItem: vi.fn(),
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

function ContextHarness() {
  const app = useApp();

  return (
    <div>
      <div data-testid="username">{app.currentUser?.username || 'guest'}</div>
      <div data-testid="roles">{JSON.stringify(app.currentUser?.roles || [])}</div>
      <div data-testid="authenticated">{String(app.isAuthenticated)}</div>
      <div data-testid="products-count">{app.products.length}</div>
      <div data-testid="orders-count">{app.orders.length}</div>
      <div data-testid="categories-count">{app.categories.length}</div>
      <div data-testid="credit-balance">{app.creditBalance}</div>
      <div data-testid="minimum-delivery-order">{app.minimumDeliveryOrder}</div>
      <div data-testid="staff-notifications">{JSON.stringify(app.staffNotificationCounts)}</div>
      <div data-testid="unread-notification-count">{app.unreadNotificationCount}</div>
      <div data-testid="inbox-notifications">{JSON.stringify(app.inboxNotifications)}</div>
      <div data-testid="notification">{app.notification?.message || ''}</div>
      <div data-testid="cart-count">{app.cart.length}</div>
      <button onClick={() => app.addToCart(sampleProducts[0], 1)}>Add To Cart</button>
      <button onClick={() => app.checkout('', 'PICKUP', 'CREDIT')}>Checkout With Credit</button>
      <button onClick={() => app.markNotificationRead(11)}>Mark Notification Read</button>
      <button onClick={() => app.login('driver', 'driver123')}>Trigger Login</button>
    </div>
  );
}

describe('AppContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    apiModule.getAuthToken.mockReturnValue(null);
    authApi.getProfile.mockResolvedValue(users.customer);
    productsApi.getAllProducts.mockResolvedValue(sampleProducts);
    ordersApi.getAllOrders.mockResolvedValue(sampleOrders);
    categoriesApi.getAllCategories.mockResolvedValue(sampleCategories);
    notificationsApi.getStaffNotificationCounts.mockResolvedValue({ pendingRegistrations: 2, ordersByStatus: { READY: 1 } });
    notificationsApi.getNotifications.mockResolvedValue([
      { id: 11, title: 'New order', message: 'Order #11 is waiting.', requiresAttention: true, readAt: null, metadata: { path: '/orders' } }
    ]);
    notificationsApi.getUnreadNotificationCount.mockResolvedValue({ count: 1 });
    notificationsApi.markNotificationRead.mockResolvedValue({ updated: true });
    notificationsApi.markAllNotificationsRead.mockResolvedValue({ updated: 1 });
    configApi.getConfig.mockResolvedValue(sampleConfig);
    creditApi.getUserCredit.mockResolvedValue({ balance: 20 });
  });

  it('bootstraps authenticated state and normalizes single-role profiles', async () => {
    apiModule.getAuthToken.mockReturnValue('token-123');
    authApi.getProfile.mockResolvedValue({ id: 4, username: 'admin-one', role: 'ADMIN' });

    renderWithProviders(
      <AppProvider>
        <LocationProbe />
        <ContextHarness />
      </AppProvider>,
      { route: '/orders' }
    );

    await waitFor(() => expect(screen.getByTestId('username')).toHaveTextContent('admin-one'));
    await waitFor(() => expect(screen.getByTestId('orders-count')).toHaveTextContent('1'));

    expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
    expect(screen.getByTestId('roles')).toHaveTextContent('ADMIN');
    expect(screen.getByTestId('products-count')).toHaveTextContent('1');
    expect(screen.getByTestId('categories-count')).toHaveTextContent('1');
    expect(screen.getByTestId('credit-balance')).toHaveTextContent('20');
    expect(screen.getByTestId('minimum-delivery-order')).toHaveTextContent('35');
    expect(screen.getByTestId('staff-notifications')).toHaveTextContent('pendingRegistrations');
    expect(screen.getByTestId('unread-notification-count')).toHaveTextContent('1');
  });

  it('redirects to login and clears auth state after an unauthorized event', async () => {
    apiModule.getAuthToken.mockReturnValue('token-123');
    authApi.getProfile.mockResolvedValue(users.customer);

    renderWithProviders(
      <AppProvider>
        <LocationProbe />
        <ContextHarness />
      </AppProvider>,
      { route: '/orders' }
    );

    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));

    await act(async () => {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    });

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login'));
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
    expect(screen.getByTestId('notification')).toHaveTextContent('Your session has expired. Please log in again.');
  });

  it('refreshes orders and credit balance after a credit checkout', async () => {
    apiModule.getAuthToken.mockReturnValue('token-123');
    authApi.getProfile.mockResolvedValue(users.customer);
    ordersApi.getAllOrders
      .mockResolvedValueOnce(sampleOrders)
      .mockResolvedValueOnce([...sampleOrders, { id: 302, status: 'PLACED', items: [] }]);
    ordersApi.createOrder.mockResolvedValue({ id: 302, status: 'PLACED' });
    creditApi.getUserCredit
      .mockResolvedValueOnce({ balance: 20 })
      .mockResolvedValueOnce({ balance: 5 });

    renderWithProviders(
      <AppProvider>
        <ContextHarness />
      </AppProvider>,
      { route: '/checkout' }
    );

    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));

    fireEvent.click(screen.getByText('Add To Cart'));
    expect(screen.getByTestId('cart-count')).toHaveTextContent('1');

    await act(async () => {
      fireEvent.click(screen.getByText('Checkout With Credit'));
    });

    await waitFor(() => expect(screen.getByTestId('orders-count')).toHaveTextContent('2'));
    expect(screen.getByTestId('credit-balance')).toHaveTextContent('5');
    expect(screen.getByTestId('cart-count')).toHaveTextContent('0');
    expect(ordersApi.createOrder).toHaveBeenCalledWith([{ productId: 101, quantity: 1 }], '', 'PICKUP', 'CREDIT');
  });

  it('marks notifications read optimistically and refreshes the inbox state', async () => {
    apiModule.getAuthToken.mockReturnValue('token-123');
    authApi.getProfile.mockResolvedValue(users.admin);
    notificationsApi.getNotifications
      .mockResolvedValueOnce([
        { id: 11, title: 'New order', message: 'Order #11 is waiting.', requiresAttention: true, readAt: null, metadata: { path: '/orders' } }
      ])
      .mockResolvedValueOnce([
        { id: 11, title: 'New order', message: 'Order #11 is waiting.', requiresAttention: true, readAt: '2026-04-03T22:00:00.000Z', metadata: { path: '/orders' } }
      ]);
    notificationsApi.getUnreadNotificationCount
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    renderWithProviders(
      <AppProvider>
        <ContextHarness />
      </AppProvider>,
      { route: '/orders' }
    );

    await waitFor(() => expect(screen.getByTestId('unread-notification-count')).toHaveTextContent('1'));

    await act(async () => {
      fireEvent.click(screen.getByText('Mark Notification Read'));
    });

    await waitFor(() => expect(notificationsApi.markNotificationRead).toHaveBeenCalledWith(11));
    await waitFor(() => expect(screen.getByTestId('unread-notification-count')).toHaveTextContent('0'));
    expect(screen.getByTestId('inbox-notifications')).toHaveTextContent('2026-04-03T22:00:00.000Z');
  });

  it('routes delivery drivers to the delivery dashboard after login', async () => {
    authApi.login.mockResolvedValue({
      user: { id: 8, username: 'driver', roles: ['DELIVERY_DRIVER'] },
    });

    renderWithProviders(
      <AppProvider>
        <LocationProbe />
        <ContextHarness />
      </AppProvider>,
      { route: '/login' }
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Trigger Login'));
    });

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/delivery-dashboard'));
  });
});
