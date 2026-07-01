// web/src/context/CartContext.test.jsx
import { renderHook, act, waitFor } from '@testing-library/react';
import { CartProvider, useCartContext } from './CartContext';
import { UIProvider } from './UIContext';
import { AuthProvider } from './AuthContext';
import { StoreConfigProvider } from './StoreConfigContext';
import { CatalogProvider } from './CatalogContext';
import { NotificationsProvider } from './NotificationsContext';
import { OrdersProvider } from './OrdersContext';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { useStoreSelection } from './StoreSelectionContext';

vi.mock('../services/ordersApi', () => ({ getAllOrders: vi.fn(), createOrder: vi.fn(), updateOrderStatus: vi.fn(), notifyArrival: vi.fn(), deleteOrder: vi.fn(), printOrderReceipt: vi.fn(), addItemToOrder: vi.fn(), voidOrderItem: vi.fn(), deleteOrderItem: vi.fn(), checkDeliveryEligibility: vi.fn() }));
vi.mock('../services/authApi', () => ({ getProfile: vi.fn(), login: vi.fn(), logout: vi.fn(), register: vi.fn(), refresh: vi.fn() }));
vi.mock('../services/storeCreditApi', () => ({ getUserCredit: vi.fn() }));
vi.mock('../services/api', () => ({ getAuthToken: vi.fn(() => null), getRefreshToken: vi.fn(() => null), newSession: vi.fn() }));
vi.mock('../services/usersApi', () => ({ updateUser: vi.fn() }));
vi.mock('../services/configApi', () => ({ getConfig: vi.fn() }));
vi.mock('../services/landingPageSettingsApi', () => ({ getLandingPageSettings: vi.fn() }));
vi.mock('../services/productsApi', () => ({ getAllProducts: vi.fn(), createProduct: vi.fn(), updateProduct: vi.fn(), deleteProduct: vi.fn() }));
vi.mock('../services/categoriesApi', () => ({ getAllCategories: vi.fn(), createCategory: vi.fn(), updateCategory: vi.fn(), deleteCategory: vi.fn() }));
vi.mock('../services/notificationsApi', () => ({ getNotifications: vi.fn(), getUnreadNotificationCount: vi.fn(), getStaffNotificationCounts: vi.fn(), markNotificationRead: vi.fn(), markAllNotificationsRead: vi.fn() }));
vi.mock('../utils/colorUtils', () => ({ applyBrandingTokens: vi.fn() }));
vi.mock('../features/products/productsHelpers', () => ({ getAllowedQuantities: vi.fn(() => []) }));
vi.mock('./StoreSelectionContext', () => ({ useStoreSelection: vi.fn() }));

const defaultStoreSelection = { activeStoreId: null, stores: [], isMultiStore: false, selectStore: vi.fn(), loading: false };

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

const sampleProduct = { id: 1, name: 'Widget', categoryId: 2, images: [] };
const sampleVariant = { id: 10, label: 'Default', basePrice: 5, pricingMode: 'UNIT', quantityOptions: [], priceBreaks: [], stockEnabled: false, stock: 0 };

