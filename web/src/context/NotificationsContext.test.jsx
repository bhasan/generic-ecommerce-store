import { renderHook, waitFor, act } from '@testing-library/react';
import { NotificationsProvider, useNotificationsContext } from './NotificationsContext';
import { UIProvider } from './UIContext';
import { AuthProvider } from './AuthContext';
import { StoreConfigProvider } from './StoreConfigContext';
import { CatalogProvider } from './CatalogContext';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../services/notificationsApi', () => ({
  getNotifications: vi.fn(),
  getUnreadNotificationCount: vi.fn(),
  getStaffNotificationCounts: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));
vi.mock('../services/authApi', () => ({ getProfile: vi.fn(), login: vi.fn(), logout: vi.fn(), register: vi.fn(), refresh: vi.fn() }));
vi.mock('../services/storeCreditApi', () => ({ getUserCredit: vi.fn() }));
vi.mock('../services/api', () => ({ getAuthToken: vi.fn(() => null), getRefreshToken: vi.fn(() => null), newSession: vi.fn() }));
vi.mock('../services/ordersApi', () => ({ checkDeliveryEligibility: vi.fn() }));
vi.mock('../services/usersApi', () => ({ updateUser: vi.fn() }));
vi.mock('../services/configApi', () => ({ getConfig: vi.fn() }));
vi.mock('../services/landingPageSettingsApi', () => ({ getLandingPageSettings: vi.fn() }));
vi.mock('../services/productsApi', () => ({ getAllProducts: vi.fn(), createProduct: vi.fn(), updateProduct: vi.fn(), deleteProduct: vi.fn() }));
vi.mock('../services/categoriesApi', () => ({ getAllCategories: vi.fn(), createCategory: vi.fn(), updateCategory: vi.fn(), deleteCategory: vi.fn() }));
vi.mock('../utils/colorUtils', () => ({ applyBrandingTokens: vi.fn() }));
vi.mock('./StoreSelectionContext', () => ({ useStoreSelection: vi.fn(() => ({ activeStoreId: null, stores: [], isMultiStore: false, selectStore: vi.fn(), loading: false })) }));

import * as notificationsApi from '../services/notificationsApi';

const wrapper = ({ children }) => (
  <MemoryRouter>
    <UIProvider>
      <AuthProvider>
        <StoreConfigProvider>
          <CatalogProvider>
            <NotificationsProvider>{children}</NotificationsProvider>
          </CatalogProvider>
        </StoreConfigProvider>
      </AuthProvider>
    </UIProvider>
  </MemoryRouter>
);

describe('NotificationsContext', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts with empty notifications', () => {
    const { result } = renderHook(() => useNotificationsContext(), { wrapper });
    expect(result.current.inboxNotifications).toEqual([]);
    expect(result.current.unreadNotificationCount).toBe(0);
  });

  it('toggleNotificationsMuted flips mute state', () => {
    const { result } = renderHook(() => useNotificationsContext(), { wrapper });
    act(() => result.current.toggleNotificationsMuted());
    expect(result.current.notificationsMuted).toBe(true);
    act(() => result.current.toggleNotificationsMuted());
    expect(result.current.notificationsMuted).toBe(false);
  });

  it('throws when used outside NotificationsProvider', () => {
    const miniWrapper = ({ children }) => (
      <MemoryRouter><UIProvider><AuthProvider>{children}</AuthProvider></UIProvider></MemoryRouter>
    );
    expect(() => renderHook(() => useNotificationsContext(), { wrapper: miniWrapper }))
      .toThrow('useNotificationsContext must be used within NotificationsProvider');
  });
});
