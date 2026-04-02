import { get, put } from './api';

export const getStoreSettings = async () => {
  try {
    return await get('/store-settings');
  } catch (error) {
    throw error;
  }
};

export const updateStoreSettings = async (data) => {
  try {
    return await put('/store-settings', data);
  } catch (error) {
    throw error;
  }
};
