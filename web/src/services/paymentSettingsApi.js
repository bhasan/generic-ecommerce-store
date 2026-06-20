import { createSettingsApi } from './createSettingsApi';

const api = createSettingsApi('/payment-settings');

export const getPaymentSettings = () => api.get();
export const updatePaymentSettings = (data) => api.update(data);
