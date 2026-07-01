// web/src/context/CartContext.jsx
import React, { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import * as ordersApi from '../services/ordersApi';
import * as authApi from '../services/authApi';
import { PaymentMethod, DeliveryMethod } from '../constants/orderMethods';
import { getAllowedQuantities } from '../features/products/productsHelpers';
import { useUIContext } from './UIContext';
import { useAuthContext } from './AuthContext';
import { useOrdersContext } from './OrdersContext';
import { useNotificationsContext } from './NotificationsContext';
import { useStoreSelection } from './StoreSelectionContext';

const CartContext = createContext(null);
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const getStorageKey = (storeId) =>
  storeId != null ? `cartData_v2_store_${storeId}` : 'cartData_v2';

const loadCartFromStorage = (storeId) => {
  const key = getStorageKey(storeId);
  const stored = localStorage.getItem(key);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    // Legacy format: plain array (no savedAt) — treat as valid, not expired
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.items)) {
      // savedAt present: enforce 7-day TTL
      if (parsed.savedAt != null && Date.now() - parsed.savedAt > SEVEN_DAYS_MS) {
        localStorage.removeItem(key);
        return [];
      }
      // savedAt absent: treat as not expired (backward-compat)
      return parsed.items;
    }
    return [];
  } catch (e) {
    console.error('Error parsing stored cart data:', e);
    return [];
  }
};

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

  const { activeStoreId } = useStoreSelection();

  // Ref kept in sync on every render so the save effect always writes to the right key
  // even between the store-switch re-render and the cart state update re-render.
  const activeStoreIdRef = useRef(activeStoreId);
  activeStoreIdRef.current = activeStoreId;

  // Tracks the previous non-null activeStoreId to gate the re-init logic below.
  const prevNonNullStoreIdRef = useRef(activeStoreId != null ? activeStoreId : null);

  const [cart, setCart] = useState(() => loadCartFromStorage(activeStoreId));

  // Re-initialize cart when the user switches between two concrete stores (non-null → non-null).
  // We intentionally SKIP the null → storeId transition (initial auto-select for single-store
  // or first load) so the cart already loaded by useState from the fallback key is preserved and
  // saves correctly migrate to the new store key without wiping an in-progress cart.
  useEffect(() => {
    const prev = prevNonNullStoreIdRef.current;
    if (activeStoreId != null) {
      if (prev !== null && prev !== activeStoreId) {
        // Real store switch: reload cart from the new store's key
        setCart(loadCartFromStorage(activeStoreId));
      }
      prevNonNullStoreIdRef.current = activeStoreId;
    }
  }, [activeStoreId]);

  // Persist cart. Depends only on cart — activeStoreId is read via ref to avoid
  // a mid-switch write: ref is updated synchronously on render before any effect fires.
  useEffect(() => {
    const key = getStorageKey(activeStoreIdRef.current);
    if (cart.length === 0) { localStorage.removeItem(key); return; }
    localStorage.setItem(key, JSON.stringify({ items: cart, savedAt: Date.now() }));
  }, [cart]);

  // Clear cart on auth:unauthorized — write localStorage synchronously because
  // AuthContext's handler fires navigate() in the same event dispatch, which
  // unmounts this component before the cart→localStorage sync useEffect can run.
  useEffect(() => {
    const handleUnauthorized = () => {
      setCart([]);
      localStorage.removeItem(getStorageKey(activeStoreIdRef.current));
    };
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