describe('CartContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(useStoreSelection).mockReturnValue(defaultStoreSelection);
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

  describe('per-store cart isolation', () => {
    it('(a) items saved under store A are not visible when active store is B, and re-appear on switch back', async () => {
      // Start on store A
      vi.mocked(useStoreSelection).mockReturnValue({ ...defaultStoreSelection, activeStoreId: 1 });
      const { result, rerender } = renderHook(() => useCartContext(), { wrapper });

      // Add item in store A
      act(() => result.current.addToCart(sampleProduct, sampleVariant, 1));
      expect(result.current.cart).toHaveLength(1);
      expect(result.current.cart[0].variantId).toBe(10);

      // Switch to store B
      vi.mocked(useStoreSelection).mockReturnValue({ ...defaultStoreSelection, activeStoreId: 2 });
      rerender();
      await waitFor(() => expect(result.current.cart).toHaveLength(0));

      // Switch back to store A
      vi.mocked(useStoreSelection).mockReturnValue({ ...defaultStoreSelection, activeStoreId: 1 });
      rerender();
      await waitFor(() => expect(result.current.cart).toHaveLength(1));
      expect(result.current.cart[0].variantId).toBe(10);
    });

    it('(b) a cart whose savedAt is >7 days old loads empty and removes its key', () => {
      const storeId = 5;
      const key = `cartData_v2_store_${storeId}`;
      const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
      localStorage.setItem(key, JSON.stringify({ items: [{ variantId: 99, quantity: 1 }], savedAt: eightDaysAgo }));

      vi.mocked(useStoreSelection).mockReturnValue({ ...defaultStoreSelection, activeStoreId: storeId });
      const { result } = renderHook(() => useCartContext(), { wrapper });

      expect(result.current.cart).toHaveLength(0);
      expect(localStorage.getItem(key)).toBeNull();
    });

    it('(c) savedAt is written to localStorage on save', () => {
      const storeId = 7;
      vi.mocked(useStoreSelection).mockReturnValue({ ...defaultStoreSelection, activeStoreId: storeId });
      const { result } = renderHook(() => useCartContext(), { wrapper });

      act(() => result.current.addToCart(sampleProduct, sampleVariant, 1));

      const raw = localStorage.getItem(`cartData_v2_store_${storeId}`);
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw);
      expect(parsed).toHaveProperty('savedAt');
      expect(typeof parsed.savedAt).toBe('number');
      expect(parsed.savedAt).toBeGreaterThan(0);
      expect(parsed.items).toHaveLength(1);
    });

    it('(legacy-compat) missing savedAt is not treated as expired', () => {
      const key = 'cartData_v2';
      // Simulate old format: no savedAt, just an array
      localStorage.setItem(key, JSON.stringify([{ variantId: 42, quantity: 3 }]));

      // activeStoreId null → uses fallback key cartData_v2
      const { result } = renderHook(() => useCartContext(), { wrapper });

      expect(result.current.cart).toHaveLength(1);
      expect(result.current.cart[0].variantId).toBe(42);
    });
  });

  describe('null-to-store reload lifecycle (single-store persistence)', () => {
    it('(reload) loads per-store cart when activeStoreId resolves from null to N', async () => {
      const storeId = 5;
      const key = `cartData_v2_store_${storeId}`;
      // Simulate a page reload: per-store key already exists in localStorage
      localStorage.setItem(key, JSON.stringify({ items: [{ variantId: 77, quantity: 2 }], savedAt: Date.now() }));

      // Start with activeStoreId: null (async not yet resolved)
      vi.mocked(useStoreSelection).mockReturnValue({ ...defaultStoreSelection, activeStoreId: null });
      const { result, rerender } = renderHook(() => useCartContext(), { wrapper });
      // null phase: loads from cartData_v2 (absent) → empty
      expect(result.current.cart).toHaveLength(0);

      // Simulate async resolve: null → 5
      vi.mocked(useStoreSelection).mockReturnValue({ ...defaultStoreSelection, activeStoreId: storeId });
      rerender();
      await waitFor(() => expect(result.current.cart).toHaveLength(1));
      expect(result.current.cart[0].variantId).toBe(77);
    });

    it('(migration) preserves legacy cartData_v2 cart through null→N when no per-store key exists, and removes cartData_v2 afterward', async () => {
      const storeId = 9;
      // Seed legacy key only (no per-store key for store 9)
      localStorage.setItem('cartData_v2', JSON.stringify([{ variantId: 42, quantity: 3 }]));

      vi.mocked(useStoreSelection).mockReturnValue({ ...defaultStoreSelection, activeStoreId: null });
      const { result, rerender } = renderHook(() => useCartContext(), { wrapper });
      // null phase: legacy cart loaded
      expect(result.current.cart).toHaveLength(1);
      expect(result.current.cart[0].variantId).toBe(42);

      // Resolve to store N (no per-store key exists)
      vi.mocked(useStoreSelection).mockReturnValue({ ...defaultStoreSelection, activeStoreId: storeId });
      rerender();
      // After migration: cartData_v2 removed AND cart items preserved
      await waitFor(() => expect(localStorage.getItem('cartData_v2')).toBeNull());
      expect(result.current.cart).toHaveLength(1);
      expect(result.current.cart[0].variantId).toBe(42);
    });
  });
});
