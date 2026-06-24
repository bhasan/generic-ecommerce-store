import { get } from './api';
import { createResourceApi } from './createResourceApi';

const api = createResourceApi('/products', 'product');

export const getAllProducts = api.getAll;
export const getProductById = api.getById;
export const createProduct = api.create;
export const updateProduct = api.update;
export const deleteProduct = api.remove;

export const searchProducts = (q, { limit = 50, offset = 0 } = {}) =>
  get(`/products/search?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`);

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
