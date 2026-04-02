/**
 * Base API client with token management and error handling
 */

import { toNotificationMessage } from '../utils/notificationMessage';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 15000);
const API_RETRY_MAX = Number(import.meta.env.VITE_API_RETRY_MAX || 2);
const API_RETRY_BASE_DELAY_MS = Number(import.meta.env.VITE_API_RETRY_BASE_DELAY_MS || 300);
const BACKEND_ERROR_COOLDOWN_MS = Number(import.meta.env.VITE_BACKEND_ERROR_COOLDOWN_MS || 30000);

let lastBackendErrorAt = 0;

const debugClient = (event, context = {}) => {
  // Dev-only trace surface for Codex/debugging sessions. Do not promote this to
  // user-visible behavior or rely on it in production logic.
  if (!import.meta.env.DEV) return;
  console.debug(`[api] ${event}`, context);
};

const shouldNotifyBackendError = () => {
  const now = Date.now();
  if (now - lastBackendErrorAt < BACKEND_ERROR_COOLDOWN_MS) {
    return false;
  }
  lastBackendErrorAt = now;
  return true;
};

const notifyBackendUnavailable = (message) => {
  if (!shouldNotifyBackendError()) return;
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent('backend:unavailable', {
      detail: {
        message: message || 'We are having trouble reaching the server. Please try again shortly.'
      }
    })
  );
};

/**
 * Get stored auth token from localStorage
 */
const getAuthToken = () => {
  return localStorage.getItem('authToken');
};

/**
 * Store auth token in localStorage
 */
const setAuthToken = (token) => {
  if (token) {
    localStorage.setItem('authToken', token);
  } else {
    localStorage.removeItem('authToken');
  }
};

/**
 * Clear auth token from localStorage
 */
const clearAuthToken = () => {
  localStorage.removeItem('authToken');
  localStorage.removeItem('userData');
};

/**
 * Handle API errors
 */
const handleError = async (response, requestOptions = {}) => {
  if (!response.ok) {
    let errorMessage = 'An error occurred';
    let errorData = null;

    try {
      errorData = await response.json();
      const raw = errorData?.error?.message
        ?? (typeof errorData?.error === 'string' ? errorData.error : null)
        ?? errorData?.message ?? errorData?.errors;
      errorMessage = toNotificationMessage(raw, response.statusText || 'An error occurred');
    } catch {
      // If response is not JSON, use status text
      errorMessage = response.statusText || 'An error occurred';
    }

    const error = new Error(toNotificationMessage(errorMessage, 'An error occurred'));
    error.status = response.status;
    error.data = errorData;
    error.code = errorData?.error?.code;
    // requestId/responseUrl preservation is intentional so frontend failures can
    // be matched back to backend logs without reproducing the request manually.
    error.requestId = errorData?.error?.requestId;
    error.responseUrl = response.url;

    // Handle 401 Unauthorized - clear token and notify app to redirect
    // skipAutoLogout allows callers to handle auth errors themselves (e.g. password change form)
    if (response.status === 401 && !requestOptions.skipAutoLogout) {
      clearAuthToken();
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }

    throw error;
  }

  return response;
};

/**
 * Base API client function
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableStatus = (status) => status === 429 || (status >= 500 && status <= 599);

const apiClient = async (url, options = {}) => {
  const token = getAuthToken();
  const { retries, skipAutoLogout, ...requestOptions } = options;
  
  const headers = {
    'Content-Type': 'application/json',
    ...requestOptions.headers,
  };

  // Add auth token if available
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...requestOptions,
    headers,
  };

  let lastError;
  const maxRetries = retries ?? API_RETRY_MAX;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
      debugClient('request:start', {
        url,
        method: config.method || 'GET',
        attempt: attempt + 1,
        hasToken: Boolean(token),
      });
      const response = await fetch(`${API_BASE_URL}${url}`, {
        ...config,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      debugClient('request:response', {
        url,
        method: config.method || 'GET',
        attempt: attempt + 1,
        status: response.status,
        requestId: response.headers.get('x-request-id') || undefined,
      });

      const processedResponse = await handleError(response, { skipAutoLogout });
      
      // Handle empty responses
      const contentType = processedResponse.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await processedResponse.json();
      }
      
      return processedResponse;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;

      const isAbortError = error?.name === 'AbortError';
      const isNetworkError = error?.name === 'TypeError' && `${error?.message}`.includes('fetch');
      const retryableStatus = error?.status && isRetryableStatus(error.status);
      const shouldRetry = attempt < maxRetries && (isAbortError || isNetworkError || retryableStatus);
      debugClient('request:error', {
        url,
        method: config.method || 'GET',
        attempt: attempt + 1,
        shouldRetry,
        requestId: error?.requestId,
        code: error?.code,
        status: error?.status,
        message: error?.message,
      });

      if (!shouldRetry) {
        if (retryableStatus || isNetworkError || isAbortError) {
          const message = retryableStatus
            ? 'Our servers are having trouble right now. Please try again shortly.'
            : 'We are having trouble reaching the server. Please check your connection and try again.';
          notifyBackendUnavailable(message);
        }
        if (isNetworkError) {
          const networkError = new Error('Network error. Please check your connection.');
          networkError.code = 'NETWORK_ERROR';
          // Preserve requestId when available so callers/tests can keep a single
          // correlation story even after transport-level normalization happens.
          networkError.requestId = error?.requestId;
          throw networkError;
        }
        if (isAbortError) {
          const timeoutError = new Error('Request timed out. Please try again.');
          timeoutError.code = 'REQUEST_TIMEOUT';
          timeoutError.requestId = error?.requestId;
          throw timeoutError;
        }
        throw error;
      }

      const backoff = API_RETRY_BASE_DELAY_MS * (2 ** attempt);
      const jitter = Math.floor(Math.random() * 100);
      await sleep(backoff + jitter);
    }
  }

  throw lastError;
};

/**
 * GET request
 */
export const get = (url, options = {}) => {
  return apiClient(url, {
    ...options,
    method: 'GET',
  });
};

/**
 * POST request
 */
export const post = (url, data, options = {}) => {
  return apiClient(url, {
    ...options,
    method: 'POST',
    body: JSON.stringify(data),
  });
};

/**
 * PUT request
 */
export const put = (url, data, options = {}) => {
  return apiClient(url, {
    ...options,
    method: 'PUT',
    body: JSON.stringify(data),
  });
};

/**
 * PATCH request
 */
export const patch = (url, data, options = {}) => {
  return apiClient(url, {
    ...options,
    method: 'PATCH',
    body: JSON.stringify(data),
  });
};

/**
 * DELETE request
 */
export const del = (url, options = {}) => {
  return apiClient(url, {
    ...options,
    method: 'DELETE',
  });
};

// Export token management functions
export { getAuthToken, setAuthToken, clearAuthToken };

