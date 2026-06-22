import React, { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import * as authApi from '../services/authApi';
import * as usersApi from '../services/usersApi';
import * as productsApi from '../services/productsApi';
import * as ordersApi from '../services/ordersApi';
import * as categoriesApi from '../services/categoriesApi';
import * as notificationsApi from '../services/notificationsApi';
import * as configApi from '../services/configApi';
import * as creditApi from '../services/storeCreditApi';
import { getAuthToken, newSession } from '../services/api';
import { toNotificationMessage } from '../utils/notificationMessage';
import { hasAnyRole, GUEST_USER, ROLES } from '../utils/roles';
import { applyBrandingTokens } from '../utils/colorUtils';
import { getAllowedQuantities } from '../features/products/productsHelpers';
import { DeliveryMethod, PaymentMethod } from '../constants/orderMethods';

// Context for authentication and global state
const AppContext = createContext();
const CART_STORAGE_KEY = 'cartData_v2';

const parsePollingInterval = (rawValue, fallback) => {
  const parsed = Number.parseInt(rawValue ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const NOTIFICATION_POLL_INTERVAL_MS = parsePollingInterval(import.meta.env.VITE_NOTIFICATION_POLL_INTERVAL_MS, 60000);
const STAFF_COUNTS_POLL_INTERVAL_MS = parsePollingInterval(import.meta.env.VITE_STAFF_COUNTS_POLL_INTERVAL_MS, 60000);
const ORDER_POLL_INTERVAL_MS = parsePollingInterval(import.meta.env.VITE_ORDER_POLL_INTERVAL_MS, 60000);

// Returns the shared app context and throws early if a consumer renders outside AppProvider.
export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};

// Owns the app-wide auth, catalog, order, cart, config, and notification state for the client.
export function AppProvider({ children }) {
  // Initialize user from localStorage or default guest
  // Restores the cached user when possible and falls back to the guest sentinel if parsing fails.
  const getInitialUser = () => {
    const storedUser = localStorage.getItem('userData');
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        // Ensure roles array exists for backward compatibility with older cached user payloads.
        if (!user.roles && user.role) {
          user.roles = [user.role];
        }
        return user;
      } catch (e) {
        console.error('Error parsing stored user data:', e);
      }
    }
    return GUEST_USER;
  };

  // Persists the cart across refreshes via localStorage; do not remove this without replacing refresh-safe cart restore behavior.
  const getInitialCart = () => {
    const storedCart = localStorage.getItem(CART_STORAGE_KEY);
    if (!storedCart) {
      return [];
    }

    try {
      const parsedCart = JSON.parse(storedCart);
      return Array.isArray(parsedCart) ? parsedCart : [];
    } catch (error) {
      console.error('Error parsing stored cart data:', error);
      return [];
    }
  };

  const [currentUser, setCurrentUser] = useState(getInitialUser);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [categories, setCategories] = useState([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [cart, setCart] = useState(getInitialCart);
  const [notification, setNotification] = useState(null);
  const [returnPath, setReturnPath] = useState(null);
  const [staffNotificationCounts, setStaffNotificationCounts] = useState(null);
  const [inboxNotifications, setInboxNotifications] = useState([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [notificationsMuted, setNotificationsMuted] = useState(
    () => sessionStorage.getItem('notificationsMuted') === 'true'
  );
  const [taxRate, setTaxRate] = useState(0); // Set initial to 0, let config endpoint provide it
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
  const [creditBalance, setCreditBalance] = useState(0);
  const hasInteractedRef = useRef(false);
  const hasLoadedNotificationsRef = useRef(false);
  const knownAttentionNotificationIdsRef = useRef(new Set());
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (cart.length === 0) {
      localStorage.removeItem(CART_STORAGE_KEY);
      return;
    }

    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  }, [cart]);

  // Check authentication on mount
  useEffect(() => {
    // Revalidates the saved token on mount and keeps credit state defaulted to 0 if credit lookup fails.

    const checkAuth = async () => {
      try {
        const token = getAuthToken();
        if (token) {
          try {
            const user = await authApi.getProfile();
            // Ensure roles array exists so profile responses stay compatible with current role checks.
            if (!user.roles && user.role) {
              user.roles = [user.role];
            }
            setCurrentUser(user);
            setIsAuthenticated(true);
            newSession();
            // Load credit balance for authenticated users so checkout and header state stay in sync after refresh.
            try {
              const creditData = await creditApi.getUserCredit(user.id);
              setCreditBalance(creditData.balance ?? 0);
            } catch {
              // Non-fatal: credit balance defaults to 0
            }
          } catch (error) {
            // Token invalid or expired
            console.error('Auth check failed:', error);
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

  // Loads shared storefront config and keeps landing arrays defaulted to [] if config omits them.
  const loadConfig = useCallback(async () => {
    try {
      const config = await configApi.getConfig();
      if (config) {
        // Central config hydration keeps checkout, store info, and admin settings reading one shared source.
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
          if (config.branding.storeName) {
            document.title = config.branding.storeName;
          }
          if (config.branding.faviconUrls?.['32']) {
            const link = document.querySelector("link[rel~='icon']") || document.createElement('link');
            link.rel = 'icon';
            link.href = config.branding.faviconUrls['32'];
            if (!document.head.contains(link)) document.head.appendChild(link);
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load remote config, using default tax rate.', e);
    }
  }, []);

  // Load products function (can be called manually)
  // Loads the product catalog and leaves products as an empty array on failure for a safe default UI.
  const loadProducts = useCallback(async () => {
    try {
      setIsLoadingProducts(true);
      const productsData = await productsApi.getAllProducts();
      setProducts(productsData);
    } catch (error) {
      console.error('Failed to load products:', error);
      // Don't show error notification on initial load, just log it
      // Products will remain empty array
    } finally {
      setIsLoadingProducts(false);
    }
  }, []);

  // Loads categories for filtering and product forms, defaulting to an empty array if the request fails.
  const loadCategories = useCallback(async () => {
    try {
      setIsLoadingCategories(true);
      const categoriesData = await categoriesApi.getAllCategories();
      setCategories(categoriesData);
    } catch (error) {
      console.error('Failed to load categories:', error);
    } finally {
      setIsLoadingCategories(false);
    }
  }, []);

  // Refreshes the core storefront data (products and categories) only when a session is active.
  const refreshStorefrontData = useCallback(async () => {
    if (isLoading || !isAuthenticated) return;
    await Promise.allSettled([loadProducts(), loadCategories()]);
  }, [isLoading, isAuthenticated, loadProducts, loadCategories]);

  // Fetches the shared store configuration only when authenticated or on the registration page where it is required.
  useEffect(() => {
    const isRegisterPage = location.pathname === '/register';
    if (isLoading) return;
    if (!isAuthenticated && !isRegisterPage) return;

    loadConfig();
  }, [loadConfig, isAuthenticated, isLoading, location.pathname]);

  // Triggers storefront data refreshes once the auth check completes and a valid user is detected.
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      refreshStorefrontData();
    }
  }, [refreshStorefrontData, isAuthenticated, isLoading]);

  useEffect(() => {
    // Marks the session as user-interacted once so staff alert sounds do not autoplay before interaction.
    const markInteracted = () => {
      hasInteractedRef.current = true;
    };

    window.addEventListener('pointerdown', markInteracted, { once: true });
    window.addEventListener('keydown', markInteracted, { once: true });
    return () => {
      window.removeEventListener('pointerdown', markInteracted);
      window.removeEventListener('keydown', markInteracted);
    };
  }, []);

  // Plays a short staff-only attention tone and bails safely when the browser audio APIs are unavailable.
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
    oscillator.onended = () => {
      audioContext.close().catch(() => {});
    };
  }, []);

  // Loads the notification inbox for authenticated users and otherwise returns an empty list.
  const loadNotifications = useCallback(async () => {
    if (!isAuthenticated) return [];
    try {
      const data = await notificationsApi.getNotifications();
      setInboxNotifications(data);
      return data;
    } catch {
      return [];
    }
  }, [isAuthenticated]);

  // Loads the unread notification count and defaults to 0 when the request cannot be completed.
  const loadUnreadNotificationCount = useCallback(async () => {
    if (!isAuthenticated) return { count: 0 };
    try {
      const data = await notificationsApi.getUnreadNotificationCount();
      setUnreadNotificationCount(data.count ?? 0);
      return data;
    } catch {
      return { count: 0 };
    }
  }, [isAuthenticated]);

  // Refreshes notification state and optionally re-loads full inbox payloads.
  const refreshNotifications = useCallback(async ({ includeList = true } = {}) => {
    if (!isAuthenticated) {
      return { notifications: [], unreadCount: 0 };
    }

    const unread = await loadUnreadNotificationCount();

    if (!includeList) {
      return {
        notifications: [], // We don't need to return the list if includeList is false
        unreadCount: unread.count ?? 0,
      };
    }

    const notifications = await loadNotifications();

    const isStaffUser = hasAnyRole(currentUser, [ROLES.EMPLOYEE, ROLES.MANAGEMENT, ROLES.ADMIN]);
    const attentionIds = new Set(
      notifications
        .filter((item) => item.requiresAttention && !item.readAt)
        .map((item) => item.id)
    );

    if (!hasLoadedNotificationsRef.current) {
      hasLoadedNotificationsRef.current = true;
      knownAttentionNotificationIdsRef.current = attentionIds;
      return { notifications, unreadCount: unread.count ?? 0 };
    }

    const newAttentionIds = [...attentionIds].filter(
      (id) => !knownAttentionNotificationIdsRef.current.has(id)
    );
    knownAttentionNotificationIdsRef.current = attentionIds;

    if (
      isStaffUser
      && newAttentionIds.length > 0
      && !notificationsMuted
      && hasInteractedRef.current
    ) {
      playStaffAttentionSound();
    }

    return { notifications, unreadCount: unread.count ?? 0 };
  }, [
    currentUser,
    isAuthenticated,
    loadNotifications,
    loadUnreadNotificationCount,
    notificationsMuted,
    playStaffAttentionSound,
  ]);

  // Loads staff dashboard badge counts and clears them for non-staff or signed-out sessions.
  const loadStaffNotificationCounts = useCallback(async () => {
    if (!isAuthenticated) {
      setStaffNotificationCounts(null);
      return;
    }
    const isStaff = hasAnyRole(currentUser, [ROLES.EMPLOYEE, ROLES.MANAGEMENT, ROLES.ADMIN]);
    if (!isStaff) {
      setStaffNotificationCounts(null);
      return;
    }
    try {
      const data = await notificationsApi.getStaffNotificationCounts();
      setStaffNotificationCounts(data);
    } catch {
      // Silently fail - don't show error for notification counts
    }
  }, [isAuthenticated, currentUser]);

  useEffect(() => {
    void loadStaffNotificationCounts();
    if (!isAuthenticated) {
      // Clear staff/notification state when logging out
      setStaffNotificationCounts(null);
      setInboxNotifications([]);
      setUnreadNotificationCount(0);
      hasLoadedNotificationsRef.current = false;
      knownAttentionNotificationIdsRef.current = new Set();
      return;
    }
    const isStaff = hasAnyRole(currentUser, [ROLES.EMPLOYEE, ROLES.MANAGEMENT, ROLES.ADMIN]);
    if (!isStaff) return;
    // Staff polling keeps dashboard badges fresh without forcing a full route reload.
    const interval = setInterval(() => {
      void loadStaffNotificationCounts();
    }, STAFF_COUNTS_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadStaffNotificationCounts, isAuthenticated, currentUser]);

  useEffect(() => {
    void refreshNotifications({ includeList: true });
    if (!isAuthenticated) return;
    const interval = setInterval(() => {
      void refreshNotifications({ includeList: false });
    }, NOTIFICATION_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshNotifications, isAuthenticated]);

  // Toggles the session-scoped mute flag used to suppress staff attention sounds on this browser tab.
  const toggleNotificationsMuted = useCallback(() => {
    setNotificationsMuted((prev) => {
      const next = !prev;
      sessionStorage.setItem('notificationsMuted', String(next));
      return next;
    });
  }, []);

  // Marks a single notification read optimistically, then re-syncs from the backend to avoid stale inbox state.
  const markNotificationRead = useCallback(async (notificationId) => {
    const now = new Date().toISOString();

    setInboxNotifications((prev) => prev.map((item) => (
      item.id === notificationId && !item.readAt
        ? { ...item, readAt: now }
        : item
    )));
    setUnreadNotificationCount((prev) => Math.max(0, prev - 1));
    knownAttentionNotificationIdsRef.current = new Set(
      [...knownAttentionNotificationIdsRef.current].filter((id) => id !== notificationId)
    );

    try {
      await notificationsApi.markNotificationRead(notificationId);
    } finally {
      await refreshNotifications({ includeList: true });
    }
  }, [refreshNotifications]);

  // Marks the full inbox read in one call and then refreshes counts so badges stay accurate.
  const markAllNotificationsRead = useCallback(async () => {
    await notificationsApi.markAllNotificationsRead();
    await refreshNotifications({ includeList: true });
  }, [refreshNotifications]);

  // Fetches full notification payloads when the dropdown is opened.
  const handleNotificationsPanelOpen = useCallback(async () => {
    await refreshNotifications({ includeList: true });
  }, [refreshNotifications]);

  // loadConfig() is now strictly governed by route and auth state (managed in the effect at the top of this file) to prevent guest-triggered 500 errors.

  // Centralized data loading for authenticated users is managed via the refreshStorefrontData effect above.
  // loadConfig() is now strictly governed by route and auth state to prevent guest-triggered 500 errors.

  // Loads orders for authenticated users only, clears signed-out state, and supports silent background refreshes.
  const loadOrders = useCallback(async (silent = false) => {
    if (!isAuthenticated) {
      setOrders([]);
      return;
    }

    try {
      if (!silent) setIsLoadingOrders(true);
      const ordersData = await ordersApi.getAllOrders();
      setOrders(ordersData);
    } catch (error) {
      console.error('Failed to load orders:', error);
      // Don't show error notification on initial load, just log it
      // Orders will remain empty array
    } finally {
      if (!silent) setIsLoadingOrders(false);
    }
  }, [isAuthenticated]);

  // Load orders on mount (after auth check, only if authenticated)
  useEffect(() => {
    if (!isLoading) {
      loadOrders();
    }
    
    if (!isAuthenticated || isLoading) return;
    
    // Background polling for orders keeps the UI (like pickup notices) fresh without full reloads.
    const interval = setInterval(() => loadOrders(true), ORDER_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isAuthenticated, isLoading, loadOrders]);

  // Notification system (message is normalized so we never show "[object Object]")
  // Shows one normalized toast-style notification with an optional action callback.
  const showNotification = useCallback((message, type = 'success', action = null) => {
    const safeMessage = toNotificationMessage(message, 'Something went wrong. Please try again.');
    setNotification({ message: safeMessage, type, action });
  }, []);

  useEffect(() => {
    // Converts backend availability events into a reloadable warning notification for the current route.
    const handleBackendUnavailable = (event) => {
      const message = event?.detail?.message
        || 'We are having trouble reaching the server. Please try again shortly.';
      showNotification(message, 'warning', {
        label: 'Reload',
        onClick: () => window.location.reload()
      });
    };

    window.addEventListener('backend:unavailable', handleBackendUnavailable);
    return () => {
      window.removeEventListener('backend:unavailable', handleBackendUnavailable);
    };
  }, [showNotification]);

  useEffect(() => {
    // Clears session-owned state on forced logout so expired tokens do not leave stale cart or order UI behind.
    const handleUnauthorized = () => {
      // Reset session-owned state before redirecting so stale cart/order UI does not survive an expired token.
      setCurrentUser(GUEST_USER);
      setIsAuthenticated(false);
      setCart([]);
      setReturnPath(null);
      navigate('/login');
      showNotification('Your session has expired. Please log in again.', 'warning');
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, [navigate, showNotification]);

  // Clears the active notification without changing any underlying app state.
  const closeNotification = () => {
    setNotification(null);
  };

  // Logs the user in, normalizes legacy single-role payloads, and routes by the current role mix.
  const login = async (username, password) => {
    try {
      const { user } = await authApi.login(username, password);
      
      // Ensure roles array exists so login responses work with current role-based navigation.
      if (!user.roles && user.role) {
        user.roles = [user.role];
      }
      
      setCurrentUser(user);
      setIsAuthenticated(true);
      newSession();

      // If there's a return path (e.g., guest tried to access orders), go there
      if (returnPath) {
        navigate(returnPath);
        setReturnPath(null);
      } else {
        // Otherwise, default navigation based on current role shape.
        const roles = user.roles || [];
        if (roles.includes(ROLES.DELIVERY_DRIVER) && !roles.includes(ROLES.MANAGEMENT) && !roles.includes(ROLES.ADMIN)) {
          navigate('/delivery-dashboard');
        } else if (roles.includes(ROLES.CUSTOMER) && !roles.some((role) => (
          role === ROLES.EMPLOYEE
          || role === ROLES.MANAGEMENT
          || role === ROLES.ADMIN
          || role === ROLES.DELIVERY_DRIVER
        ))) {
          navigate('/products');
        } else {
          navigate('/orders');
        }
      }
      
      showNotification('Login successful!', 'success');
      return true;
    } catch (error) {
      const errorMessage = error.message || 'Login failed. Please check your credentials.';
      showNotification(errorMessage, 'error');
      return false;
    }
  };

  // Registers a new account, surfaces the backend message, and leaves auth state unchanged until approval.
  const register = async (data) => {
    try {
      const response = await authApi.register(data);
      
      // Registration successful but user needs approval
      // Don't set authentication state, just return success
      const message = response.message || 'Registration successful! Please visit the store to get approved.';
      showNotification(message, 'success');
      return { success: true, message };
    } catch (error) {
      const errorMessage = error.message || 'Registration failed. Please try again.';
      showNotification(errorMessage, 'error');
      throw error;
    }
  };

  // Logs out locally even if the API call fails so the client never stays half-authenticated.
  const logout = async () => {
    try {
      await authApi.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setCurrentUser(GUEST_USER);
      setIsAuthenticated(false);
      setCart([]);
      setStaffNotificationCounts(null);
      setInboxNotifications([]);
      setUnreadNotificationCount(0);
      setReturnPath(null);
      navigate('/products');
      showNotification('You have been logged out', 'info');
    }
  };

  const isQuantityAllowed = (quantity, allowedQuantities) => {
    return allowedQuantities.some((allowed) => Math.abs(allowed - quantity) < 1e-9);
  };

  // Adds or increments a cart item keyed by variantId.
  // variant must include: { id, label, basePrice, pricingMode, quantityOptions, priceBreaks, stockEnabled, stock }
  const addToCart = (product, variant, quantity) => {
    setCart(prev => {
      const existing = prev.find(item => item.variantId === variant.id);
      const allowedQuantities = getAllowedQuantities(variant);

      let requestedQuantity = quantity;
      if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
        if (allowedQuantities.length > 0) {
          if (existing) {
            const currentIndex = allowedQuantities.findIndex((value) => Math.abs(value - existing.quantity) < 1e-9);
            requestedQuantity = currentIndex >= 0 && currentIndex < allowedQuantities.length - 1
              ? allowedQuantities[currentIndex + 1]
              : existing.quantity;
          } else {
            requestedQuantity = allowedQuantities[0];
          }
        } else {
          requestedQuantity = 1;
        }
      }

      const desiredQuantity = existing ? existing.quantity + requestedQuantity : requestedQuantity;
      const nextQuantity = allowedQuantities.length > 0
        ? (isQuantityAllowed(desiredQuantity, allowedQuantities)
          ? desiredQuantity
          : isQuantityAllowed(requestedQuantity, allowedQuantities)
            ? requestedQuantity
            : allowedQuantities[0])
        : desiredQuantity;

      const cartItem = {
        id: variant.id,
        variantId: variant.id,
        productId: product.id,
        variantLabel: variant.label,
        name: product.name,
        basePrice: Number(variant.basePrice),
        pricingMode: variant.pricingMode,
        quantityOptions: variant.quantityOptions ?? [],
        priceBreaks: variant.priceBreaks ?? [],
        stockEnabled: variant.stockEnabled,
        stock: Number(variant.stock),
        categoryId: product.categoryId,
        images: product.images ?? [],
      };

      if (existing) {
        return prev.map(item =>
          item.variantId === variant.id
            ? { ...item, quantity: nextQuantity }
            : item
        );
      }
      return [...prev, { ...cartItem, quantity: nextQuantity }];
    });

    showNotification(
      `${product.name} added to cart!`,
      'success',
      {
        label: 'View Cart',
        onClick: () => {
          navigate('/cart');
          closeNotification();
        }
      }
    );
  };

  // Removes one cart line item entirely by variantId.
  const removeFromCart = (variantId) => {
    setCart(prev => prev.filter(item => item.variantId !== variantId));
  };

  // Updates a cart line quantity and removes the item if the incoming quantity is empty, invalid, or <= 0.
  const updateCartQuantity = (variantId, quantity) => {
    const normalizedQuantity = typeof quantity === 'string' ? parseFloat(quantity) : quantity;
    if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) {
      removeFromCart(variantId);
      return;
    }
    setCart(prev => prev.map(item =>
      item.variantId === variantId ? { ...item, quantity: normalizedQuantity } : item
    ));
  };

  // Refreshes the signed-in user's credit balance and silently keeps the existing value on non-fatal errors.
  const refreshCreditBalance = useCallback(async (userId) => {
    try {
      const creditData = await creditApi.getUserCredit(userId);
      setCreditBalance(creditData.balance ?? 0);
    } catch {
      // Non-fatal
    }
  }, []);

  // Proxies delivery eligibility checks so checkout can reuse one app-level API contract.
  const checkDeliveryEligibility = useCallback(async (deliveryAddress) => {
    return ordersApi.checkDeliveryEligibility(deliveryAddress);
  }, []);

  // Creates an order, refreshes dependent state, and preserves delivery/profile/payment side effects by method.
  const checkout = async (cashAppUsername, deliveryMethod, paymentMethod, deliveryAddress, vehicleDescription) => {
    try {
      // Convert cart items to API format
      const items = cart.map(item => ({
        variantId: item.variantId,
        quantity: item.quantity
      }));

      // Create order via API
      const newOrder = await ordersApi.createOrder(items, cashAppUsername, deliveryMethod, paymentMethod, deliveryAddress, vehicleDescription);

      if (deliveryMethod === DeliveryMethod.DELIVERY) {
        try {
          const refreshedUser = await authApi.getProfile();
          if (!refreshedUser.roles && refreshedUser.role) {
            refreshedUser.roles = [refreshedUser.role];
          }
          setCurrentUser(refreshedUser);
          setIsAuthenticated(true);
        } catch (profileError) {
          console.warn('Failed to refresh profile after delivery order:', profileError);
          if (paymentMethod !== PaymentMethod.STORE_CREDIT) {
            const updatedUserData = { ...currentUser, cashapp: cashAppUsername };
            setCurrentUser(updatedUserData);
            localStorage.setItem('userData', JSON.stringify(updatedUserData));
          }
        }
      } else if (paymentMethod !== PaymentMethod.STORE_CREDIT) {
        // Persist the latest payment handle so checkout, profile, and later orders show the same value.
        const updatedUserData = { ...currentUser, cashapp: cashAppUsername };
        setCurrentUser(updatedUserData);
        localStorage.setItem('userData', JSON.stringify(updatedUserData));
      } else if (paymentMethod === PaymentMethod.STORE_CREDIT) {
        // Refresh credit balance after credit payment
        await refreshCreditBalance(currentUser.id);
      }
      // IN_STORE: no payment handle to save

      // Refresh orders list
      const ordersData = await ordersApi.getAllOrders();
      setOrders(ordersData);

      // Clear cart
      setCart([]);

      showNotification('Order placed successfully!', 'success');
      await Promise.all([refreshNotifications(), loadStaffNotificationCounts()]);

      // Return order for caller to handle navigation with additional data
      return newOrder;
    } catch (error) {
      const errorMessage = error.message || 'Failed to place order. Please try again.';
      showNotification(errorMessage, 'error');
      throw error;
    }
  };

  // Creates a product, reloads the catalog, and leaves error handling centralized in the notification flow.
  const addProduct = async (product) => {
    try {
      await productsApi.createProduct(product);
      
      // Refresh products list
      const productsData = await productsApi.getAllProducts();
      setProducts(productsData);
      
      showNotification('Product added successfully', 'success');
    } catch (error) {
      const errorMessage = error.message || 'Failed to add product. Please try again.';
      showNotification(errorMessage, 'error');
      throw error;
    }
  };

  // Updates a product, reloads the catalog, and keeps the latest server state as the source of truth.
  const updateProduct = async (id, updates) => {
    try {
      await productsApi.updateProduct(id, updates);
      
      // Refresh products list
      const productsData = await productsApi.getAllProducts();
      setProducts(productsData);
      
      showNotification('Product updated successfully', 'success');
    } catch (error) {
      const errorMessage = error.message || 'Failed to update product. Please try again.';
      showNotification(errorMessage, 'error');
      throw error;
    }
  };

  // Deletes a product and refreshes the catalog so stale product cards do not linger in the UI.
  const deleteProduct = async (id) => {
    try {
      await productsApi.deleteProduct(id);
      
      // Refresh products list
      const productsData = await productsApi.getAllProducts();
      setProducts(productsData);
      
      showNotification('Product deleted', 'info');
    } catch (error) {
      const errorMessage = error.message || 'Failed to delete product. Please try again.';
      showNotification(errorMessage, 'error');
      throw error;
    }
  };

  // Creates a category and reloads categories so forms and filters stay in sync immediately.
  const createCategory = async (data) => {
    try {
      await categoriesApi.createCategory(data);
      const categoriesData = await categoriesApi.getAllCategories();
      setCategories(categoriesData);
      showNotification('Category created successfully', 'success');
    } catch (error) {
      const errorMessage = error.message || 'Failed to create category. Please try again.';
      showNotification(errorMessage, 'error');
      throw error;
    }
  };

  // Updates a category and reloads category state so quantity rules and labels stay consistent.
  const updateCategory = async (id, updates) => {
    try {
      await categoriesApi.updateCategory(id, updates);
      const categoriesData = await categoriesApi.getAllCategories();
      setCategories(categoriesData);
      showNotification('Category updated successfully', 'success');
    } catch (error) {
      const errorMessage = error.message || 'Failed to update category. Please try again.';
      showNotification(errorMessage, 'error');
      throw error;
    }
  };

  // Deletes a category and refreshes local category state after the backend confirms removal.
  const deleteCategory = async (id) => {
    try {
      await categoriesApi.deleteCategory(id);
      const categoriesData = await categoriesApi.getAllCategories();
      setCategories(categoriesData);
      showNotification('Category deleted', 'info');
    } catch (error) {
      const errorMessage = error.message || 'Failed to delete category. Please try again.';
      showNotification(errorMessage, 'error');
      throw error;
    }
  };

  // Updates an order status and then refreshes orders plus staff notifications for dashboard accuracy.
  const updateOrderStatus = async (orderId, status) => {
    try {
      await ordersApi.updateOrderStatus(orderId, status);
      
      // Refresh orders list
      const ordersData = await ordersApi.getAllOrders();
      setOrders(ordersData);
      
      showNotification('Order status updated', 'success');
      await Promise.all([refreshNotifications(), loadStaffNotificationCounts()]);
    } catch (error) {
      const errorMessage = error.message || 'Failed to update order status. Please try again.';
      showNotification(errorMessage, 'error');
      throw error;
    }
  };

  // Notifies the staff of customer arrival for curbside pickup and refreshes orders.
  const notifyArrival = async (orderId, parkingSpot) => {
    try {
      const updatedOrder = await ordersApi.notifyArrival(orderId, parkingSpot);
      
      // Refresh orders list
      const ordersData = await ordersApi.getAllOrders();
      setOrders(ordersData);
      
      showNotification('Arrival notification sent successfully', 'success');
      return updatedOrder;
    } catch (error) {
      const errorMessage = error.message || 'Failed to send arrival notification. Please try again.';
      showNotification(errorMessage, 'error');
      throw error;
    }
  };

  // Restores the cart from a saved snapshot, which is used by external-payment cancel flows.
  const restoreCart = (items) => {
    setCart(items);
  };

  // Deletes an order and supports silent cleanup for cancel/retry flows that should not show extra toasts.
  const deleteOrder = async (orderId, { silent = false } = {}) => {
    try {
      await ordersApi.deleteOrder(orderId);

      // Refresh orders list
      const ordersData = await ordersApi.getAllOrders();
      setOrders(ordersData);

      if (!silent) showNotification('Order deleted', 'info');
    } catch (error) {
      const errorMessage = error.message || 'Failed to delete order. Please try again.';
      showNotification(errorMessage, 'error');
      throw error;
    }
  };

  // Queues a manual receipt print request and warns instead of failing hard when the printer is not configured.
  const printOrderReceipt = async (orderId) => {
    try {
      const result = await ordersApi.printOrderReceipt(orderId);
      showNotification(
        result.queued
          ? 'Receipt queued for printing.'
          : 'Printer is not configured yet, so no receipt was queued.',
        result.queued ? 'success' : 'warning'
      );
      return result;
    } catch (error) {
      const errorMessage = error.message || 'Failed to print receipt. Please try again.';
      showNotification(errorMessage, 'error');
      throw error;
    }
  };

  const addItemToOrder = async (orderId, variantId, quantity) => {
    try {
      await ordersApi.addItemToOrder(orderId, variantId, quantity);
      
      // Refresh orders list
      const ordersData = await ordersApi.getAllOrders();
      setOrders(ordersData);
      
      showNotification('Item added to order', 'success');
    } catch (error) {
      const errorMessage = error.message || 'Failed to add item to order. Please try again.';
      showNotification(errorMessage, 'error');
      throw error;
    }
  };

  // Voids an order item and still accepts older index-based callers by translating them back to persisted item ids.
  const voidOrderItem = async (orderId, itemIdOrIndex) => {
    try {
      // Resolve array indexes back to persisted item IDs while older order-editing code is still supported.
      let itemId = itemIdOrIndex;
      
      // If it's an index, find the actual item ID from the order
      if (typeof itemIdOrIndex === 'number' && itemIdOrIndex >= 0) {
        const order = orders.find(o => o.id === orderId);
        if (order && order.items && order.items[itemIdOrIndex]) {
          // Check if items have id field (from API) or use index
          const item = order.items[itemIdOrIndex];
          itemId = item.id || itemIdOrIndex;
        }
      }

      await ordersApi.voidOrderItem(orderId, itemId);
      
      // Refresh orders list
      const ordersData = await ordersApi.getAllOrders();
      setOrders(ordersData);
      
      showNotification('Item voided', 'info');
    } catch (error) {
      const errorMessage = error.message || 'Failed to void item. Please try again.';
      showNotification(errorMessage, 'error');
      throw error;
    }
  };

  // Deletes an order item and resolves legacy index-based callers to stable server item ids before the API call.
  const deleteOrderItem = async (orderId, itemIdOrIndex) => {
    try {
      // Resolve array indexes back to persisted item IDs while older order-editing code is still supported.
      let itemId = itemIdOrIndex;
      
      // If it's an index, find the actual item ID from the order
      if (typeof itemIdOrIndex === 'number' && itemIdOrIndex >= 0) {
        const order = orders.find(o => o.id === orderId);
        if (order && order.items && order.items[itemIdOrIndex]) {
          // Check if items have id field (from API) or use index
          const item = order.items[itemIdOrIndex];
          itemId = item.id || itemIdOrIndex;
        }
      }

      await ordersApi.deleteOrderItem(orderId, itemId);
      
      // Refresh orders list
      const ordersData = await ordersApi.getAllOrders();
      setOrders(ordersData);
      
      showNotification('Item removed from order', 'info');
    } catch (error) {
      const errorMessage = error.message || 'Failed to remove item from order. Please try again.';
      showNotification(errorMessage, 'error');
      throw error;
    }
  };

  // Restores one order snapshot in local state, which is used by optimistic order-editing flows.
  const restoreOrder = (orderState) => {
    setOrders(prev => prev.map(o => 
      o.id === orderState.id ? orderState : o
    ));
  };

  // Updates the signed-in user's profile, normalizes roles, and persists the result back to localStorage.
  const updateUserProfile = async (updates) => {
    try {
      const updatedUser = await usersApi.updateUser(currentUser.id, updates);
      
      // Ensure roles array exists before persisting the updated profile as the app-wide user source.
      if (!updatedUser.roles && updatedUser.role) {
        updatedUser.roles = [updatedUser.role];
      }
      
      setCurrentUser(updatedUser);
      // Persist to localStorage so checkout/profile/registration all read same source.
      localStorage.setItem('userData', JSON.stringify(updatedUser));
      showNotification('Profile updated successfully', 'success');
    } catch (error) {
      const errorMessage = error.message || 'Failed to update profile. Please try again.';
      showNotification(errorMessage, 'error');
      throw error;
    }
  };

  // Review management
  // Adds a client-side review entry with default counters and today's date for the current user.
  const addReview = (productId, review) => {
    setProducts(prev => prev.map(p => {
      if (p.id === productId) {
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
          replies: []
        };
        return { ...p, reviews: [...(p.reviews || []), newReview] };
      }
      return p;
    }));
    showNotification('Review posted successfully', 'success');
  };

  // Updates one local review in place for client-managed review editing flows.
  const updateReview = (productId, reviewId, updates) => {
    setProducts(prev => prev.map(p => {
      if (p.id === productId) {
        return {
          ...p,
          reviews: p.reviews.map(r => r.id === reviewId ? { ...r, ...updates } : r)
        };
      }
      return p;
    }));
    showNotification('Review updated', 'success');
  };

  // Removes one local review from the product review list.
  const deleteReview = (productId, reviewId) => {
    setProducts(prev => prev.map(p => {
      if (p.id === productId) {
        return { ...p, reviews: p.reviews.filter(r => r.id !== reviewId) };
      }
      return p;
    }));
    showNotification('Review deleted', 'info');
  };

  // Adds a review reply attributed to the current user and defaults the role to CUSTOMER when missing.
  const addReviewReply = (productId, reviewId, reply) => {
    setProducts(prev => prev.map(p => {
      if (p.id === productId) {
        return {
          ...p,
          reviews: p.reviews.map(r => {
            if (r.id === reviewId) {
              const newReply = {
                id: (r.replies?.length || 0) + 1,
                userId: currentUser.id,
                userName: currentUser.username,
                userRole: currentUser.roles?.[0] || ROLES.CUSTOMER,
                comment: reply,
                date: new Date().toISOString().split('T')[0]
              };
              return { ...r, replies: [...(r.replies || []), newReply] };
            }
            return r;
          })
        };
      }
      return p;
    }));
    showNotification('Reply added', 'success');
  };

  // Increments either the helpful or not-helpful counter for one local review vote action.
  const voteReview = (productId, reviewId, type) => {
    setProducts(prev => prev.map(p => {
      if (p.id === productId) {
        return {
          ...p,
          reviews: p.reviews.map(r => {
            if (r.id === reviewId) {
              if (type === 'helpful') {
                return { ...r, helpful: r.helpful + 1 };
              } else {
                return { ...r, notHelpful: r.notHelpful + 1 };
              }
            }
            return r;
          })
        };
      }
      return p;
    }));
  };

  // Flags a local review for moderation so the UI can reflect the pending moderation state immediately.
  const flagReview = (productId, reviewId) => {
    setProducts(prev => prev.map(p => {
      if (p.id === productId) {
        return {
          ...p,
          reviews: p.reviews.map(r => 
            r.id === reviewId ? { ...r, flagged: true } : r
          )
        };
      }
      return p;
    }));
    showNotification('Review flagged for moderation', 'info');
  };

  const value = {
    currentUser, 
    isAuthenticated,
    isLoading,
    isLoadingProducts,
    isLoadingOrders,
    isLoadingCategories,
    login,
    register,
    logout, 
    products, 
    loadProducts,
    categories,
    loadCategories,
    orders,
    setOrders,
    loadOrders,
    cart,
    setCart,
    addToCart, 
    removeFromCart, 
    updateCartQuantity, 
    checkout,
    addProduct, 
    updateProduct, 
    deleteProduct,
    createCategory,
    updateCategory,
    deleteCategory,
    updateOrderStatus, 
    notifyArrival,
    deleteOrder,
    printOrderReceipt,
    addItemToOrder,
    voidOrderItem,
    deleteOrderItem,
    restoreOrder,
    updateUserProfile,
    notification,
    showNotification,
    closeNotification,
    returnPath,
    setReturnPath,
    inboxNotifications,
    unreadNotificationCount,
    refreshNotifications,
    handleNotificationsPanelOpen,
    markNotificationRead,
    markAllNotificationsRead,
    notificationsMuted,
    toggleNotificationsMuted,
    staffNotificationCounts,
    loadStaffNotificationCounts,
    addReview,
    updateReview,
    deleteReview,
    addReviewReply,
    voteReview,
    flagReview,
    taxRate,
    minimumDeliveryOrder,
    minimumDeliveryOrderEnabled,
    deliveryDisabled,
    deliveryDisabledMessage,
    deliveryRadiusMiles,
    pickupLocation,
    featuredProductIds,
    promotions,
    storeCashappUsername,
    paymentSettings,
    storeSettings,
    loadConfig,
    branding,
    restoreCart,
    creditBalance,
    refreshCreditBalance,
    checkDeliveryEligibility,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}
