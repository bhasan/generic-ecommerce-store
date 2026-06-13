import { get, put } from './api';

export const getPaymentSettings = () => get('/payment-settings');
export const updatePaymentSettings = (data) => put('/payment-settings', data);
