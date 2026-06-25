# AppContext Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `web/src/context/AppContext.jsx` (1,280 lines) into 6 focused contexts while keeping `useApp()` working unchanged for all 74 consumers.

**Architecture:** Each context owns one domain slice. Contexts that need other contexts import them directly (e.g. `CartContext` calls `useUIContext()` for toasts). Provider nesting in the shim ensures each context's dependencies are mounted above it. `AppContext.jsx` becomes a ~60-line shim that composes all providers and re-exports `useApp()` with the merged value shape.

**Tech Stack:** React 18 context API, Vitest, React Testing Library

## Global Constraints

- `useApp()` hook must return the **identical merged shape** as today — same key names, same function signatures — all 74 consumers must work without any changes
- No new npm dependencies
- Run frontend tests with: `cd web && npx vitest run` (or a specific file: `npx vitest run src/context/UIContext.test.jsx`)
- Each new context exports: a `use<Name>Context()` hook and a `<Name>Provider` component
- Provider nesting order (outermost first): `UI → Auth → StoreConfig → Catalog → Orders → Notifications → Cart`
- `CartContext` is deepest so it can call `useOrdersContext()` and `useNotificationsContext()` directly
- Tests use `@testing-library/react` `renderHook` with a wrapper that provides all required parent contexts
- Existing `AppContext.*.test.jsx` files must not be modified — they still mock `useApp` and will pass through the shim

---

### Task 1: UIContext

The simplest context — no API calls, no dependencies on other contexts.

**Files:**
- Create: `web/src/context/UIContext.jsx`
- Create: `web/src/context/UIContext.test.jsx`

**Interfaces:**
- Produces:
  ```js
  export const useUIContext = () => ({ notification, showNotification, closeNotification, returnPath, setReturnPath })
  export function UIProvider({ children })
  ```

- [ ] **Step 1: Write the failing test**

```jsx
// web/src/context/UIContext.test.jsx
import { renderHook, act } from '@testing-library/react';
import { UIProvider, useUIContext } from './UIContext';
import { describe, it, expect } from 'vitest';

const wrapper = ({ children }) => <UIProvider>{children}</UIProvider>;

describe('UIContext', () => {
  it('showNotification sets notification state', () => {
    const { result } = renderHook(() => useUIContext(), { wrapper });
    act(() => result.current.showNotification('hello', 'success'));
    expect(result.current.notification).toEqual({ message: 'hello', type: 'success', action: null });
  });

  it('closeNotification clears notification state', () => {
    const { result } = renderHook(() => useUIContext(), { wrapper });
    act(() => result.current.showNotification('hello', 'success'));
    act(() => result.current.closeNotification());
    expect(result.current.notification).toBeNull();
  });

  it('setReturnPath updates returnPath', () => {
    const { result } = renderHook(() => useUIContext(), { wrapper });
    act(() => result.current.setReturnPath('/products'));
    expect(result.current.returnPath).toBe('/products');
  });

  it('throws when used outside UIProvider', () => {
    expect(() => renderHook(() => useUIContext())).toThrow('useUIContext must be used within UIProvider');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd web && npx vitest run src/context/UIContext.test.jsx
```
Expected: FAIL — `UIContext.jsx` does not exist.

- [ ] **Step 3: Implement UIContext**

```jsx
// web/src/context/UIContext.jsx
import React, { useState, useCallback, createContext, useContext } from 'react';
import { toNotificationMessage } from '../utils/notificationMessage';

const UIContext = createContext(null);

export const useUIContext = () => {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUIContext must be used within UIProvider');
  return ctx;
};

export function UIProvider({ children }) {
  const [notification, setNotification] = useState(null);
  const [returnPath, setReturnPath] = useState(null);

  const showNotification = useCallback((message, type = 'success', action = null) => {
    const safeMessage = toNotificationMessage(message, 'Something went wrong. Please try again.');
    setNotification({ message: safeMessage, type, action });
  }, []);

  const closeNotification = useCallback(() => setNotification(null), []);

  // backend:unavailable is a global event fired by the API layer when the server can't be reached
  useEffect(() => {
    const handleBackendUnavailable = (event) => {
      const message = event?.detail?.message || 'We are having trouble reaching the server. Please try again shortly.';
      showNotification(message, 'warning', { label: 'Reload', onClick: () => window.location.reload() });
    };
    window.addEventListener('backend:unavailable', handleBackendUnavailable);
    return () => window.removeEventListener('backend:unavailable', handleBackendUnavailable);
  }, [showNotification]);

  return (
    <UIContext.Provider value={{ notification, showNotification, closeNotification, returnPath, setReturnPath }}>
      {children}
    </UIContext.Provider>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
cd web && npx vitest run src/context/UIContext.test.jsx
```
Expected: 4/4 passing.

- [ ] **Step 5: Commit**

```bash
git add web/src/context/UIContext.jsx web/src/context/UIContext.test.jsx
git commit -m "feat(context): extract UIContext from AppContext"
```

---

### Task 2: AuthContext

Owns the current user session. Depends on UIContext for `showNotification`, and on `react-router-dom` for navigation.

**Files:**
- Create: `web/src/context/AuthContext.jsx`
- Create: `web/src/context/AuthContext.test.jsx`

**Interfaces:**
- Consumes: `useUIContext()` → `{ showNotification }`
- Produces:
  ```js
  export const useAuthContext = () => ({
    currentUser, isAuthenticated, isLoading,
    login, logout, register, updateUserProfile,
    creditBalance, refreshCreditBalance, checkDeliveryEligibility
  })
  export function AuthProvider({ children })
  ```

- [ ] **Step 1: Write failing tests**

```jsx
// web/src/context/AuthContext.test.jsx
import { renderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuthContext } from './AuthContext';
import { UIProvider } from './UIContext';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../services/authApi', () => ({
  getProfile: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
}));
vi.mock('../services/usersApi', () => ({ updateUser: vi.fn() }));
vi.mock('../services/storeCreditApi', () => ({ getUserCredit: vi.fn() }));
vi.mock('../services/api', () => ({ getAuthToken: vi.fn(() => null), newSession: vi.fn() }));

import * as authApi from '../services/authApi';
import * as storeCreditApi from '../services/storeCreditApi';

const wrapper = ({ children }) => (
  <MemoryRouter>
    <UIProvider>
      <AuthProvider>{children}</AuthProvider>
    </UIProvider>
  </MemoryRouter>
);

describe('AuthContext', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts unauthenticated when no token is stored', async () => {
    const { result } = renderHook(() => useAuthContext(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('login sets isAuthenticated on success', async () => {
    authApi.login.mockResolvedValue({ user: { id: 1, username: 'bilal', roles: ['CUSTOMER'] } });
    storeCreditApi.getUserCredit.mockResolvedValue({ balance: 0 });
    const { result } = renderHook(() => useAuthContext(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(() => result.current.login('bilal', 'pw'));
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.currentUser.username).toBe('bilal');
  });

  it('logout clears currentUser', async () => {
    authApi.login.mockResolvedValue({ user: { id: 1, username: 'bilal', roles: ['CUSTOMER'] } });
    authApi.logout.mockResolvedValue({});
    storeCreditApi.getUserCredit.mockResolvedValue({ balance: 0 });
    const { result } = renderHook(() => useAuthContext(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(() => result.current.login('bilal', 'pw'));
    await act(() => result.current.logout());
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('throws when used outside AuthProvider', () => {
    const miniWrapper = ({ children }) => <MemoryRouter><UIProvider>{children}</UIProvider></MemoryRouter>;
    expect(() => renderHook(() => useAuthContext(), { wrapper: miniWrapper })).toThrow('useAuthContext must be used within AuthProvider');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd web && npx vitest run src/context/AuthContext.test.jsx
```
Expected: FAIL — `AuthContext.jsx` does not exist.

