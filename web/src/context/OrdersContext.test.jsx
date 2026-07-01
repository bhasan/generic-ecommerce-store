// web/src/context/OrdersContext.test.jsx
import { renderHook, waitFor } from '@testing-library/react';
import { OrdersProvider, useOrdersContext } from './OrdersContext';
import { UIProvider } from './UIContext';
import { AuthProvider } from './AuthContext';
import { StoreConfigProvider } from './StoreConfigContext';
import { CatalogProvider } from './CatalogContext';
import { NotificationsProvider } from './NotificationsContext';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../services/ordersApi', () => ({
  getAllOrders: vi.fn(),
  updateOrderStatus: vi.fn(),
  notifyArrival: vi.fn(),
  deleteOrder: vi.fn(),
  printOrderReceipt: vi.fn(),
  addItemToOrder: vi.fn(),
  voidOrderItem: vi.fn(),
  deleteOrderItem: vi.fn(),
  checkDeliveryEligibility: vi.fn(),
}));
vi.mock('../services/authApi', () => ({ getProfile: vi.fn().mockResolvedValue({ id: 1, name: 'Test', role: 'admin' }), login: vi.fn(), logout: vi.fn(), register: vi.fn(), refresh: vi.fn() }));
vi.mock('../services/storeCreditApi', () => ({ getUserCredit: vi.fn() }));
vi.mock('../services/api', () => ({ getAuthToken: vi.fn(() => 'test-token'), newSession: vi.fn() }));
vi.mock('../services/usersApi', () => ({ updateUser: vi.fn() }));
vi.mock('../services/configApi', () => ({ getConfig: vi.fn().mockResolvedValue({}) }));
vi.mock('../services/landingPageSettingsApi', () => ({ getLandingPageSettings: vi.fn() }));
vi.mock('../services/productsApi', () => ({ getAllProducts: vi.fn(), createProduct: vi.fn(), updateProduct: vi.fn(), deleteProduct: vi.fn() }));
vi.mock('../services/categoriesApi', () => ({ getAllCategories: vi.fn(), createCategory: vi.fn(), updateCategory: vi.fn(), deleteCategory: vi.fn() }));
vi.mock('../services/notificationsApi', () => ({
  getNotifications: vi.fn().mockResolvedValue([]),
  getUnreadNotificationCount: vi.fn().mockResolvedValue(0),
  getStaffNotificationCounts: vi.fn().mockResolvedValue({ ordersByStatus: {}, pendingRegistrations: 0 }),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));
vi.mock('../utils/colorUtils', () => ({ applyBrandingTokens: vi.fn() }));
vi.mock('./StoreSelectionContext', () => ({ useStoreSelection: vi.fn(() => ({ activeStoreId: null, stores: [], isMultiStore: false, selectStore: vi.fn(), loading: false })) }));

import * as ordersApi from '../services/ordersApi';

const wrapper = ({ children }) => (
  <MemoryRouter>
    <UIProvider>
      <AuthProvider>
        <StoreConfigProvider>
          <CatalogProvider>
            <NotificationsProvider>
              <OrdersProvider>{children}</OrdersProvider>
            </NotificationsProvider>
          </CatalogProvider>
        </StoreConfigProvider>
      </AuthProvider>
    </UIProvider>
  </MemoryRouter>
);

describe('OrdersContext', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts with empty orders', () => {
    const { result } = renderHook(() => useOrdersContext(), { wrapper });
    expect(result.current.orders).toEqual([]);
  });

  it('loadOrders populates orders from API when authenticated', async () => {
    ordersApi.getAllOrders.mockResolvedValue([{ id: 1, status: 'PENDING' }]);
    const { result } = renderHook(() => useOrdersContext(), { wrapper });
    // Wait for auth to complete and orders to auto-load
    await waitFor(() => expect(result.current.orders).toHaveLength(1));
  });

  it('throws when used outside OrdersProvider', () => {
    const miniWrapper = ({ children }) => (
      <MemoryRouter><UIProvider><AuthProvider>{children}</AuthProvider></UIProvider></MemoryRouter>
    );
    expect(() => renderHook(() => useOrdersContext(), { wrapper: miniWrapper }))
      .toThrow('useOrdersContext must be used within OrdersProvider');
  });
});
