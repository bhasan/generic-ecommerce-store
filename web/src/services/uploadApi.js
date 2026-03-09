import { getAuthToken } from './api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 15000);

/**
 * Upload a file to the server
 * @param {File} file - The file to upload
 * @returns {Promise<{url: string}>} Object with the URL of the uploaded file
 */
export const uploadFile = async (file) => {
  const token = getAuthToken();
  const formData = new FormData();
  formData.append('file', file);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  const response = await fetch(`${API_BASE_URL}/upload`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (!response.ok) {
    let errorMessage = 'Upload failed';
    try {
      const data = await response.json();
      errorMessage = data?.error?.message ?? errorMessage;
    } catch (_e) {
      errorMessage = response.statusText || errorMessage;
    }
    const error = new Error(errorMessage);
    error.status = response.status;
    throw error;
  }

  return response.json();
};
