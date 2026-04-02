import { get, post, put, del } from './api';

/**
 * Get all products
 * @returns {Promise<Array>} Array of product objects
 */
export const getAllProducts = async () => {
  return get('/products');
};

/**
 * Get product by ID
 * @param {number} id - Product ID
 * @returns {Promise<object>} Product object
 */
export const getProductById = async (id) => {
  return get(`/products/${id}`);
};

/**
 * Create product
 * @param {object} data - Product data {name, categoryId, price, description?, image?, images?, stock?, stockEnabled?, hidden?}
 * @returns {Promise<object>} Created product object
 */
export const createProduct = async (data) => {
  const response = await post('/products', data);
  return response.product || response;
};

/**
 * Update product
 * @param {number} id - Product ID
 * @param {object} data - Update data (all fields optional)
 * @returns {Promise<object>} Updated product object
 */
export const updateProduct = async (id, data) => {
  const response = await put(`/products/${id}`, data);
  return response.product || response;
};

/**
 * Delete product
 * @param {number} id - Product ID
 * @returns {Promise<object>} Success message
 */
export const deleteProduct = async (id) => {
  return del(`/products/${id}`);
};

