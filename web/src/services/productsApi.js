import { get, post, put, del } from './api';

/**
 * Get all products
 * @returns {Promise<Array>} Array of product objects
 */
export const getAllProducts = async () => {
  try {
    const response = await get('/products');
    return response;
  } catch (error) {
    throw error;
  }
};

/**
 * Get product by ID
 * @param {number} id - Product ID
 * @returns {Promise<object>} Product object
 */
export const getProductById = async (id) => {
  try {
    const response = await get(`/products/${id}`);
    return response;
  } catch (error) {
    throw error;
  }
};

/**
 * Create product
 * @param {object} data - Product data {name, categoryId, price, description?, image?, images?, stock?, stockEnabled?, hidden?}
 * @returns {Promise<object>} Created product object
 */
export const createProduct = async (data) => {
  try {
    const response = await post('/products', data);
    return response.product || response;
  } catch (error) {
    throw error;
  }
};

/**
 * Update product
 * @param {number} id - Product ID
 * @param {object} data - Update data (all fields optional)
 * @returns {Promise<object>} Updated product object
 */
export const updateProduct = async (id, data) => {
  try {
    const response = await put(`/products/${id}`, data);
    return response.product || response;
  } catch (error) {
    throw error;
  }
};

/**
 * Delete product
 * @param {number} id - Product ID
 * @returns {Promise<object>} Success message
 */
export const deleteProduct = async (id) => {
  try {
    const response = await del(`/products/${id}`);
    return response;
  } catch (error) {
    throw error;
  }
};

