import { createSettingsApi } from './createSettingsApi';

const api = createSettingsApi('/branding');

export const getBranding = () => api.get();
export const updateBranding = (data) => api.update(data);

export const uploadFavicon = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return fetch('/api/upload/favicon', {
    method: 'POST',
    headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
    body: formData,
  }).then(r => r.json());
};
