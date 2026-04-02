import React, { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import * as authApi from '../services/authApi';
import * as usersApi from '../services/usersApi';
import * as productsApi from '../services/productsApi';
import * as ordersApi from '../services/ordersApi';
import * as categoriesApi from '../services/categoriesApi';
import * as notificationsApi from '../services/notificationsApi';
import * as configApi from '../services/configApi';
import * as creditApi from '../services/creditApi';
import { getAuthToken } from '../services/api';
import { toNotificationMessage } from '../utils/notificationMessage';
import { hasAnyRole, GUEST_USER, ROLES } from '../utils/roles';

// Context for authentication and global state
const AppContext = createContext();

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};

export function AppProvider({ children }) {
  // Initialize user from localStorage or default guest
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

  const [currentUser, setCurrentUser] = useState(getInitialUser);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [categories, setCategories] = useState([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [cart, setCart] = useState([]);
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
  const [pickupLocation, setPickupLocation] = useState('');
  const [storeCashappUsername, setStoreCashappUsername] = useState('');
  const [paymentSettings, setPaymentSettings] = useState({
    cashapp: { enabled: true, handle: '' },
    zelle: { enabled: false, handle: '' },
    venmo: { enabled: false, handle: '' },
  });
  const [storeSettings, setStoreSettings] = useState({ name: '', address: '', phoneNumber: '' });
  const [creditBalance, setCreditBalance] = useState(0);
  const hasInteractedRef = useRef(false);
  const hasLoadedNotificationsRef = useRef(false);
  const knownAttentionNotificationIdsRef = useRef(new Set());
  const navigate = useNavigate();
  const location = useLocation();

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
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
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  // Load products function (can be called manually)
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

  // Load products on mount (after auth check)
  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Load categories on mount
  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
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

  const refreshNotifications = useCallback(async () => {
    if (!isAuthenticated) {
      setInboxNotifications([]);
      setUnreadNotificationCount(0);
      hasLoadedNotificationsRef.current = false;
      knownAttentionNotificationIdsRef.current = new Set();
      return { notifications: [], unreadCount: 0 };
    }

    const [notifications, unread] = await Promise.all([
      loadNotifications(),
      loadUnreadNotificationCount(),
    ]);

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

  const loadStaffNotificationCounts = useCallback(async () => {
    if (!isAuthenticated) return;
    const isStaff = hasAnyRole(currentUser, [ROLES.EMPLOYEE, ROLES.MANAGEMENT, ROLES.ADMIN]);
    if (!isStaff) return;
    try {
      const data = await notificationsApi.getStaffNotificationCounts();
      setStaffNotificationCounts(data);
    } catch {
      // Silently fail - don't show error for notification counts
    }
  }, [isAuthenticated, currentUser]);

  useEffect(() => {
    loadStaffNotificationCounts();
    if (!isAuthenticated) return;
    const isStaff = hasAnyRole(currentUser, [ROLES.EMPLOYEE, ROLES.MANAGEMENT, ROLES.ADMIN]);
    if (!isStaff) return;
    // Staff polling keeps dashboard badges fresh without forcing a full route reload.
    const interval = setInterval(loadStaffNotificationCounts, 50000);
    return () => clearInterval(interval);
  }, [loadStaffNotificationCounts, isAuthenticated, currentUser]);

  useEffect(() => {
    refreshNotifications();
    if (!isAuthenticated) return;
    const interval = setInterval(refreshNotifications, 50000);
    return () => clearInterval(interval);
  }, [refreshNotifications, isAuthenticated]);

  const toggleNotificationsMuted = useCallback(() => {
    setNotificationsMuted((prev) => {
      const next = !prev;
      sessionStorage.setItem('notificationsMuted', String(next));
      return next;
    });
  }, []);

  const markNotificationRead = useCallback(async (notificationId) => {
    await notificationsApi.markNotificationRead(notificationId);
    await refreshNotifications();
  }, [refreshNotifications]);

  const markAllNotificationsRead = useCallback(async () => {
    await notificationsApi.markAllNotificationsRead();
    await refreshNotifications();
  }, [refreshNotifications]);

  const loadConfig = useCallback(async () => {
    try {
      const config = await configApi.getConfig();
      if (config) {
        // Central config hydration keeps checkout, store info, and admin settings reading one shared source.
        if (typeof config.taxRate === 'number') setTaxRate(config.taxRate);
        if (typeof config.minimumDeliveryOrder === 'number') setMinimumDeliveryOrder(config.minimumDeliveryOrder);
        if (typeof config.minimumDeliveryOrderEnabled === 'boolean') setMinimumDeliveryOrderEnabled(config.minimumDeliveryOrderEnabled);
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
      }
    } catch (e) {
      console.warn('Failed to load remote config, using default tax rate.', e);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Load orders function (can be called manually)
  const loadOrders = useCallback(async () => {
    if (!isAuthenticated) {
      setOrders([]);
      return;
    }

    try {
      setIsLoadingOrders(true);
      const ordersData = await ordersApi.getAllOrders();
      setOrders(ordersData);
    } catch (error) {
      console.error('Failed to load orders:', error);
      // Don't show error notification on initial load, just log it
      // Orders will remain empty array
    } finally {
      setIsLoadingOrders(false);
    }
  }, [isAuthenticated]);

  // Load orders on mount (after auth check, only if authenticated)
  useEffect(() => {
    if (!isLoading) {
      loadOrders();
    }
  }, [isAuthenticated, isLoading]);

  // Notification system (message is normalized so we never show "[object Object]")
  const showNotification = useCallback((message, type = 'success', action = null) => {
    const safeMessage = toNotificationMessage(message, 'Something went wrong. Please try again.');
    setNotification({ message: safeMessage, type, action });
  }, []);

  useEffect(() => {
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

  const closeNotification = () => {
    setNotification(null);
  };

  const login = async (username, password) => {
    try {
      const { user } = await authApi.login(username, password);
      
      // Ensure roles array exists so login responses work with current role-based navigation.
      if (!user.roles && user.role) {
        user.roles = [user.role];
      }
      
      setCurrentUser(user);
      setIsAuthenticated(true);
      
      // If there's a return path (e.g., guest tried to access orders), go there
      if (returnPath) {
        navigate(returnPath);
        setReturnPath(null);
      } else {
        // Otherwise, default navigation based on primary role
        const primaryRole = user.roles?.[0] || ROLES.CUSTOMER;
        navigate(primaryRole === ROLES.CUSTOMER ? '/products' : '/orders');
      }
      
      showNotification('Login successful!', 'success');
      return true;
    } catch (error) {
      const errorMessage = error.message || 'Login failed. Please check your credentials.';
      showNotification(errorMessage, 'error');
      return false;
    }
  };

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

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setCurrentUser(GUEST_USER);
      setIsAuthenticated(false);
      setCart([]);
      setInboxNotifications([]);
      setUnreadNotificationCount(0);
      setReturnPath(null);
      navigate('/products');
      showNotification('You have been logged out', 'info');
    }
  };

  const resolveAllowedQuantities = (product) => {
    // Product-level overrides win so category defaults do not mask product-specific selling rules.
    if (product.allowedQuantitiesOverride && product.allowedQuantitiesOverride.length > 0) {
      return product.allowedQuantitiesOverride;
    }
    return product.category?.allowedQuantities || [];
  };

  const isQuantityAllowed = (quantity, allowedQuantities) => {
    return allowedQuantities.some((allowed) => Math.abs(allowed - quantity) < 1e-9);
  };

  const addToCart = (product, quantity) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      const allowedQuantities = resolveAllowedQuantities(product);

      // Normalize empty or invalid quantity picks into the closest allowed step for this product.
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

      if (existing) {
        return prev.map(item =>
          item.id === product.id
            ? { ...item, quantity: nextQuantity }
            : item
        );
      }
      return [...prev, { ...product, quantity: nextQuantity }];
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

  const removeFromCart = (productId) => {
    setCart(prev => prev.filter(item => item.id !== productId));
  };

  const updateCartQuantity = (productId, quantity) => {
    const normalizedQuantity = typeof quantity === 'string' ? parseFloat(quantity) : quantity;
    if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart(prev => prev.map(item => 
      item.id === productId ? { ...item, quantity: normalizedQuantity } : item
    ));
  };

  const refreshCreditBalance = useCallback(async (userId) => {
    try {
      const creditData = await creditApi.getUserCredit(userId);
      setCreditBalance(creditData.balance ?? 0);
    } catch {
      // Non-fatal
    }
  }, []);

  const checkout = async (cashAppUsername, deliveryMethod, paymentMethod) => {
    try {
      // Convert cart items to API format
      const items = cart.map(item => ({
        productId: item.id,
        quantity: item.quantity
      }));

      // Create order via API
      const newOrder = await ordersApi.createOrder(items, cashAppUsername, deliveryMethod, paymentMethod);

      if (paymentMethod !== 'CREDIT') {
        // Persist the latest payment handle so checkout, profile, and later orders show the same value.
        const updatedUserData = { ...currentUser, cashapp: cashAppUsername };
        setCurrentUser(updatedUserData);
        localStorage.setItem('userData', JSON.stringify(updatedUserData));
      } else {
        // Refresh credit balance after credit payment
        await refreshCreditBalance(currentUser.id);
      }

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

  const restoreCart = (items) => {
    setCart(items);
  };

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

  const addItemToOrder = async (orderId, productIdOrItem, quantity) => {
    try {
      // Accept both legacy and current call shapes so older order-editing UI still reaches the same API.
      let productId, itemQuantity;
      if (typeof productIdOrItem === 'object' && productIdOrItem.productId) {
        // Old format: addItemToOrder(orderId, { productId, quantity, price })
        productId = productIdOrItem.productId;
        itemQuantity = productIdOrItem.quantity;
      } else {
        // New format: addItemToOrder(orderId, productId, quantity)
        productId = productIdOrItem;
        itemQuantity = quantity;
      }

      await ordersApi.addItemToOrder(orderId, productId, itemQuantity);
      
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

  const restoreOrder = (orderState) => {
    setOrders(prev => prev.map(o => 
      o.id === orderState.id ? orderState : o
    ));
  };

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

  const deleteReview = (productId, reviewId) => {
    setProducts(prev => prev.map(p => {
      if (p.id === productId) {
        return { ...p, reviews: p.reviews.filter(r => r.id !== reviewId) };
      }
      return p;
    }));
    showNotification('Review deleted', 'info');
  };

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
    deleteOrder,
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
    pickupLocation,
    storeCashappUsername,
    paymentSettings,
    storeSettings,
    loadConfig,
    restoreCart,
    creditBalance,
    refreshCreditBalance,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}
