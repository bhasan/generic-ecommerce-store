import { get, post, patch, del } from './api';

/**
 * Get all orders
 * @returns {Promise<Array>} Array of order objects
 */
export const getAllOrders = async () => {
  try {
    const response = await get('/orders');
    return response;
  } catch (error) {
    throw error;
  }
};

/**
 * Get ready-for-delivery orders
 * @returns {Promise<Array>} Array of ready-for-delivery order objects
 */
export const getReadyForDeliveryOrders = async () => {
  try {
    const response = await get('/orders/ready-for-delivery');
    return response;
  } catch (error) {
    throw error;
  }
};

/**
 * Get order by ID
 * @param {number} id - Order ID
 * @returns {Promise<object>} Order object
 */
export const getOrderById = async (id) => {
  try {
    const response = await get(`/orders/${id}`);
    return response;
  } catch (error) {
    throw error;
  }
};

/**
 * Create order (checkout)
 * @param {Array} items - Array of items [{ productId, quantity }]
 * @param {string} [cashAppUsername] - CashApp username for payment
 * @returns {Promise<object>} Created order object
 */
export const createOrder = async (items, cashAppUsername) => {
  try {
    const payload = { items };
    if (cashAppUsername) payload.cashAppUsername = cashAppUsername;
    const response = await post('/orders', payload);
    return response.order || response;
  } catch (error) {
    throw error;
  }
};

/**
 * Update order status
 * @param {number} id - Order ID
 * @param {string} status - New status
 * @returns {Promise<object>} Updated order object
 */
export const updateOrderStatus = async (id, status) => {
  try {
    const response = await patch(`/orders/${id}/status`, { status });
    return response.order || response;
  } catch (error) {
    throw error;
  }
};

/**
 * Add item to order
 * @param {number} orderId - Order ID
 * @param {number} productId - Product ID
 * @param {number} quantity - Quantity
 * @returns {Promise<object>} Order item object
 */
export const addItemToOrder = async (orderId, productId, quantity) => {
  try {
    const response = await post(`/orders/${orderId}/items`, { productId, quantity });
    return response.orderItem || response;
  } catch (error) {
    throw error;
  }
};

/**
 * Void order item
 * @param {number} orderId - Order ID
 * @param {number} itemId - Order item ID
 * @returns {Promise<object>} Voided order item object
 */
export const voidOrderItem = async (orderId, itemId) => {
  try {
    const response = await patch(`/orders/${orderId}/items/${itemId}/void`);
    return response.orderItem || response;
  } catch (error) {
    throw error;
  }
};

/**
 * Delete order item
 * @param {number} orderId - Order ID
 * @param {number} itemId - Order item ID
 * @returns {Promise<object>} Success message
 */
export const deleteOrderItem = async (orderId, itemId) => {
  try {
    const response = await del(`/orders/${orderId}/items/${itemId}`);
    return response;
  } catch (error) {
    throw error;
  }
};

/**
 * Delete order
 * @param {number} id - Order ID
 * @returns {Promise<object>} Success message
 */
export const deleteOrder = async (id) => {
  try {
    const response = await del(`/orders/${id}`);
    return response;
  } catch (error) {
    throw error;
  }
};

/**
 * Get delivered orders
 * @returns {Promise<Array>} Array of delivered order objects
 */
export const getDeliveredOrders = async () => {
  try {
    const response = await get('/orders/delivered');
    return response;
  } catch (error) {
    throw error;
  }
};

/**
 * Get out-for-delivery orders
 * @returns {Promise<Array>} Array of out-for-delivery order objects
 */
export const getOutForDeliveryOrders = async () => {
  try {
    const response = await get('/orders/out-for-delivery');
    return response;
  } catch (error) {
    throw error;
  }
};

