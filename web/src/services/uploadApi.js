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

  const json = await response.json();
  return json.data ?? json;
};

/**
 * Upload multiple files to the server
 * @param {File[]} files - The files to upload
 * @returns {Promise<{urls: string[]}>} Object with the URLs of the uploaded files
 */
export const uploadFiles = async (files) => {
  const token = getAuthToken();
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  const response = await fetch(`${API_BASE_URL}/upload/multiple`, {
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

  const json = await response.json();
  return json.data ?? json;
};

/**
 * Get a list of uploaded images
 * @returns {Promise<{images: Array<{url: string, filename: string, size: number, createdAt: string}>}>}
 */
export const getImages = async () => {
  const token = getAuthToken();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  const response = await fetch(`${API_BASE_URL}/upload`, {
    method: 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (!response.ok) {
    let errorMessage = 'Failed to fetch images';
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

  const json = await response.json();
  return json.data ?? json;
};

/**
 * Import images from a ZIP archive. Files are written with their original names,
 * bypassing the server's rename logic, so export→import round-trips are lossless.
 * @param {File} file - The ZIP file to import
 * @returns {Promise<{imported: number, skipped: number}>}
 */
export const importImagesZip = async (file) => {
  const token = getAuthToken();
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/upload/import-zip`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  if (!response.ok) {
    let errorMessage = 'Import failed';
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

  const json = await response.json();
  return json.data ?? json;
};

/**
 * Delete an uploaded image
 * @param {string} filename - The filename of the image to delete
 * @returns {Promise<{message: string}>}
 */
export const deleteImage = async (filename) => {
  const token = getAuthToken();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  const response = await fetch(`${API_BASE_URL}/upload/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (!response.ok) {
    let errorMessage = 'Failed to delete image';
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

  const json = await response.json();
  return json.data ?? json;
};
