// web/src/context/CartContext.test.jsx
import { renderHook, act } from '@testing-library/react';
import { CartProvider, useCartContext } from './CartContext';
import { UIProvider } from './UIContext';
import { AuthProvider } from './AuthContext';
import { StoreConfigProvider } from './StoreConfigContext';
import { CatalogProvider } from './CatalogContext';
import { NotificationsProvider } from './NotificationsContext';
import { OrdersProvider } from './OrdersContext';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../services/ordersApi', () => ({ getAllOrders: vi.fn(), createOrder: vi.fn(), updateOrderStatus: vi.fn(), notifyArrival: vi.fn(), deleteOrder: vi.fn(), printOrderReceipt: vi.fn(), addItemToOrder: vi.fn(), voidOrderItem: vi.fn(), deleteOrderItem: vi.fn(), checkDeliveryEligibility: vi.fn() }));
vi.mock('../services/authApi', () => ({ getProfile: vi.fn(), login: vi.fn(), logout: vi.fn(), register: vi.fn() }));
vi.mock('../services/storeCreditApi', () => ({ getUserCredit: vi.fn() }));
vi.mock('../services/api', () => ({ getAuthToken: vi.fn(() => null), newSession: vi.fn() }));
vi.mock('../services/usersApi', () => ({ updateUser: vi.fn() }));
vi.mock('../services/configApi', () => ({ getConfig: vi.fn() }));
vi.mock('../services/landingPageSettingsApi', () => ({ getLandingPageSettings: vi.fn() }));
vi.mock('../services/productsApi', () => ({ getAllProducts: vi.fn(), createProduct: vi.fn(), updateProduct: vi.fn(), deleteProduct: vi.fn() }));
vi.mock('../services/categoriesApi', () => ({ getAllCategories: vi.fn(), createCategory: vi.fn(), updateCategory: vi.fn(), deleteCategory: vi.fn() }));
vi.mock('../services/notificationsApi', () => ({ getNotifications: vi.fn(), getUnreadNotificationCount: vi.fn(), getStaffNotificationCounts: vi.fn(), markNotificationRead: vi.fn(), markAllNotificationsRead: vi.fn() }));
vi.mock('../utils/colorUtils', () => ({ applyBrandingTokens: vi.fn() }));
vi.mock('../features/products/productsHelpers', () => ({ getAllowedQuantities: vi.fn(() => []) }));

const wrapper = ({ children }) => (
  <MemoryRouter>
    <UIProvider>
      <AuthProvider>
        <StoreConfigProvider>
          <CatalogProvider>
            <NotificationsProvider>
              <OrdersProvider>
                <CartProvider>{children}</CartProvider>
              </OrdersProvider>
            </NotificationsProvider>
          </CatalogProvider>
        </StoreConfigProvider>
      </AuthProvider>
    </UIProvider>
  </MemoryRouter>
);

describe('CartContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('starts with empty cart', () => {
    const { result } = renderHook(() => useCartContext(), { wrapper });
    expect(result.current.cart).toEqual([]);
  });

  it('addToCart adds an item', () => {
    const { result } = renderHook(() => useCartContext(), { wrapper });
    const product = { id: 1, name: 'Widget', categoryId: 2, images: [] };
    const variant = { id: 10, label: 'Default', basePrice: 5, pricingMode: 'UNIT', quantityOptions: [], priceBreaks: [], stockEnabled: false, stock: 0 };
    act(() => result.current.addToCart(product, variant, 1));
    expect(result.current.cart).toHaveLength(1);
    expect(result.current.cart[0].variantId).toBe(10);
  });

  it('removeFromCart removes an item by variantId', () => {
    const { result } = renderHook(() => useCartContext(), { wrapper });
    const product = { id: 1, name: 'Widget', categoryId: 2, images: [] };
    const variant = { id: 10, label: 'Default', basePrice: 5, pricingMode: 'UNIT', quantityOptions: [], priceBreaks: [], stockEnabled: false, stock: 0 };
    act(() => result.current.addToCart(product, variant, 1));
    act(() => result.current.removeFromCart(10));
    expect(result.current.cart).toHaveLength(0);
  });

  it('restoreCart sets cart to provided items', () => {
    const { result } = renderHook(() => useCartContext(), { wrapper });
    act(() => result.current.restoreCart([{ variantId: 5, quantity: 2 }]));
    expect(result.current.cart).toHaveLength(1);
  });

  it('throws when used outside CartProvider', () => {
    const miniWrapper = ({ children }) => (
      <MemoryRouter><UIProvider><AuthProvider>{children}</AuthProvider></UIProvider></MemoryRouter>
    );
    expect(() => renderHook(() => useCartContext(), { wrapper: miniWrapper }))
      .toThrow('useCartContext must be used within CartProvider');
  });
});
