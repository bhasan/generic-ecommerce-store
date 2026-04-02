import { get, post, put, del } from './api';

export const getAllCategories = async () => {
  return get('/categories');
};

export const createCategory = async (data) => {
  const response = await post('/categories', data);
  return response.category || response;
};

export const updateCategory = async (id, data) => {
  const response = await put(`/categories/${id}`, data);
  return response.category || response;
};

export const deleteCategory = async (id) => {
  return del(`/categories/${id}`);
};
