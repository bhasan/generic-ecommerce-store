import { post, get, setAuthToken, clearAuthToken } from './api';

/**
 * Login user
 * @param {string} username - Username
 * @param {string} password - User password
 * @returns {Promise<{user: object, token: string}>}
 */
export const login = async (username, password) => {
  const response = await post('/auth/login', { username, password });

  // The refresh token is delivered as an httpOnly cookie by the backend; only
  // the access token comes back in the body, and it stays in memory.
  if (response.token) {
    setAuthToken(response.token);
  }

  if (response.user) {
    localStorage.setItem('userData', JSON.stringify(response.user));
  }

  return {
    user: response.user,
    token: response.token,
  };
};

/**
 * Register new user
 * @param {object} data - Registration data {username, password, cashapp?, phoneNumber?}
 * @returns {Promise<{user: object, message: string}>}
 */
export const register = async (data) => {
  const response = await post('/auth/register', data);

  if (response.token) {
    setAuthToken(response.token);
  }

  return {
    user: response.user,
    message: response.message,
    token: response.token
  };
};

/**
 * Exchange the httpOnly refresh cookie for a new access token. The cookie is
 * sent automatically (credentials: 'include'); no token argument is needed.
 * @returns {Promise<{token: string}>}
 */
export const refresh = async () => {
  const response = await post('/auth/refresh', {}, { skipAutoLogout: true });

  if (response.token) {
    setAuthToken(response.token);
  }

  return { token: response.token };
};

/**
 * Get current user profile
 * @returns {Promise<object>} User object
 */
export const getProfile = async () => {
  const response = await get('/auth/profile');

  if (response) {
    localStorage.setItem('userData', JSON.stringify(response));
  }

  return response;
};

/**
 * Logout user
 * @returns {Promise<void>}
 */
export const logout = async () => {
  try {
    // The refresh cookie is sent automatically; the server revokes it and
    // clears the cookie.
    await post('/auth/logout', {});
  } finally {
    // Keep logout cleanup unconditional: the app historically treats logout as a
    // local-auth reset even when the backend request fails or times out.
    clearAuthToken();
  }
};
