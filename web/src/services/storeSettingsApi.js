import { createSettingsApi } from './createSettingsApi';

const api = createSettingsApi('/store-settings');

export const getStoreSettings = () => api.get();
export const updateStoreSettings = (data) => api.update(data);
