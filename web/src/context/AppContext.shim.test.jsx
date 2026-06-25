// web/src/context/AppContext.shim.test.jsx
import { renderHook, waitFor } from '@testing-library/react';
import { AppProvider, useApp } from './AppContext';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../services/authApi', () => ({ getProfile: vi.fn(), login: vi.fn(), logout: vi.fn(), register: vi.fn() }));
vi.mock('../services/storeCreditApi', () => ({ getUserCredit: vi.fn() }));
vi.mock('../services/api', () => ({ getAuthToken: vi.fn(() => null), newSession: vi.fn() }));
vi.mock('../services/ordersApi', () => ({ getAllOrders: vi.fn(), createOrder: vi.fn(), updateOrderStatus: vi.fn(), notifyArrival: vi.fn(), deleteOrder: vi.fn(), printOrderReceipt: vi.fn(), addItemToOrder: vi.fn(), voidOrderItem: vi.fn(), deleteOrderItem: vi.fn(), checkDeliveryEligibility: vi.fn() }));
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
    <AppProvider>{children}</AppProvider>
  </MemoryRouter>
);

const REQUIRED_KEYS = [
  'currentUser', 'isAuthenticated', 'isLoading', 'login', 'logout', 'register',
  'updateUserProfile', 'creditBalance', 'refreshCreditBalance', 'checkDeliveryEligibility',
  'cart', 'addToCart', 'removeFromCart', 'updateCartQuantity', 'checkout', 'restoreCart',
  'notification', 'showNotification', 'closeNotification', 'returnPath', 'setReturnPath',
  'products', 'isLoadingProducts', 'categories', 'isLoadingCategories',
  'loadProducts', 'loadCategories',
  'addProduct', 'updateProduct', 'deleteProduct',
  'createCategory', 'updateCategory', 'deleteCategory',
  'addReview', 'updateReview', 'deleteReview', 'addReviewReply', 'voteReview', 'flagReview',
  'orders', 'setOrders', 'isLoadingOrders', 'loadOrders',
  'updateOrderStatus', 'notifyArrival', 'deleteOrder',
  'printOrderReceipt', 'addItemToOrder', 'voidOrderItem', 'deleteOrderItem', 'restoreOrder',
  'inboxNotifications', 'unreadNotificationCount', 'staffNotificationCounts', 'notificationsMuted',
  'refreshNotifications', 'handleNotificationsPanelOpen',
  'markNotificationRead', 'markAllNotificationsRead', 'toggleNotificationsMuted',
  'loadStaffNotificationCounts',
  'taxRate', 'minimumDeliveryOrder', 'minimumDeliveryOrderEnabled',
  'deliveryDisabled', 'deliveryDisabledMessage', 'deliveryRadiusMiles',
  'pickupLocation', 'featuredProductIds', 'promotions',
  'storeCashappUsername', 'paymentSettings', 'storeSettings', 'branding',
  'loadConfig', 'loadLandingPageData', 'refreshStorefrontData',
  'setCart',
];

describe('AppContext shim', () => {
  it('useApp returns all expected keys', async () => {
    const { result } = renderHook(() => useApp(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    for (const key of REQUIRED_KEYS) {
      expect(result.current, `missing key: ${key}`).toHaveProperty(key);
    }
  });

  it('throws when used outside AppProvider', () => {
    expect(() => renderHook(() => useApp())).toThrow('useApp must be used within AppProvider');
  });
});
