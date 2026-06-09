import { get, put } from './api';

export const getBranding = () => get('/branding');

export const updateBranding = (data) => put('/branding', data);

export const uploadFavicon = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return fetch('/api/upload/favicon', {
    method: 'POST',
    headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
    body: formData,
  }).then(r => r.json());
};
