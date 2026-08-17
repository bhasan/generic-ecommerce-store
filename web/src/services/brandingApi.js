import { createSettingsApi } from './createSettingsApi';
import { getAuthToken, get } from './api';

const api = createSettingsApi('/branding');

export const getBranding = () => api.get();
export const updateBranding = (data) => api.update(data);

// Public, unauthenticated: minimal brand identity (name/logo/favicon/colors) for
// theming the login/register page. The full /api/branding + /api/config are auth-gated.
export const getPublicBranding = () => get('/branding/public');

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
