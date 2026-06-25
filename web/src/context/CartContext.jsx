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
    } catch (error) {
      console.error('Error parsing stored cart data:', error);
      return [];
    }
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