- [ ] **Step 3: Implement AuthContext**

```jsx
// web/src/context/AuthContext.jsx
import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import * as authApi from '../services/authApi';
import * as usersApi from '../services/usersApi';
import * as ordersApi from '../services/ordersApi';
import * as creditApi from '../services/storeCreditApi';
import { getAuthToken, newSession } from '../services/api';
import { GUEST_USER, ROLES } from '../utils/roles';
import { useUIContext } from './UIContext';

const AuthContext = createContext(null);

export const useAuthContext = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
};

export function AuthProvider({ children }) {
  const { showNotification, returnPath, setReturnPath } = useUIContext();
  const navigate = useNavigate();

  const getInitialUser = () => {
    const stored = localStorage.getItem('userData');
    if (stored) {
      try {
        const user = JSON.parse(stored);
        if (!user.roles && user.role) user.roles = [user.role];
        return user;
      } catch { /* fall through */ }
    }
    return GUEST_USER;
  };

  const [currentUser, setCurrentUser] = useState(getInitialUser);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [creditBalance, setCreditBalance] = useState(0);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = getAuthToken();
        if (token) {
          try {
            const user = await authApi.getProfile();
            if (!user.roles && user.role) user.roles = [user.role];
            setCurrentUser(user);
            setIsAuthenticated(true);
            newSession();
            try {
              const creditData = await creditApi.getUserCredit(user.id);
              setCreditBalance(creditData.balance ?? 0);
            } catch { /* non-fatal */ }
          } catch {
            setCurrentUser(GUEST_USER);
            setIsAuthenticated(false);
          }
        } else {
          setIsAuthenticated(false);
        }
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, []);

  // Handle global auth:unauthorized events
  useEffect(() => {
    const handleUnauthorized = () => {
      setCurrentUser(GUEST_USER);
      setIsAuthenticated(false);
      navigate('/login');
      showNotification('Your session has expired. Please log in again.', 'warning');
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [navigate, showNotification]);

  const login = async (username, password) => {
    try {
      const { user } = await authApi.login(username, password);
      if (!user.roles && user.role) user.roles = [user.role];
      setCurrentUser(user);
      setIsAuthenticated(true);
      newSession();
      if (returnPath) {
        navigate(returnPath);
        setReturnPath(null);
      } else {
        const roles = user.roles || [];
        if (roles.includes(ROLES.DELIVERY_DRIVER) && !roles.includes(ROLES.MANAGEMENT) && !roles.includes(ROLES.ADMIN)) {
          navigate('/delivery-dashboard');
        } else if (roles.includes(ROLES.CUSTOMER) && !roles.some(r => [ROLES.EMPLOYEE, ROLES.MANAGEMENT, ROLES.ADMIN, ROLES.DELIVERY_DRIVER].includes(r))) {
          navigate('/products');
        } else {
          navigate('/orders');
        }
      }
      showNotification('Login successful!', 'success');
      return true;
    } catch (error) {
      showNotification(error.message || 'Login failed. Please check your credentials.', 'error');
      return false;
    }
  };

  const register = async (data) => {
    try {
      const response = await authApi.register(data);
      const message = response.message || 'Registration successful! Please visit the store to get approved.';
      showNotification(message, 'success');
      return { success: true, message };
    } catch (error) {
      showNotification(error.message || 'Registration failed. Please try again.', 'error');
      throw error;
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch { /* local logout always proceeds */ }
    finally {
      setCurrentUser(GUEST_USER);
      setIsAuthenticated(false);
      setCreditBalance(0);
      setReturnPath(null);
      navigate('/products');
      showNotification('You have been logged out', 'info');
    }
  };

  const updateUserProfile = async (updates) => {
    try {
      const updatedUser = await usersApi.updateUser(currentUser.id, updates);
      if (!updatedUser.roles && updatedUser.role) updatedUser.roles = [updatedUser.role];
      setCurrentUser(updatedUser);
      localStorage.setItem('userData', JSON.stringify(updatedUser));
      showNotification('Profile updated successfully', 'success');
    } catch (error) {
      showNotification(error.message || 'Failed to update profile. Please try again.', 'error');
      throw error;
    }
  };

  const refreshCreditBalance = useCallback(async (userId) => {
    try {
      const creditData = await creditApi.getUserCredit(userId);
      setCreditBalance(creditData.balance ?? 0);
    } catch { /* non-fatal */ }
  }, []);

  const checkDeliveryEligibility = useCallback(async (deliveryAddress) => {
    return ordersApi.checkDeliveryEligibility(deliveryAddress);
  }, []);

  return (
    <AuthContext.Provider value={{
      currentUser, setCurrentUser, isAuthenticated, setIsAuthenticated,
      isLoading, login, logout, register, updateUserProfile,
      creditBalance, setCreditBalance, refreshCreditBalance, checkDeliveryEligibility,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
cd web && npx vitest run src/context/AuthContext.test.jsx
```
Expected: 4/4 passing.

- [ ] **Step 5: Commit**

```bash
git add web/src/context/AuthContext.jsx web/src/context/AuthContext.test.jsx
git commit -m "feat(context): extract AuthContext from AppContext"
```

---

### Task 3: StoreConfigContext

Owns store-wide server configuration. Depends on UIContext and AuthContext.

**Files:**
- Create: `web/src/context/StoreConfigContext.jsx`
- Create: `web/src/context/StoreConfigContext.test.jsx`

**Interfaces:**
- Consumes: `useUIContext()`, `useAuthContext()` → `{ isAuthenticated, isLoading }`
- Produces:
  ```js
  export const useStoreConfigContext = () => ({
    taxRate, minimumDeliveryOrder, minimumDeliveryOrderEnabled,
    deliveryDisabled, deliveryDisabledMessage, deliveryRadiusMiles,
    pickupLocation, featuredProductIds, promotions,
    storeCashappUsername, paymentSettings, storeSettings, branding,
    loadConfig, loadLandingPageData, refreshStorefrontData,
  })
  export function StoreConfigProvider({ children })
  ```

- [ ] **Step 1: Write failing tests**

```jsx
// web/src/context/StoreConfigContext.test.jsx
import { renderHook, waitFor } from '@testing-library/react';
import { StoreConfigProvider, useStoreConfigContext } from './StoreConfigContext';
import { UIProvider } from './UIContext';
import { AuthProvider } from './AuthContext';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../services/configApi', () => ({ getConfig: vi.fn() }));
vi.mock('../services/landingPageSettingsApi', () => ({ getLandingPageSettings: vi.fn() }));
vi.mock('../services/authApi', () => ({ getProfile: vi.fn(), login: vi.fn(), logout: vi.fn(), register: vi.fn() }));
vi.mock('../services/storeCreditApi', () => ({ getUserCredit: vi.fn() }));
vi.mock('../services/api', () => ({ getAuthToken: vi.fn(() => null), newSession: vi.fn() }));
vi.mock('../services/ordersApi', () => ({ checkDeliveryEligibility: vi.fn() }));
vi.mock('../services/usersApi', () => ({ updateUser: vi.fn() }));
vi.mock('../utils/colorUtils', () => ({ applyBrandingTokens: vi.fn() }));

import * as configApi from '../services/configApi';
import * as landingPageSettingsApi from '../services/landingPageSettingsApi';

const wrapper = ({ children }) => (
  <MemoryRouter>
    <UIProvider>
      <AuthProvider>
        <StoreConfigProvider>{children}</StoreConfigProvider>
      </AuthProvider>
    </UIProvider>
  </MemoryRouter>
);

describe('StoreConfigContext', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exposes default taxRate of 0', () => {
    const { result } = renderHook(() => useStoreConfigContext(), { wrapper });
    expect(result.current.taxRate).toBe(0);
  });

  it('loadConfig populates taxRate from API', async () => {
    configApi.getConfig.mockResolvedValue({ taxRate: 0.1, storeSettings: { name: 'Test' } });
    const { result } = renderHook(() => useStoreConfigContext(), { wrapper });
    await result.current.loadConfig();
    await waitFor(() => expect(result.current.taxRate).toBe(0.1));
  });

  it('throws when used outside StoreConfigProvider', () => {
    const miniWrapper = ({ children }) => (
      <MemoryRouter><UIProvider><AuthProvider>{children}</AuthProvider></UIProvider></MemoryRouter>
    );
    expect(() => renderHook(() => useStoreConfigContext(), { wrapper: miniWrapper }))
      .toThrow('useStoreConfigContext must be used within StoreConfigProvider');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd web && npx vitest run src/context/StoreConfigContext.test.jsx
```
Expected: FAIL — file does not exist.

