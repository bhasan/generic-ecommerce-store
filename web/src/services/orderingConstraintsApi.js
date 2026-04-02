import { get, put } from './api';

export const getOrderingConstraints = async () => {
  try {
    return await get('/ordering-constraints');
  } catch (error) {
    throw error;
  }
};

export const updateOrderingConstraints = async (data) => {
  try {
    return await put('/ordering-constraints', data);
  } catch (error) {
    throw error;
  }
};
