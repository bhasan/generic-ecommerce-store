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

/**
 * Download all products + images as a ZIP archive.
 * Triggers a browser file download.
 */
export const downloadProductsZip = async () => {
  // apiClient returns the raw Response for non-JSON content types
  const response = await get('/products/export-zip', { retries: 0 });
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const today = new Date().toISOString().slice(0, 10);
  a.download = `products-export-${today}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

