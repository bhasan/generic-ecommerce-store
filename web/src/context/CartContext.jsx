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

const getStorageKey = (isMultiStore, storeId) =>
  isMultiStore && storeId != null ? `cartData_v2_store_${storeId}` : 'cartData_v2';

const loadCartFromStorage = (isMultiStore, storeId) => {
  const key = getStorageKey(isMultiStore, storeId);
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

  const { activeStoreId, isMultiStore } = useStoreSelection();

  // Refs kept in sync on every render so effects always read the current values
  // even between the store-switch re-render and the cart state update re-render.
  const activeStoreIdRef = useRef(activeStoreId);
  activeStoreIdRef.current = activeStoreId;

  const isMultiStoreRef = useRef(isMultiStore);
  isMultiStoreRef.current = isMultiStore;

  // Tracks the previous non-null activeStoreId to gate the re-init logic below.
  const prevNonNullStoreIdRef = useRef(activeStoreId != null ? activeStoreId : null);

  const [cart, setCart] = useState(() => loadCartFromStorage(isMultiStore, activeStoreId));

  // Re-initialize cart on store changes:
  // - Real store-to-store switch (A → B, both non-null): always reload from new store's key.
  // - null → N (initial async resolve for single-store or restored multi-store):
  //     • Per-store key EXISTS in localStorage → load it (7-day TTL check applies inside
  //       loadCartFromStorage). Respects a deliberately-emptied cart — an absent key means
  //       the user cleared it and the save effect already removed it.
  //     • Per-store key ABSENT → keep in-memory cart (one-time migration of legacy cartData_v2);
  //       remove the legacy key and force a re-save so the cart lands under the per-store key.
  useEffect(() => {
    // Single-store tenants: key is always cartData_v2, nothing to reload or migrate.
    if (!isMultiStore) return;

    const prev = prevNonNullStoreIdRef.current;
    if (activeStoreId != null) {
      if (prev !== null && prev !== activeStoreId) {
        // Real store switch: reload cart from the new store's key
        setCart(loadCartFromStorage(isMultiStore, activeStoreId));
      } else if (prev === null) {
        // null → N: key-existence decides, not item count
        const perStoreKey = getStorageKey(isMultiStore, activeStoreId);
        if (localStorage.getItem(perStoreKey) !== null) {
          // Key exists: load it; loadCartFromStorage handles the 7-day TTL and key removal
          setCart(loadCartFromStorage(isMultiStore, activeStoreId));
        } else {
          // Key absent: migration — keep in-memory cart, remove legacy key.
          // Force a re-save only when items exist to migrate; skipping the setCart for
          // empty carts avoids a spurious save-effect that could remove a concurrently
          // written per-store key from a sibling CartProvider (e.g. nested providers).
          localStorage.removeItem('cartData_v2');
          if (cart.length > 0) {
            setCart(c => [...c]);
          }
        }
      }
      prevNonNullStoreIdRef.current = activeStoreId;
    }
  }, [activeStoreId, isMultiStore]);

  // Persist cart. Depends only on cart — isMultiStore and activeStoreId are read via refs
  // to avoid a mid-switch write: refs are updated synchronously on render before effects fire.
  // Format: multi-store uses { items, savedAt } (7-day TTL); single-store uses plain array
  // (backward-compat with the original cartData_v2 format, preserves E2E contract).
  useEffect(() => {
    const isMultiS = isMultiStoreRef.current;
    const key = getStorageKey(isMultiS, activeStoreIdRef.current);
    if (cart.length === 0) { localStorage.removeItem(key); return; }
    const payload = isMultiS
      ? JSON.stringify({ items: cart, savedAt: Date.now() })
      : JSON.stringify(cart);
    localStorage.setItem(key, payload);
  }, [cart]);

  // Clear cart on auth:unauthorized — write localStorage synchronously because
  // AuthContext's handler fires navigate() in the same event dispatch, which
  // unmounts this component before the cart→localStorage sync useEffect can run.
  useEffect(() => {
    const handleUnauthorized = () => {
      setCart([]);
      // Remove EVERY cart key for this browser — not just the active store's —
      // so sibling per-store carts (cartData_v2_store_<other>) can't leak to the
      // next user on a shared/kiosk browser. Collect matching keys first, then
      // delete, to avoid index shifting while iterating localStorage. Runs
      // synchronously so the keys are gone before the navigate() unmounts us.
      const staleKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key === 'cartData_v2' || (key && key.startsWith('cartData_v2_store_'))) {
          staleKeys.push(key);
        }
      }
      staleKeys.forEach((key) => localStorage.removeItem(key));
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
