import { createSettingsApi } from './createSettingsApi';
import { getAuthToken } from './api';

const api = createSettingsApi('/branding');

export const getBranding = () => api.get();
export const updateBranding = (data) => api.update(data);

export const uploadFavicon = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const token = getAuthToken();
  return fetch('/api/upload/favicon', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
    credentials: 'include',
  }).then(r => r.json());
};
