import { get, post, patch, del } from './api';

/**
 * Get all orders
 * @returns {Promise<Array>} Array of order objects
 */
export const getAllOrders = async () => {
  return get('/orders');
};

/**
 * Get ready-for-delivery orders
 * @returns {Promise<Array>} Array of ready-for-delivery order objects
 */
export const getReadyForDeliveryOrders = async () => {
  return get('/orders/ready-for-delivery');
};

/**
 * Get order by ID
 * @param {number} id - Order ID
 * @returns {Promise<object>} Order object
 */
export const getOrderById = async (id) => {
  return get(`/orders/${id}`);
};

/**
 * Create order (checkout)
 * @param {Array} items - Array of items [{ productId, quantity }]
 * @param {string} [cashAppUsername] - CashApp username for payment
 * @param {string} [deliveryMethod] - 'DELIVERY' or 'PICKUP'
 * @param {string} [paymentMethod] - payment method selected at checkout
 * @param {object} [deliveryAddress] - structured delivery address for delivery orders
 * @returns {Promise<object>} Created order object
 */
export const createOrder = async (items, cashAppUsername, deliveryMethod, paymentMethod, deliveryAddress) => {
  const payload = { items };
  if (cashAppUsername) payload.cashAppUsername = cashAppUsername;
  if (deliveryMethod) payload.deliveryMethod = deliveryMethod;
  if (paymentMethod) payload.paymentMethod = paymentMethod;
  if (deliveryMethod === 'DELIVERY' && deliveryAddress) {
    payload.deliveryAddress = deliveryAddress;
  }
  const response = await post('/orders', payload);
  return response.order || response;
};

/**
 * Check live delivery eligibility for a structured address
 * @param {object} deliveryAddress
 * @returns {Promise<object>}
 */
export const checkDeliveryEligibility = async (deliveryAddress) => {
  return post('/orders/delivery-eligibility', { deliveryAddress });
};

/**
 * Update order status
 * @param {number} id - Order ID
 * @param {string} status - New status
 * @returns {Promise<object>} Updated order object
 */
export const updateOrderStatus = async (id, status) => {
  const response = await patch(`/orders/${id}/status`, { status });
  return response.order || response;
};

/**
 * Add item to order
 * @param {number} orderId - Order ID
 * @param {number} productId - Product ID
 * @param {number} quantity - Quantity
 * @returns {Promise<object>} Order item object
 */
export const addItemToOrder = async (orderId, productId, quantity) => {
  const response = await post(`/orders/${orderId}/items`, { productId, quantity });
  return response.orderItem || response;
};

/**
 * Void order item
 * @param {number} orderId - Order ID
 * @param {number} itemId - Order item ID
 * @returns {Promise<object>} Voided order item object
 */
export const voidOrderItem = async (orderId, itemId) => {
  const response = await patch(`/orders/${orderId}/items/${itemId}/void`);
  return response.orderItem || response;
};

/**
 * Delete order item
 * @param {number} orderId - Order ID
 * @param {number} itemId - Order item ID
 * @returns {Promise<object>} Success message
 */
export const deleteOrderItem = async (orderId, itemId) => {
  return del(`/orders/${orderId}/items/${itemId}`);
};

/**
 * Delete order
 * @param {number} id - Order ID
 * @returns {Promise<object>} Success message
 */
export const deleteOrder = async (id) => {
  return del(`/orders/${id}`);
};

/**
 * Get delivered orders
 * @returns {Promise<Array>} Array of delivered order objects
 */
export const getDeliveredOrders = async () => {
  return get('/orders/delivered');
};

/**
 * Get out-for-delivery orders
 * @returns {Promise<Array>} Array of out-for-delivery order objects
 */
export const getOutForDeliveryOrders = async () => {
  return get('/orders/out-for-delivery');
};
