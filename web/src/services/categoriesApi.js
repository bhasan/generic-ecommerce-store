import { get, post, put, del } from './api';

export const getAllCategories = async () => {
  try {
    return await get('/categories');
  } catch (error) {
    throw error;
  }
};

export const createCategory = async (data) => {
  try {
    const response = await post('/categories', data);
    return response.category || response;
  } catch (error) {
    throw error;
  }
};

export const updateCategory = async (id, data) => {
  try {
    const response = await put(`/categories/${id}`, data);
    return response.category || response;
  } catch (error) {
    throw error;
  }
};

export const deleteCategory = async (id) => {
  try {
    return await del(`/categories/${id}`);
  } catch (error) {
    throw error;
  }
};