- [ ] **Step 3: Implement StoreConfigContext**

```jsx
// web/src/context/StoreConfigContext.jsx
import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { useLocation } from 'react-router-dom';
import * as configApi from '../services/configApi';
import * as landingPageSettingsApi from '../services/landingPageSettingsApi';
import { applyBrandingTokens } from '../utils/colorUtils';
import { useAuthContext } from './AuthContext';

const StoreConfigContext = createContext(null);

export const useStoreConfigContext = () => {
  const ctx = useContext(StoreConfigContext);
  if (!ctx) throw new Error('useStoreConfigContext must be used within StoreConfigProvider');
  return ctx;
};

export function StoreConfigProvider({ children }) {
  const { isAuthenticated, isLoading } = useAuthContext();
  const location = useLocation();

  const [taxRate, setTaxRate] = useState(0);
  const [minimumDeliveryOrder, setMinimumDeliveryOrder] = useState(0);
  const [minimumDeliveryOrderEnabled, setMinimumDeliveryOrderEnabled] = useState(false);
  const [deliveryDisabled, setDeliveryDisabled] = useState(false);
  const [deliveryDisabledMessage, setDeliveryDisabledMessage] = useState('');
  const [deliveryRadiusMiles, setDeliveryRadiusMiles] = useState(5);
  const [pickupLocation, setPickupLocation] = useState('');
  const [featuredProductIds, setFeaturedProductIds] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [storeCashappUsername, setStoreCashappUsername] = useState('');
  const [paymentSettings, setPaymentSettings] = useState({
    cashapp: { enabled: true, handle: '' },
    zelle: { enabled: false, handle: '' },
    venmo: { enabled: false, handle: '' },
  });
  const [storeSettings, setStoreSettings] = useState({ name: '', address: '', phoneNumber: '' });
  const [branding, setBranding] = useState(null);

  const loadConfig = useCallback(async () => {
    try {
      const config = await configApi.getConfig();
      if (!config) return;
      if (typeof config.taxRate === 'number') setTaxRate(config.taxRate);
      if (typeof config.minimumDeliveryOrder === 'number') setMinimumDeliveryOrder(config.minimumDeliveryOrder);
      if (typeof config.minimumDeliveryOrderEnabled === 'boolean') setMinimumDeliveryOrderEnabled(config.minimumDeliveryOrderEnabled);
      if (typeof config.deliveryDisabled === 'boolean') setDeliveryDisabled(config.deliveryDisabled);
      if (typeof config.deliveryDisabledMessage === 'string') setDeliveryDisabledMessage(config.deliveryDisabledMessage);
      if (typeof config.deliveryRadiusMiles === 'number') setDeliveryRadiusMiles(config.deliveryRadiusMiles);
      if (Array.isArray(config.featuredProductIds)) setFeaturedProductIds(config.featuredProductIds);
      if (Array.isArray(config.promotions)) setPromotions(config.promotions);
      if (config.storeSettings) {
        setStoreSettings(config.storeSettings);
        if (typeof config.storeSettings.address === 'string') setPickupLocation(config.storeSettings.address);
      } else if (typeof config.pickupLocation === 'string') {
        setPickupLocation(config.pickupLocation);
      }
      if (config.paymentSettings) {
        setPaymentSettings(config.paymentSettings);
        setStoreCashappUsername(config.paymentSettings.cashapp?.handle || config.storeCashappUsername || '');
      } else if (typeof config.storeCashappUsername === 'string') {
        setStoreCashappUsername(config.storeCashappUsername);
      }
      if (config.branding) {
        setBranding(config.branding);
        applyBrandingTokens(config.branding.customColors);
        if (config.branding.storeName) document.title = config.branding.storeName;
        if (config.branding.faviconUrls?.['32']) {
          const link = document.querySelector("link[rel~='icon']") || document.createElement('link');
          link.rel = 'icon';
          link.href = config.branding.faviconUrls['32'];
          if (!document.head.contains(link)) document.head.appendChild(link);
        }
      }
    } catch (e) {
      console.warn('Failed to load remote config, using defaults.', e);
    }
  }, []);

  const loadLandingPageData = useCallback(async () => {
    try {
      const settings = await landingPageSettingsApi.getLandingPageSettings();
      if (settings && Array.isArray(settings.featuredProductIds)) setFeaturedProductIds(settings.featuredProductIds);
      if (settings && Array.isArray(settings.promotions)) setPromotions(settings.promotions);
    } catch { /* non-fatal */ }
  }, []);

  const refreshStorefrontData = useCallback(async () => {
    if (isLoading || !isAuthenticated) return;
    await loadLandingPageData();
  }, [isLoading, isAuthenticated, loadLandingPageData]);

  useEffect(() => {
    const isRegisterPage = location.pathname === '/register';
    if (isLoading) return;
    if (!isAuthenticated && !isRegisterPage) return;
    loadConfig();
  }, [loadConfig, isAuthenticated, isLoading, location.pathname]);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      loadLandingPageData();
    }
  }, [loadLandingPageData, isAuthenticated, isLoading]);

  return (
    <StoreConfigContext.Provider value={{
      taxRate, minimumDeliveryOrder, minimumDeliveryOrderEnabled,
      deliveryDisabled, deliveryDisabledMessage, deliveryRadiusMiles,
      pickupLocation, featuredProductIds, promotions,
      storeCashappUsername, paymentSettings, storeSettings, branding,
      loadConfig, loadLandingPageData, refreshStorefrontData,
    }}>
      {children}
    </StoreConfigContext.Provider>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
cd web && npx vitest run src/context/StoreConfigContext.test.jsx
```
Expected: 3/3 passing.

- [ ] **Step 5: Commit**

```bash
git add web/src/context/StoreConfigContext.jsx web/src/context/StoreConfigContext.test.jsx
git commit -m "feat(context): extract StoreConfigContext from AppContext"
```

---

### Task 4: CatalogContext

Owns products and categories. Depends on UIContext for notifications, AuthContext for `currentUser` (used in review mutations).

**Files:**
- Create: `web/src/context/CatalogContext.jsx`
- Create: `web/src/context/CatalogContext.test.jsx`

