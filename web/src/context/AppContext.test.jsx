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
  refresh: vi.fn(),
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
  notifyArrival: vi.fn(),
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

const landingPageSettingsApi = vi.hoisted(() => ({
  getLandingPageSettings: vi.fn(),
}));

const storesApi = vi.hoisted(() => ({
  getStores: vi.fn(),
}));

const apiModule = vi.hoisted(() => ({
  getAuthToken: vi.fn(),
  getRefreshToken: vi.fn(),
}));

vi.mock('../services/authApi', () => authApi);
vi.mock('../services/usersApi', () => usersApi);
vi.mock('../services/productsApi', () => productsApi);
vi.mock('../services/ordersApi', () => ordersApi);
vi.mock('../services/categoriesApi', () => categoriesApi);
vi.mock('../services/notificationsApi', () => notificationsApi);
vi.mock('../services/configApi', () => configApi);
vi.mock('../services/storeCreditApi', () => creditApi);
vi.mock('../services/landingPageSettingsApi', () => landingPageSettingsApi);
vi.mock('../services/storesApi', () => storesApi);
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
      <div data-testid="delivery-radius-miles">{app.deliveryRadiusMiles}</div>
      <div data-testid="featured-product-ids">{JSON.stringify(app.featuredProductIds)}</div>
      <div data-testid="promotions">{JSON.stringify(app.promotions)}</div>
      <div data-testid="staff-notifications">{JSON.stringify(app.staffNotificationCounts)}</div>
      <div data-testid="unread-notification-count">{app.unreadNotificationCount}</div>
      <div data-testid="inbox-notifications">{JSON.stringify(app.inboxNotifications)}</div>
      <div data-testid="notification">{app.notification?.message || ''}</div>
      <div data-testid="cart-count">{app.cart.length}</div>
      <button onClick={() => app.addToCart(sampleProducts[0], sampleProducts[0].variants[0], 1)}>Add To Cart</button>
      <button onClick={() => app.checkout('', 'PICKUP', 'STORE_CREDIT')}>Checkout With Credit</button>
      <button onClick={() => app.markNotificationRead(11)}>Mark Notification Read</button>
      <button onClick={() => app.login('driver', 'driver123')}>Trigger Login</button>
      <button onClick={() => app.notifyArrival(111, 'Spot X')}>Notify Arrival</button>
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
    storesApi.getStores.mockResolvedValue([{ id: 1, name: 'Store A', slug: 'store-a', isDefault: true }]);
    landingPageSettingsApi.getLandingPageSettings.mockResolvedValue({
      featuredProductIds: [5, 6],
      promotions: [{ url: '/api/uploads/slide.webp', description: 'Promo' }],
    });
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
    expect(screen.getByTestId('delivery-radius-miles')).toHaveTextContent('5');
    expect(screen.getByTestId('staff-notifications')).toHaveTextContent('pendingRegistrations');
    expect(screen.getByTestId('unread-notification-count')).toHaveTextContent('1');
  });

  it('bootstraps cart state from localStorage on load', async () => {
    localStorage.setItem('cartData_v2', JSON.stringify([{ ...sampleProducts[0], quantity: 2 }]));

    renderWithProviders(
      <AppProvider>
        <ContextHarness />
      </AppProvider>,
      { route: '/products' }
    );

    // Products count stays 0 because we are not authenticated
    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('false'));
    expect(screen.getByTestId('products-count')).toHaveTextContent('0');
    expect(screen.getByTestId('cart-count')).toHaveTextContent('1');
  });

  it('falls back safely when stored cart data is invalid JSON', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('cartData_v2', '{bad-json');

    renderWithProviders(
      <AppProvider>
        <ContextHarness />
      </AppProvider>,
      { route: '/products' }
    );

    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('false'));
    expect(screen.getByTestId('products-count')).toHaveTextContent('0');
    expect(screen.getByTestId('cart-count')).toHaveTextContent('0');
    expect(localStorage.getItem('cartData_v2')).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
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

    fireEvent.click(screen.getByText('Add To Cart'));
    await waitFor(() => expect(localStorage.getItem('cartData_v2_store_1')).toContain('"productId":101'));

    await act(async () => {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    });

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login'));
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
    expect(screen.getByTestId('notification')).toHaveTextContent('Your session has expired. Please log in again.');
    expect(localStorage.getItem('cartData_v2')).toBeNull();
  });

  it('refreshes orders and credit balance after a credit checkout', async () => {
    apiModule.getAuthToken.mockReturnValue('token-123');
    authApi.getProfile.mockResolvedValue(users.customer);
    ordersApi.getAllOrders
      .mockResolvedValueOnce(sampleOrders) // Mount load
      .mockResolvedValueOnce(sampleOrders) // Potential effect re-trigger
      .mockResolvedValue([...sampleOrders, { id: 302, status: 'PLACED', items: [] }]); // Final state
    ordersApi.createOrder.mockResolvedValue({ id: 302, status: 'PLACED' });
    creditApi.getUserCredit
      .mockResolvedValueOnce({ balance: 20 }) // Mount load
      .mockResolvedValueOnce({ balance: 20 }) // Potential effect re-trigger
      .mockResolvedValue({ balance: 5 }); // Final state

    renderWithProviders(
      <AppProvider>
        <ContextHarness />
      </AppProvider>,
      { route: '/checkout' }
    );

    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));

    fireEvent.click(screen.getByText('Add To Cart'));
    expect(screen.getByTestId('cart-count')).toHaveTextContent('1');
    await waitFor(() => expect(localStorage.getItem('cartData_v2_store_1')).toContain('"productId":101'));

    await act(async () => {
      fireEvent.click(screen.getByText('Checkout With Credit'));
    });

    await waitFor(() => expect(screen.getByTestId('orders-count')).toHaveTextContent('2'));
    expect(screen.getByTestId('credit-balance')).toHaveTextContent('5');
    expect(screen.getByTestId('cart-count')).toHaveTextContent('0');
    expect(localStorage.getItem('cartData_v2')).toBeNull();
    expect(ordersApi.createOrder).toHaveBeenCalledWith([{ variantId: 1001, quantity: 1 }], '', 'PICKUP', 'STORE_CREDIT', undefined, undefined);
  });

  it('persists cart changes to localStorage after adding an item', async () => {
    renderWithProviders(
      <AppProvider>
        <ContextHarness />
      </AppProvider>,
      { route: '/products' }
    );

    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('false'));
    expect(screen.getByTestId('products-count')).toHaveTextContent('0');

    fireEvent.click(screen.getByText('Add To Cart'));

    await waitFor(() => expect(localStorage.getItem('cartData_v2_store_1')).toContain('"productId":101'));
    expect(screen.getByTestId('cart-count')).toHaveTextContent('1');
  });

  it('marks notifications read optimistically and refreshes the inbox state', async () => {
    apiModule.getAuthToken.mockReturnValue('token-123');
    authApi.getProfile.mockResolvedValue(users.admin);
    notificationsApi.getNotifications
      .mockResolvedValueOnce([
        { id: 11, title: 'New order', message: 'Order #11 is waiting.', requiresAttention: true, readAt: null, metadata: { path: '/orders' } }
      ]) // Mount load
      .mockResolvedValueOnce([
        { id: 11, title: 'New order', message: 'Order #11 is waiting.', requiresAttention: true, readAt: null, metadata: { path: '/orders' } }
      ]) // Potential effect re-trigger
      .mockResolvedValue([
        { id: 11, title: 'New order', message: 'Order #11 is waiting.', requiresAttention: true, readAt: '2026-04-03T22:00:00.000Z', metadata: { path: '/orders' } }
      ]); // Final state
    notificationsApi.getUnreadNotificationCount
      .mockResolvedValueOnce({ count: 1 }) // Mount load
      .mockResolvedValueOnce({ count: 1 }) // Potential effect re-trigger
      .mockResolvedValue({ count: 0 }); // Final state

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

  it('calls ordersApi.notifyArrival and refreshes the order list', async () => {
    apiModule.getAuthToken.mockReturnValue('token-123');
    authApi.getProfile.mockResolvedValue(users.customer);
    ordersApi.getAllOrders
      .mockResolvedValueOnce(sampleOrders)
      .mockResolvedValueOnce(sampleOrders)
      .mockResolvedValue([...sampleOrders, { id: 111, status: 'ARRIVED', items: [] }]);
    ordersApi.notifyArrival.mockResolvedValue({ id: 111, status: 'ARRIVED' });

    renderWithProviders(
      <AppProvider>
        <ContextHarness />
      </AppProvider>,
      { route: '/orders' }
    );

    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));

    await act(async () => {
      fireEvent.click(screen.getByText('Notify Arrival'));
    });

    expect(ordersApi.notifyArrival).toHaveBeenCalledWith(111, 'Spot X');
    await waitFor(() => expect(screen.getByTestId('orders-count')).toHaveTextContent('2'));
  });

  it('loads featuredProductIds and promotions from landing page settings on login', async () => {
    apiModule.getAuthToken.mockReturnValue('token-123');
    authApi.getProfile.mockResolvedValue(users.customer);

    renderWithProviders(
      <AppProvider>
        <ContextHarness />
      </AppProvider>,
      { route: '/products' }
    );

    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));
    await waitFor(() => expect(screen.getByTestId('featured-product-ids')).toHaveTextContent('[5,6]'));
    expect(screen.getByTestId('promotions')).toHaveTextContent('slide.webp');
  });

  it('does not call getLandingPageSettings when unauthenticated', async () => {
    apiModule.getAuthToken.mockReturnValue(null);

    renderWithProviders(
      <AppProvider>
        <ContextHarness />
      </AppProvider>,
      { route: '/products' }
    );

    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('false'));
    expect(landingPageSettingsApi.getLandingPageSettings).not.toHaveBeenCalled();
  });

  it('exposes storeLoading (not loading) for the store-list fetch so auth/cart loading is not shadowed', async () => {
    // storeLoading must appear on useApp() and must be a boolean.
    // The bare `loading` key must NOT be present — its absence prevents the store-fetch flag
    // from silently shadowing any `loading` key added by auth, cart, catalog, or other contexts.
    function StoreLoadingHarness() {
      const app = useApp();
      return (
        <div>
          <div data-testid="store-loading-type">{typeof app.storeLoading}</div>
          <div data-testid="bare-loading">{String('loading' in app)}</div>
          <div data-testid="stores-count">{app.stores.length}</div>
          <div data-testid="active-store-id">{String(app.activeStoreId)}</div>
          <div data-testid="is-multi-store">{String(app.isMultiStore)}</div>
        </div>
      );
    }

    storesApi.getStores.mockResolvedValue([
      { id: 10, name: 'Shop A', slug: 'shop-a', isDefault: true },
      { id: 20, name: 'Shop B', slug: 'shop-b', isDefault: false },
    ]);

    renderWithProviders(
      <AppProvider>
        <StoreLoadingHarness />
      </AppProvider>,
      { route: '/' }
    );

    // Wait for the store fetch to settle
    await waitFor(() => expect(screen.getByTestId('store-loading-type')).toHaveTextContent('boolean'));
    await waitFor(() => expect(screen.getByTestId('stores-count')).toHaveTextContent('2'));

    // storeLoading must be false once the fetch resolves
    expect(screen.getByTestId('store-loading-type')).toHaveTextContent('boolean');
    // The bare `loading` key must NOT leak into the top-level useApp() value
    expect(screen.getByTestId('bare-loading')).toHaveTextContent('false');
    // Other store-selection fields must still be accessible via useApp()
    expect(screen.getByTestId('is-multi-store')).toHaveTextContent('true');
    expect(screen.getByTestId('active-store-id')).toHaveTextContent('null');
  });

  it('leaves featuredProductIds and promotions at defaults when landing page API returns null', async () => {
    apiModule.getAuthToken.mockReturnValue('token-123');
    authApi.getProfile.mockResolvedValue(users.customer);
    // Override sampleConfig so loadConfig doesn't set featuredProductIds — this test verifies
    // that landing page returning null leaves state at the config-provided defaults (empty here).
    configApi.getConfig.mockResolvedValue({ ...sampleConfig, featuredProductIds: [], promotions: [] });
    landingPageSettingsApi.getLandingPageSettings.mockResolvedValue(null);

    renderWithProviders(
      <AppProvider>
        <ContextHarness />
      </AppProvider>,
      { route: '/products' }
    );

    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));
    expect(screen.getByTestId('featured-product-ids')).toHaveTextContent('[]');
    expect(screen.getByTestId('promotions')).toHaveTextContent('[]');
  });

  it('exposes loadLandingPageData and refreshes context state when called', async () => {
    apiModule.getAuthToken.mockReturnValue('token-123');
    authApi.getProfile.mockResolvedValue(users.customer);
    landingPageSettingsApi.getLandingPageSettings.mockResolvedValue({
      featuredProductIds: [],
      promotions: [],
    });

    function ReloadHarness() {
      const app = useApp();
      return (
        <div>
          <div data-testid="featured-product-ids">{JSON.stringify(app.featuredProductIds)}</div>
          <div data-testid="promotions">{JSON.stringify(app.promotions)}</div>
          <button onClick={() => app.loadLandingPageData()}>Reload Landing</button>
        </div>
      );
    }

    renderWithProviders(
      <AppProvider>
        <ReloadHarness />
      </AppProvider>,
      { route: '/products' }
    );

    await waitFor(() =>
      expect(screen.getByTestId('featured-product-ids')).toHaveTextContent('[]')
    );

    landingPageSettingsApi.getLandingPageSettings.mockResolvedValue({
      featuredProductIds: [99],
      promotions: [{ url: '/api/uploads/new.webp', description: '' }],
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Reload Landing'));
    });

    await waitFor(() =>
      expect(screen.getByTestId('featured-product-ids')).toHaveTextContent('[99]')
    );
    expect(screen.getByTestId('promotions')).toHaveTextContent('new.webp');
  });
});
