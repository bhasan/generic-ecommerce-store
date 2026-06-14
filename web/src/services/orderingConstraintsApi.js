import { createSettingsApi } from './createSettingsApi';

const api = createSettingsApi('/ordering-constraints');

export const getOrderingConstraints = () => api.get();
export const updateOrderingConstraints = (data) => api.update(data);