**Interfaces:**
- Consumes: `useUIContext()` → `{ showNotification }`, `useAuthContext()` → `{ currentUser }`
- Produces:
  ```js
  export const useCatalogContext = () => ({
    products, setProducts, isLoadingProducts,
    categories, isLoadingCategories,
    loadProducts, loadCategories,
    addProduct, updateProduct, deleteProduct,
    createCategory, updateCategory, deleteCategory,
    addReview, updateReview, deleteReview, addReviewReply, voteReview, flagReview,
  })
  export function CatalogProvider({ children })
  ```

- [ ] **Step 1: Write failing tests**

```jsx
// web/src/context/CatalogContext.test.jsx
import { renderHook, waitFor } from '@testing-library/react';
import { CatalogProvider, useCatalogContext } from './CatalogContext';
import { UIProvider } from './UIContext';
import { AuthProvider } from './AuthContext';
import { StoreConfigProvider } from './StoreConfigContext';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../services/productsApi', () => ({
  getAllProducts: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
}));
vi.mock('../services/categoriesApi', () => ({
  getAllCategories: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
}));
vi.mock('../services/authApi', () => ({ getProfile: vi.fn(), login: vi.fn(), logout: vi.fn(), register: vi.fn() }));
vi.mock('../services/storeCreditApi', () => ({ getUserCredit: vi.fn() }));
vi.mock('../services/api', () => ({ getAuthToken: vi.fn(() => null), newSession: vi.fn() }));
vi.mock('../services/ordersApi', () => ({ checkDeliveryEligibility: vi.fn() }));
vi.mock('../services/usersApi', () => ({ updateUser: vi.fn() }));
vi.mock('../services/configApi', () => ({ getConfig: vi.fn() }));
vi.mock('../services/landingPageSettingsApi', () => ({ getLandingPageSettings: vi.fn() }));
vi.mock('../utils/colorUtils', () => ({ applyBrandingTokens: vi.fn() }));

import * as productsApi from '../services/productsApi';
import * as categoriesApi from '../services/categoriesApi';

const wrapper = ({ children }) => (
  <MemoryRouter>
    <UIProvider>
      <AuthProvider>
        <StoreConfigProvider>
          <CatalogProvider>{children}</CatalogProvider>
        </StoreConfigProvider>
      </AuthProvider>
    </UIProvider>
  </MemoryRouter>
);

describe('CatalogContext', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts with empty products and categories', () => {
    const { result } = renderHook(() => useCatalogContext(), { wrapper });
    expect(result.current.products).toEqual([]);
    expect(result.current.categories).toEqual([]);
  });

  it('loadProducts populates products from API', async () => {
    productsApi.getAllProducts.mockResolvedValue([{ id: 1, name: 'Widget' }]);
    const { result } = renderHook(() => useCatalogContext(), { wrapper });
    await result.current.loadProducts();
    await waitFor(() => expect(result.current.products).toHaveLength(1));
    expect(result.current.products[0].name).toBe('Widget');
  });

  it('loadCategories populates categories from API', async () => {
    categoriesApi.getAllCategories.mockResolvedValue([{ id: 1, name: 'Flowers' }]);
    const { result } = renderHook(() => useCatalogContext(), { wrapper });
    await result.current.loadCategories();
    await waitFor(() => expect(result.current.categories).toHaveLength(1));
  });

  it('throws when used outside CatalogProvider', () => {
    const miniWrapper = ({ children }) => (
      <MemoryRouter><UIProvider><AuthProvider><StoreConfigProvider>{children}</StoreConfigProvider></AuthProvider></UIProvider></MemoryRouter>
    );
    expect(() => renderHook(() => useCatalogContext(), { wrapper: miniWrapper }))
      .toThrow('useCatalogContext must be used within CatalogProvider');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd web && npx vitest run src/context/CatalogContext.test.jsx
```
Expected: FAIL — file does not exist.

- [ ] **Step 3: Implement CatalogContext**

```jsx
// web/src/context/CatalogContext.jsx
import React, { useState, useCallback, createContext, useContext } from 'react';
import * as productsApi from '../services/productsApi';
import * as categoriesApi from '../services/categoriesApi';
import { ROLES } from '../utils/roles';
import { useUIContext } from './UIContext';
import { useAuthContext } from './AuthContext';

const CatalogContext = createContext(null);

export const useCatalogContext = () => {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalogContext must be used within CatalogProvider');
  return ctx;
};

export function CatalogProvider({ children }) {
  const { showNotification } = useUIContext();
  const { currentUser } = useAuthContext();

  const [products, setProducts] = useState([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [categories, setCategories] = useState([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);

  const loadProducts = useCallback(async () => {
    try {
      setIsLoadingProducts(true);
      const data = await productsApi.getAllProducts();
      setProducts(data);
    } catch (error) {
      console.error('Failed to load products:', error);
    } finally {
      setIsLoadingProducts(false);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      setIsLoadingCategories(true);
      const data = await categoriesApi.getAllCategories();
      setCategories(data);
    } catch (error) {
      console.error('Failed to load categories:', error);
    } finally {
      setIsLoadingCategories(false);
    }
  }, []);

  const addProduct = async (product) => {
    try {
      await productsApi.createProduct(product);
      setProducts(await productsApi.getAllProducts());
      showNotification('Product added successfully', 'success');
    } catch (error) {
      showNotification(error.message || 'Failed to add product. Please try again.', 'error');
      throw error;
    }
  };

  const updateProduct = async (id, updates) => {
    try {
      await productsApi.updateProduct(id, updates);
      setProducts(await productsApi.getAllProducts());
      showNotification('Product updated successfully', 'success');
    } catch (error) {
      showNotification(error.message || 'Failed to update product. Please try again.', 'error');
      throw error;
    }
  };

  const deleteProduct = async (id) => {
    try {
      await productsApi.deleteProduct(id);
      setProducts(await productsApi.getAllProducts());
      showNotification('Product deleted', 'info');
    } catch (error) {
      showNotification(error.message || 'Failed to delete product. Please try again.', 'error');
      throw error;
    }
  };

  const createCategory = async (data) => {
    try {
      await categoriesApi.createCategory(data);
      setCategories(await categoriesApi.getAllCategories());
      showNotification('Category created successfully', 'success');
    } catch (error) {
      showNotification(error.message || 'Failed to create category. Please try again.', 'error');
      throw error;
    }
  };

  const updateCategory = async (id, updates) => {
    try {
      await categoriesApi.updateCategory(id, updates);
      setCategories(await categoriesApi.getAllCategories());
      showNotification('Category updated successfully', 'success');
    } catch (error) {
      showNotification(error.message || 'Failed to update category. Please try again.', 'error');
      throw error;
    }
  };

  const deleteCategory = async (id) => {
    try {
      await categoriesApi.deleteCategory(id);
      setCategories(await categoriesApi.getAllCategories());
      showNotification('Category deleted', 'info');
    } catch (error) {
      showNotification(error.message || 'Failed to delete category. Please try again.', 'error');
      throw error;
    }
  };

  // Review mutations are optimistic local updates — no API round-trip
  const addReview = (productId, review) => {
    setProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;
      const newReview = {
        id: (p.reviews?.length || 0) + 1,
        userId: currentUser.id,
        userName: currentUser.username,
        rating: review.rating,
        comment: review.comment,
        date: new Date().toISOString().split('T')[0],
        helpful: 0,
        notHelpful: 0,
        flagged: false,
        replies: [],
      };
      return { ...p, reviews: [...(p.reviews || []), newReview] };
    }));
    showNotification('Review posted successfully', 'success');
  };

  const updateReview = (productId, reviewId, updates) => {
    setProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;
      return { ...p, reviews: p.reviews.map(r => r.id === reviewId ? { ...r, ...updates } : r) };
    }));
    showNotification('Review updated', 'success');
  };

  const deleteReview = (productId, reviewId) => {
    setProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;
      return { ...p, reviews: p.reviews.filter(r => r.id !== reviewId) };
    }));
    showNotification('Review deleted', 'info');
  };

  const addReviewReply = (productId, reviewId, reply) => {
    setProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;
      return {
        ...p,
        reviews: p.reviews.map(r => {
          if (r.id !== reviewId) return r;
          const newReply = {
            id: (r.replies?.length || 0) + 1,
            userId: currentUser.id,
            userName: currentUser.username,
            userRole: currentUser.roles?.[0] || ROLES.CUSTOMER,
            comment: reply,
            date: new Date().toISOString().split('T')[0],
          };
          return { ...r, replies: [...(r.replies || []), newReply] };
        }),
      };
    }));
    showNotification('Reply added', 'success');
  };

  const voteReview = (productId, reviewId, type) => {
    setProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;
      return {
        ...p,
        reviews: p.reviews.map(r => {
          if (r.id !== reviewId) return r;
          return type === 'helpful' ? { ...r, helpful: r.helpful + 1 } : { ...r, notHelpful: r.notHelpful + 1 };
        }),
      };
    }));
  };

  const flagReview = (productId, reviewId) => {
    setProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;
      return { ...p, reviews: p.reviews.map(r => r.id === reviewId ? { ...r, flagged: true } : r) };
    }));
    showNotification('Review flagged for moderation', 'info');
  };

  return (
    <CatalogContext.Provider value={{
      products, setProducts, isLoadingProducts,
      categories, isLoadingCategories,
      loadProducts, loadCategories,
      addProduct, updateProduct, deleteProduct,
      createCategory, updateCategory, deleteCategory,
      addReview, updateReview, deleteReview, addReviewReply, voteReview, flagReview,
    }}>
      {children}
    </CatalogContext.Provider>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
cd web && npx vitest run src/context/CatalogContext.test.jsx
```
Expected: 4/4 passing.

