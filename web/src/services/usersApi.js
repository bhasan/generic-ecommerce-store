import { get, put, del } from './api';

/**
 * Get all users
 * @returns {Promise<Array>} Array of user objects
 */
export const getAllUsers = async () => {
  try {
    const response = await get('/users');
    return response;
  } catch (error) {
    throw error;
  }
};

/**
 * Get user by ID
 * @param {number} id - User ID
 * @returns {Promise<object>} User object
 */
export const getUserById = async (id) => {
  try {
    const response = await get(`/users/${id}`);
    return response;
  } catch (error) {
    throw error;
  }
};

/**
 * Update user
 * @param {number} id - User ID
 * @param {object} data - Update data {email?, name?, password?, roles?}
 * @returns {Promise<object>} Updated user object
 */
export const updateUser = async (id, data) => {
  try {
    const response = await put(`/users/${id}`, data);
    return response.user || response;
  } catch (error) {
    throw error;
  }
};

/**
 * Delete user
 * @param {number} id - User ID
 * @returns {Promise<object>} Success message
 */
export const deleteUser = async (id) => {
  try {
    const response = await del(`/users/${id}`);
    return response;
  } catch (error) {
    throw error;
  }
};

