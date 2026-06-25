import { post, get, setAuthToken, setRefreshToken, clearAuthToken, getRefreshToken } from './api';

/**
 * Login user
 * @param {string} username - Username
 * @param {string} password - User password
 * @returns {Promise<{user: object, token: string}>}
 */
export const login = async (username, password) => {
  const response = await post('/auth/login', { username, password });

  if (response.token) {
    setAuthToken(response.token);
  }

  if (response.refreshToken) {
    setRefreshToken(response.refreshToken);
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

  if (response.refreshToken) {
    setRefreshToken(response.refreshToken);
  }

  return {
    user: response.user,
    message: response.message,
    token: response.token
  };
};

/**
 * Exchange the stored refresh token for a new access token + rotated refresh token.
 * @param {string} rawToken - The current refresh token value
 * @returns {Promise<{token: string, refreshToken: string}>}
 */
export const refresh = async (rawToken) => {
  const response = await post('/auth/refresh', { refreshToken: rawToken }, { skipAutoLogout: true });

  if (response.token) {
    setAuthToken(response.token);
  }
  if (response.refreshToken) {
    setRefreshToken(response.refreshToken);
  }

  return {
    token: response.token,
    refreshToken: response.refreshToken,
  };
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
    // Send the refresh token so the server can revoke it (server-side logout).
    await post('/auth/logout', { refreshToken: getRefreshToken() });
  } finally {
    // Keep logout cleanup unconditional: the app historically treats logout as a
    // local-auth reset even when the backend request fails or times out.
    clearAuthToken();
  }
};