- [ ] **Step 5: Commit**

```bash
git add web/src/context/CatalogContext.jsx web/src/context/CatalogContext.test.jsx
git commit -m "feat(context): extract CatalogContext from AppContext"
```

---

### Task 5: NotificationsContext

Owns notification inbox and polling. Depends on UIContext and AuthContext. Must be mounted **above** OrdersContext and CartContext so they can call `useNotificationsContext()`.

**Files:**
- Create: `web/src/context/NotificationsContext.jsx`
- Create: `web/src/context/NotificationsContext.test.jsx`

**Interfaces:**
- Consumes: `useAuthContext()` → `{ isAuthenticated, currentUser }`
- Produces:
  ```js
  export const useNotificationsContext = () => ({
    inboxNotifications, unreadNotificationCount, staffNotificationCounts, notificationsMuted,
    loadNotifications, loadUnreadNotificationCount, loadStaffNotificationCounts,
    refreshNotifications, handleNotificationsPanelOpen,
    markNotificationRead, markAllNotificationsRead, toggleNotificationsMuted,
  })
  export function NotificationsProvider({ children })
  ```

- [ ] **Step 1: Write failing tests**

```jsx
// web/src/context/NotificationsContext.test.jsx
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
vi.mock('../services/authApi', () => ({ getProfile: vi.fn(), login: vi.fn(), logout: vi.fn(), register: vi.fn() }));
vi.mock('../services/storeCreditApi', () => ({ getUserCredit: vi.fn() }));
vi.mock('../services/api', () => ({ getAuthToken: vi.fn(() => null), newSession: vi.fn() }));
vi.mock('../services/ordersApi', () => ({ checkDeliveryEligibility: vi.fn() }));
vi.mock('../services/usersApi', () => ({ updateUser: vi.fn() }));
vi.mock('../services/configApi', () => ({ getConfig: vi.fn() }));
vi.mock('../services/landingPageSettingsApi', () => ({ getLandingPageSettings: vi.fn() }));
vi.mock('../services/productsApi', () => ({ getAllProducts: vi.fn(), createProduct: vi.fn(), updateProduct: vi.fn(), deleteProduct: vi.fn() }));
vi.mock('../services/categoriesApi', () => ({ getAllCategories: vi.fn(), createCategory: vi.fn(), updateCategory: vi.fn(), deleteCategory: vi.fn() }));
vi.mock('../utils/colorUtils', () => ({ applyBrandingTokens: vi.fn() }));

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
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd web && npx vitest run src/context/NotificationsContext.test.jsx
```
Expected: FAIL — file does not exist.

- [ ] **Step 3: Implement NotificationsContext**

