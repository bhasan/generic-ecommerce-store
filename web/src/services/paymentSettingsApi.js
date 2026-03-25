import { get, put } from './api';

export const getPaymentSettings = async () => {
  try {
    return await get('/payment-settings');
  } catch (error) {
    throw error;
  }
};

export const updatePaymentSettings = async (data) => {
  try {
    return await put('/payment-settings', data);
  } catch (error) {
    throw error;
  }
};
