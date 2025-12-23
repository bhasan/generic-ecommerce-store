/**
 * Base API client with token management and error handling
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

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
const handleError = async (response) => {
  if (!response.ok) {
    let errorMessage = 'An error occurred';
    let errorData = null;

    try {
      errorData = await response.json();
      errorMessage = errorData.error || errorData.message || errorMessage;
    } catch (e) {
      // If response is not JSON, use status text
      errorMessage = response.statusText || errorMessage;
    }

    const error = new Error(errorMessage);
    error.status = response.status;
    error.data = errorData;

    // Handle 401 Unauthorized - clear token and redirect to login
    if (response.status === 401) {
      clearAuthToken();
      // Redirect to login if not already there
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    throw error;
  }

  return response;
};

/**
 * Base API client function
 */
const apiClient = async (url, options = {}) => {
  const token = getAuthToken();
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Add auth token if available
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers,
  };

  try {
    const response = await fetch(`${API_BASE_URL}${url}`, config);
    const processedResponse = await handleError(response);
    
    // Handle empty responses
    const contentType = processedResponse.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await processedResponse.json();
    }
    
    return processedResponse;
  } catch (error) {
    // Network errors or other fetch errors
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Network error. Please check your connection.');
    }
    throw error;
  }
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