```jsx
// web/src/context/NotificationsContext.jsx
import React, { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import * as notificationsApi from '../services/notificationsApi';
import { hasAnyRole, ROLES } from '../utils/roles';
import { useAuthContext } from './AuthContext';

const NotificationsContext = createContext(null);

const parsePollingInterval = (rawValue, fallback) => {
  const parsed = Number.parseInt(rawValue ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const NOTIFICATION_POLL_INTERVAL_MS = parsePollingInterval(import.meta.env.VITE_NOTIFICATION_POLL_INTERVAL_MS, 60000);
const STAFF_COUNTS_POLL_INTERVAL_MS = parsePollingInterval(import.meta.env.VITE_STAFF_COUNTS_POLL_INTERVAL_MS, 60000);

export const useNotificationsContext = () => {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotificationsContext must be used within NotificationsProvider');
  return ctx;
};

export function NotificationsProvider({ children }) {
  const { isAuthenticated, currentUser } = useAuthContext();

  const [staffNotificationCounts, setStaffNotificationCounts] = useState(null);
  const [inboxNotifications, setInboxNotifications] = useState([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [notificationsMuted, setNotificationsMuted] = useState(
    () => sessionStorage.getItem('notificationsMuted') === 'true'
  );

  const hasInteractedRef = useRef(false);
  const hasLoadedNotificationsRef = useRef(false);
  const knownAttentionNotificationIdsRef = useRef(new Set());

  useEffect(() => {
    const markInteracted = () => { hasInteractedRef.current = true; };
    window.addEventListener('pointerdown', markInteracted, { once: true });
    window.addEventListener('keydown', markInteracted, { once: true });
    return () => {
      window.removeEventListener('pointerdown', markInteracted);
      window.removeEventListener('keydown', markInteracted);
    };
  }, []);

  const playStaffAttentionSound = useCallback(() => {
    if (typeof window === 'undefined') return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.28);
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.3);
    oscillator.onended = () => audioContext.close().catch(() => {});
  }, []);

  const loadNotifications = useCallback(async () => {
    if (!isAuthenticated) return [];
    try {
      const data = await notificationsApi.getNotifications();
      setInboxNotifications(data);
      return data;
    } catch { return []; }
  }, [isAuthenticated]);

  const loadUnreadNotificationCount = useCallback(async () => {
    if (!isAuthenticated) return { count: 0 };
    try {
      const data = await notificationsApi.getUnreadNotificationCount();
      setUnreadNotificationCount(data.count ?? 0);
      return data;
    } catch { return { count: 0 }; }
  }, [isAuthenticated]);

  const refreshNotifications = useCallback(async ({ includeList = true } = {}) => {
    if (!isAuthenticated) return { notifications: [], unreadCount: 0 };
    const unread = await loadUnreadNotificationCount();
    if (!includeList) return { notifications: [], unreadCount: unread.count ?? 0 };
    const notifications = await loadNotifications();
    const isStaffUser = hasAnyRole(currentUser, [ROLES.EMPLOYEE, ROLES.MANAGEMENT, ROLES.ADMIN]);
    const attentionIds = new Set(
      notifications.filter(item => item.requiresAttention && !item.readAt).map(item => item.id)
    );
    if (!hasLoadedNotificationsRef.current) {
      hasLoadedNotificationsRef.current = true;
      knownAttentionNotificationIdsRef.current = attentionIds;
      return { notifications, unreadCount: unread.count ?? 0 };
    }
    const newAttentionIds = [...attentionIds].filter(id => !knownAttentionNotificationIdsRef.current.has(id));
    knownAttentionNotificationIdsRef.current = attentionIds;
    if (isStaffUser && newAttentionIds.length > 0 && !notificationsMuted && hasInteractedRef.current) {
      playStaffAttentionSound();
    }
    return { notifications, unreadCount: unread.count ?? 0 };
  }, [currentUser, isAuthenticated, loadNotifications, loadUnreadNotificationCount, notificationsMuted, playStaffAttentionSound]);

  const loadStaffNotificationCounts = useCallback(async () => {
    if (!isAuthenticated) { setStaffNotificationCounts(null); return; }
    const isStaff = hasAnyRole(currentUser, [ROLES.EMPLOYEE, ROLES.MANAGEMENT, ROLES.ADMIN]);
    if (!isStaff) { setStaffNotificationCounts(null); return; }
    try {
      const data = await notificationsApi.getStaffNotificationCounts();
      setStaffNotificationCounts(data);
    } catch { /* silent */ }
  }, [isAuthenticated, currentUser]);

  useEffect(() => {
    void loadStaffNotificationCounts();
    if (!isAuthenticated) {
      setStaffNotificationCounts(null);
      setInboxNotifications([]);
      setUnreadNotificationCount(0);
      hasLoadedNotificationsRef.current = false;
      knownAttentionNotificationIdsRef.current = new Set();
      return;
    }
    const isStaff = hasAnyRole(currentUser, [ROLES.EMPLOYEE, ROLES.MANAGEMENT, ROLES.ADMIN]);
    if (!isStaff) return;
    const interval = setInterval(() => void loadStaffNotificationCounts(), STAFF_COUNTS_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadStaffNotificationCounts, isAuthenticated, currentUser]);

  useEffect(() => {
    void refreshNotifications({ includeList: true });
    if (!isAuthenticated) return;
    const interval = setInterval(() => void refreshNotifications({ includeList: false }), NOTIFICATION_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshNotifications, isAuthenticated]);

  const toggleNotificationsMuted = useCallback(() => {
    setNotificationsMuted(prev => {
      const next = !prev;
      sessionStorage.setItem('notificationsMuted', String(next));
      return next;
    });
  }, []);

  const markNotificationRead = useCallback(async (notificationId) => {
    const now = new Date().toISOString();
    setInboxNotifications(prev => prev.map(item =>
      item.id === notificationId && !item.readAt ? { ...item, readAt: now } : item
    ));
    setUnreadNotificationCount(prev => Math.max(0, prev - 1));
    knownAttentionNotificationIdsRef.current = new Set(
      [...knownAttentionNotificationIdsRef.current].filter(id => id !== notificationId)
    );
    try {
      await notificationsApi.markNotificationRead(notificationId);
    } finally {
      await refreshNotifications({ includeList: true });
    }
  }, [refreshNotifications]);

  const markAllNotificationsRead = useCallback(async () => {
    await notificationsApi.markAllNotificationsRead();
    await refreshNotifications({ includeList: true });
  }, [refreshNotifications]);

  const handleNotificationsPanelOpen = useCallback(async () => {
    await refreshNotifications({ includeList: true });
  }, [refreshNotifications]);

  return (
    <NotificationsContext.Provider value={{
      inboxNotifications, unreadNotificationCount, staffNotificationCounts, notificationsMuted,
      loadNotifications, loadUnreadNotificationCount, loadStaffNotificationCounts,
      refreshNotifications, handleNotificationsPanelOpen,
      markNotificationRead, markAllNotificationsRead, toggleNotificationsMuted,
    }}>
      {children}
    </NotificationsContext.Provider>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
cd web && npx vitest run src/context/NotificationsContext.test.jsx
```
Expected: 3/3 passing.

- [ ] **Step 5: Commit**

```bash
git add web/src/context/NotificationsContext.jsx web/src/context/NotificationsContext.test.jsx
git commit -m "feat(context): extract NotificationsContext from AppContext"
```

---

### Task 6: OrdersContext

Owns order list and all order actions. Depends on UIContext, AuthContext, NotificationsContext.

**Files:**
- Create: `web/src/context/OrdersContext.jsx`
- Create: `web/src/context/OrdersContext.test.jsx`

**Interfaces:**
- Consumes: `useUIContext()`, `useAuthContext()`, `useNotificationsContext()` → `{ refreshNotifications, loadStaffNotificationCounts }`
- Produces:
  ```js
  export const useOrdersContext = () => ({
    orders, setOrders, isLoadingOrders,
    loadOrders, updateOrderStatus, notifyArrival, deleteOrder,
    printOrderReceipt, addItemToOrder, voidOrderItem, deleteOrderItem, restoreOrder,
  })
  export function OrdersProvider({ children })
  ```

- [ ] **Step 1: Write failing tests**

```jsx
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
vi.mock('../services/authApi', () => ({ getProfile: vi.fn(), login: vi.fn(), logout: vi.fn(), register: vi.fn() }));
vi.mock('../services/storeCreditApi', () => ({ getUserCredit: vi.fn() }));
vi.mock('../services/api', () => ({ getAuthToken: vi.fn(() => null), newSession: vi.fn() }));
vi.mock('../services/usersApi', () => ({ updateUser: vi.fn() }));
vi.mock('../services/configApi', () => ({ getConfig: vi.fn() }));
vi.mock('../services/landingPageSettingsApi', () => ({ getLandingPageSettings: vi.fn() }));
vi.mock('../services/productsApi', () => ({ getAllProducts: vi.fn(), createProduct: vi.fn(), updateProduct: vi.fn(), deleteProduct: vi.fn() }));
vi.mock('../services/categoriesApi', () => ({ getAllCategories: vi.fn(), createCategory: vi.fn(), updateCategory: vi.fn(), deleteCategory: vi.fn() }));
vi.mock('../services/notificationsApi', () => ({
  getNotifications: vi.fn(),
  getUnreadNotificationCount: vi.fn(),
  getStaffNotificationCounts: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));
vi.mock('../utils/colorUtils', () => ({ applyBrandingTokens: vi.fn() }));

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
    await result.current.loadOrders();
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
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd web && npx vitest run src/context/OrdersContext.test.jsx
```
Expected: FAIL — file does not exist.

- [ ] **Step 3: Implement OrdersContext**

