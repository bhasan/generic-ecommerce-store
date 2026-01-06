import { post, get, setAuthToken, clearAuthToken } from './api';

/**
 * Login user
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<{user: object, token: string}>}
 */
export const login = async (email, password) => {
  try {
    const response = await post('/auth/login', { email, password });
    
    // Store token
    if (response.token) {
      setAuthToken(response.token);
    }
    
    // Store user data in localStorage for persistence
    if (response.user) {
      localStorage.setItem('userData', JSON.stringify(response.user));
    }
    
    return {
      user: response.user,
      token: response.token,
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Register new user
 * @param {object} data - Registration data {email, password, name, cashapp?, phoneNumber?}
 * @returns {Promise<{user: object, message: string}>}
 */
export const register = async (data) => {
  try {
    const response = await post('/auth/register', data);
    
    // New registrations don't get a token (require approval)
    // Only store token if provided (shouldn't happen for new registrations)
    if (response.token) {
      setAuthToken(response.token);
    }
    
    // Don't store user data for unapproved registrations
    // They need to wait for approval before logging in
    
    return {
      user: response.user,
      message: response.message,
      token: response.token // Will be undefined for new registrations
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Get current user profile
 * @returns {Promise<object>} User object
 */
export const getProfile = async () => {
  try {
    const response = await get('/auth/profile');
    
    // Update stored user data
    if (response) {
      localStorage.setItem('userData', JSON.stringify(response));
    }
    
    return response;
  } catch (error) {
    // If profile fetch fails, clear token
    if (error.status === 401) {
      clearAuthToken();
    }
    throw error;
  }
};

/**
 * Logout user
 * @returns {Promise<void>}
 */
export const logout = async () => {
  try {
    await post('/auth/logout');
  } catch (error) {
    // Even if API call fails, clear local storage
    console.error('Logout error:', error);
  } finally {
    // Always clear local storage
    clearAuthToken();
  }
};

