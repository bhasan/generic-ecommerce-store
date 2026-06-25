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