```jsx
// web/src/context/OrdersContext.jsx
import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import * as ordersApi from '../services/ordersApi';
import { useUIContext } from './UIContext';
import { useAuthContext } from './AuthContext';
import { useNotificationsContext } from './NotificationsContext';

const OrdersContext = createContext(null);

const parsePollingInterval = (rawValue, fallback) => {
  const parsed = Number.parseInt(rawValue ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const ORDER_POLL_INTERVAL_MS = parsePollingInterval(import.meta.env.VITE_ORDER_POLL_INTERVAL_MS, 60000);

export const useOrdersContext = () => {
  const ctx = useContext(OrdersContext);
  if (!ctx) throw new Error('useOrdersContext must be used within OrdersProvider');
  return ctx;
};

export function OrdersProvider({ children }) {
  const { showNotification } = useUIContext();
  const { isAuthenticated, isLoading } = useAuthContext();
  const { refreshNotifications, loadStaffNotificationCounts } = useNotificationsContext();

  const [orders, setOrders] = useState([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  const loadOrders = useCallback(async (silent = false) => {
    if (!isAuthenticated) { setOrders([]); return; }
    try {
      if (!silent) setIsLoadingOrders(true);
      setOrders(await ordersApi.getAllOrders());
    } catch (error) {
      console.error('Failed to load orders:', error);
    } finally {
      if (!silent) setIsLoadingOrders(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isLoading) loadOrders();
    if (!isAuthenticated || isLoading) return;
    const interval = setInterval(() => loadOrders(true), ORDER_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isAuthenticated, isLoading, loadOrders]);

  const updateOrderStatus = async (orderId, status) => {
    try {
      await ordersApi.updateOrderStatus(orderId, status);
      setOrders(await ordersApi.getAllOrders());
      showNotification('Order status updated', 'success');
      await Promise.all([refreshNotifications(), loadStaffNotificationCounts()]);
    } catch (error) {
      showNotification(error.message || 'Failed to update order status. Please try again.', 'error');
      throw error;
    }
  };

  const notifyArrival = async (orderId, parkingSpot) => {
    try {
      const updatedOrder = await ordersApi.notifyArrival(orderId, parkingSpot);
      setOrders(await ordersApi.getAllOrders());
      showNotification('Arrival notification sent successfully', 'success');
      return updatedOrder;
    } catch (error) {
      showNotification(error.message || 'Failed to send arrival notification. Please try again.', 'error');
      throw error;
    }
  };

  const deleteOrder = async (orderId, { silent = false } = {}) => {
    try {
      await ordersApi.deleteOrder(orderId);
      setOrders(await ordersApi.getAllOrders());
      if (!silent) showNotification('Order deleted', 'info');
    } catch (error) {
      showNotification(error.message || 'Failed to delete order. Please try again.', 'error');
      throw error;
    }
  };

  const printOrderReceipt = async (orderId) => {
    try {
      const result = await ordersApi.printOrderReceipt(orderId);
      showNotification(
        result.queued ? 'Receipt queued for printing.' : 'Printer is not configured yet, so no receipt was queued.',
        result.queued ? 'success' : 'warning'
      );
      return result;
    } catch (error) {
      showNotification(error.message || 'Failed to print receipt. Please try again.', 'error');
      throw error;
    }
  };

  const addItemToOrder = async (orderId, variantId, quantity) => {
    try {
      await ordersApi.addItemToOrder(orderId, variantId, quantity);
      setOrders(await ordersApi.getAllOrders());
      showNotification('Item added to order', 'success');
    } catch (error) {
      showNotification(error.message || 'Failed to add item to order. Please try again.', 'error');
      throw error;
    }
  };

  const voidOrderItem = async (orderId, itemIdOrIndex) => {
    try {
      let itemId = itemIdOrIndex;
      if (typeof itemIdOrIndex === 'number' && itemIdOrIndex >= 0) {
        const order = orders.find(o => o.id === orderId);
        if (order?.items?.[itemIdOrIndex]) {
          itemId = order.items[itemIdOrIndex].id || itemIdOrIndex;
        }
      }
      await ordersApi.voidOrderItem(orderId, itemId);
      setOrders(await ordersApi.getAllOrders());
      showNotification('Item voided', 'info');
    } catch (error) {
      showNotification(error.message || 'Failed to void item. Please try again.', 'error');
      throw error;
    }
  };

  const deleteOrderItem = async (orderId, itemIdOrIndex) => {
    try {
      let itemId = itemIdOrIndex;
      if (typeof itemIdOrIndex === 'number' && itemIdOrIndex >= 0) {
        const order = orders.find(o => o.id === orderId);
        if (order?.items?.[itemIdOrIndex]) {
          itemId = order.items[itemIdOrIndex].id || itemIdOrIndex;
        }
      }
      await ordersApi.deleteOrderItem(orderId, itemId);
      setOrders(await ordersApi.getAllOrders());
      showNotification('Item removed from order', 'info');
    } catch (error) {
      showNotification(error.message || 'Failed to remove item from order. Please try again.', 'error');
      throw error;
    }
  };

  const restoreOrder = (orderState) => {
    setOrders(prev => prev.map(o => o.id === orderState.id ? orderState : o));
  };

  return (
    <OrdersContext.Provider value={{
      orders, setOrders, isLoadingOrders,
      loadOrders, updateOrderStatus, notifyArrival, deleteOrder,
      printOrderReceipt, addItemToOrder, voidOrderItem, deleteOrderItem, restoreOrder,
    }}>
      {children}
    </OrdersContext.Provider>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
cd web && npx vitest run src/context/OrdersContext.test.jsx
```
Expected: 3/3 passing.

- [ ] **Step 5: Commit**

```bash
git add web/src/context/OrdersContext.jsx web/src/context/OrdersContext.test.jsx
git commit -m "feat(context): extract OrdersContext from AppContext"
```

---

### Task 7: CartContext

Owns cart state and checkout. Deepest context — can call all other contexts. Depends on UIContext, AuthContext, OrdersContext, NotificationsContext.

**Files:**
- Create: `web/src/context/CartContext.jsx`
- Create: `web/src/context/CartContext.test.jsx`

**Interfaces:**
- Consumes: `useUIContext()`, `useAuthContext()` → `{ currentUser, refreshCreditBalance }`, `useOrdersContext()` → `{ setOrders }`, `useNotificationsContext()` → `{ refreshNotifications, loadStaffNotificationCounts }`
- Produces:
  ```js
  export const useCartContext = () => ({
    cart, setCart, addToCart, removeFromCart, updateCartQuantity, checkout, restoreCart,
  })
  export function CartProvider({ children })
  ```

- [ ] **Step 1: Write failing tests**

```jsx
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
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd web && npx vitest run src/context/CartContext.test.jsx
```
Expected: FAIL — file does not exist.

- [ ] **Step 3: Implement CartContext**

```jsx
// web/src/context/CartContext.jsx
import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import * as ordersApi from '../services/ordersApi';
import * as authApi from '../services/authApi';
import { PaymentMethod, DeliveryMethod } from '../constants/orderMethods';
import { getAllowedQuantities } from '../features/products/productsHelpers';
import { useUIContext } from './UIContext';
import { useAuthContext } from './AuthContext';
import { useOrdersContext } from './OrdersContext';
import { useNotificationsContext } from './NotificationsContext';

const CartContext = createContext(null);
const CART_STORAGE_KEY = 'cartData_v2';

export const useCartContext = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCartContext must be used within CartProvider');
  return ctx;
};

export function CartProvider({ children }) {
  const { showNotification, closeNotification } = useUIContext();
  const { currentUser, setCurrentUser, setIsAuthenticated, refreshCreditBalance } = useAuthContext();
  const { setOrders } = useOrdersContext();
  const { refreshNotifications, loadStaffNotificationCounts } = useNotificationsContext();
  const navigate = useNavigate();

  const getInitialCart = () => {
    const stored = localStorage.getItem(CART_STORAGE_KEY);
    if (!stored) return [];
    try {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  };

  const [cart, setCart] = useState(getInitialCart);

  useEffect(() => {
    if (cart.length === 0) { localStorage.removeItem(CART_STORAGE_KEY); return; }
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  }, [cart]);

  // Clear cart on auth:unauthorized
  useEffect(() => {
    const handleUnauthorized = () => setCart([]);
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  const isQuantityAllowed = (quantity, allowedQuantities) =>
    allowedQuantities.some(allowed => Math.abs(allowed - quantity) < 1e-9);

  const addToCart = (product, variant, quantity) => {
    setCart(prev => {
      const existing = prev.find(item => item.variantId === variant.id);
      const allowedQuantities = getAllowedQuantities(variant);
      let requestedQuantity = quantity;
      if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
        if (allowedQuantities.length > 0) {
          if (existing) {
            const idx = allowedQuantities.findIndex(v => Math.abs(v - existing.quantity) < 1e-9);
            requestedQuantity = idx >= 0 && idx < allowedQuantities.length - 1 ? allowedQuantities[idx + 1] : existing.quantity;
          } else {
            requestedQuantity = allowedQuantities[0];
          }
        } else {
          requestedQuantity = 1;
        }
      }
      const desiredQuantity = existing ? existing.quantity + requestedQuantity : requestedQuantity;
      const nextQuantity = allowedQuantities.length > 0
        ? (isQuantityAllowed(desiredQuantity, allowedQuantities) ? desiredQuantity
          : isQuantityAllowed(requestedQuantity, allowedQuantities) ? requestedQuantity
          : allowedQuantities[0])
        : desiredQuantity;
      const cartItem = {
        id: variant.id, variantId: variant.id, productId: product.id,
        variantLabel: variant.label, name: product.name,
        basePrice: Number(variant.basePrice), pricingMode: variant.pricingMode,
        quantityOptions: variant.quantityOptions ?? [], priceBreaks: variant.priceBreaks ?? [],
        stockEnabled: variant.stockEnabled, stock: Number(variant.stock),
        categoryId: product.categoryId, images: product.images ?? [],
      };
      if (existing) return prev.map(item => item.variantId === variant.id ? { ...item, quantity: nextQuantity } : item);
      return [...prev, { ...cartItem, quantity: nextQuantity }];
    });
    showNotification(`${product.name} added to cart!`, 'success', {
      label: 'View Cart',
      onClick: () => { navigate('/cart'); closeNotification(); },
    });
  };

  const removeFromCart = (variantId) => setCart(prev => prev.filter(item => item.variantId !== variantId));

  const updateCartQuantity = (variantId, quantity) => {
    const normalized = typeof quantity === 'string' ? parseFloat(quantity) : quantity;
    if (!Number.isFinite(normalized) || normalized <= 0) { removeFromCart(variantId); return; }
    setCart(prev => prev.map(item => item.variantId === variantId ? { ...item, quantity: normalized } : item));
  };

  const restoreCart = (items) => setCart(items);

  const checkout = async (cashAppUsername, deliveryMethod, paymentMethod, deliveryAddress, vehicleDescription) => {
    try {
      const items = cart.map(item => ({ variantId: item.variantId, quantity: item.quantity }));
      const newOrder = await ordersApi.createOrder(items, cashAppUsername, deliveryMethod, paymentMethod, deliveryAddress, vehicleDescription);

      if (deliveryMethod === DeliveryMethod.DELIVERY) {
        try {
          const refreshedUser = await authApi.getProfile();
          if (!refreshedUser.roles && refreshedUser.role) refreshedUser.roles = [refreshedUser.role];
          setCurrentUser(refreshedUser);
          setIsAuthenticated(true);
        } catch {
          if (paymentMethod !== PaymentMethod.STORE_CREDIT) {
            const updatedUserData = { ...currentUser, cashapp: cashAppUsername };
            setCurrentUser(updatedUserData);
            localStorage.setItem('userData', JSON.stringify(updatedUserData));
          }
        }
      } else if (paymentMethod !== PaymentMethod.STORE_CREDIT) {
        const updatedUserData = { ...currentUser, cashapp: cashAppUsername };
        setCurrentUser(updatedUserData);
        localStorage.setItem('userData', JSON.stringify(updatedUserData));
      } else if (paymentMethod === PaymentMethod.STORE_CREDIT) {
        await refreshCreditBalance(currentUser.id);
      }

      setOrders(await ordersApi.getAllOrders());
      setCart([]);
      showNotification('Order placed successfully!', 'success');
      await Promise.all([refreshNotifications(), loadStaffNotificationCounts()]);
      return newOrder;
    } catch (error) {
      showNotification(error.message || 'Failed to place order. Please try again.', 'error');
      throw error;
    }
  };

  return (
    <CartContext.Provider value={{ cart, setCart, addToCart, removeFromCart, updateCartQuantity, checkout, restoreCart }}>
      {children}
    </CartContext.Provider>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
cd web && npx vitest run src/context/CartContext.test.jsx
```
Expected: 5/5 passing.

- [ ] **Step 5: Commit**

```bash
git add web/src/context/CartContext.jsx web/src/context/CartContext.test.jsx
git commit -m "feat(context): extract CartContext from AppContext"
```

---

### Task 8: Compatibility shim + smoke test

Gut `AppContext.jsx` down to a thin provider composer and value merger. `useApp()` must return the same shape as before.

**Files:**
- Modify: `web/src/context/AppContext.jsx` (replace entire file)
- Create: `web/src/context/AppContext.shim.test.jsx`

**Interfaces:**
- Consumes: all 6 context hooks
- Produces: `useApp()` returning merged object, `AppProvider` wrapping all 6 providers

- [ ] **Step 1: Write failing smoke test**

```jsx
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
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd web && npx vitest run src/context/AppContext.shim.test.jsx
```
Expected: FAIL — `useApp` won't return the merged shape yet.

- [ ] **Step 3: Replace AppContext.jsx with the shim**

```jsx
// web/src/context/AppContext.jsx
import React, { createContext, useContext } from 'react';
import { UIProvider, useUIContext } from './UIContext';
import { AuthProvider, useAuthContext } from './AuthContext';
import { StoreConfigProvider, useStoreConfigContext } from './StoreConfigContext';
import { CatalogProvider, useCatalogContext } from './CatalogContext';
import { NotificationsProvider, useNotificationsContext } from './NotificationsContext';
import { OrdersProvider, useOrdersContext } from './OrdersContext';
import { CartProvider, useCartContext } from './CartContext';

const AppContext = createContext(null);

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};

function AppValueProvider({ children }) {
  const ui = useUIContext();
  const auth = useAuthContext();
  const storeConfig = useStoreConfigContext();
  const catalog = useCatalogContext();
  const notifications = useNotificationsContext();
  const orders = useOrdersContext();
  const cart = useCartContext();

  const value = {
    ...ui,
    ...auth,
    ...storeConfig,
    ...catalog,
    ...notifications,
    ...orders,
    ...cart,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function AppProvider({ children }) {
  return (
    <UIProvider>
      <AuthProvider>
        <StoreConfigProvider>
          <CatalogProvider>
            <NotificationsProvider>
              <OrdersProvider>
                <CartProvider>
                  <AppValueProvider>
                    {children}
                  </AppValueProvider>
                </CartProvider>
              </OrdersProvider>
            </NotificationsProvider>
          </CatalogProvider>
        </StoreConfigProvider>
      </AuthProvider>
    </UIProvider>
  );
}
```

- [ ] **Step 4: Run the shim smoke test**

```bash
cd web && npx vitest run src/context/AppContext.shim.test.jsx
```
Expected: 2/2 passing.

- [ ] **Step 5: Run the full existing AppContext test suite**

```bash
cd web && npx vitest run src/context/AppContext
```
Expected: all existing AppContext tests pass unchanged.

- [ ] **Step 6: Run all frontend tests**

```bash
cd web && npx vitest run
```
Expected: no regressions — all tests passing.

- [ ] **Step 7: Commit**

```bash
git add web/src/context/AppContext.jsx web/src/context/AppContext.shim.test.jsx
git commit -m "feat(context): replace AppContext god-object with 6-context shim"
```
