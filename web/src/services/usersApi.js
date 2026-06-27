import { get, put, post } from './api';
import { createResourceApi } from './createResourceApi';

const usersResource = createResourceApi('/users', 'user');

/**
 * Get all users
 * @returns {Promise<Array>} Array of user objects
 */
export const getAllUsers = usersResource.getAll;

/**
 * Get user by ID
 * @param {number} id - User ID
 * @returns {Promise<object>} User object
 */
export const getUserById = usersResource.getById;

/**
 * Update user
 * @param {number} id - User ID
 * @param {object} data - Update data
 * @returns {Promise<object>} Updated user object
 */
export const updateUser = async (id, data) => {
  const result = await put(`/users/${id}`, data, { skipAutoLogout: true });
  return result?.user ?? result;
};

/**
 * Get pending registrations
 * @returns {Promise<Array>} Array of pending user objects
 */
export const getPendingRegistrations = async () => {
  return get('/users/pending');
};

/**
 * Get rejected users
 * @returns {Promise<Array>} Array of rejected user objects
 */
export const getRejectedUsers = async () => {
  return get('/users/rejected');
};

/**
 * Approve user
 * @param {number} id - User ID
 * @returns {Promise<object>} Approved user object
 */
export const approveUser = async (id) => {
  const result = await post(`/users/${id}/approve`);
  return result?.user ?? result;
};

/**
 * Reject user registration
 * @param {number} id - User ID
 * @param {string} rejectionNote - Optional rejection note
 * @returns {Promise<object>} Success message
 */
export const rejectUser = async (id, rejectionNote) => {
  return post(`/users/${id}/reject`, { rejectionNote });
};

/**
 * Un-reject user (move back to pending)
 * @param {number} id - User ID
 * @returns {Promise<object>} Success message
 */
export const unRejectUser = async (id) => {
  return post(`/users/${id}/unreject`);
};

/**
 * Delete user
 * @param {number} id - User ID
 * @returns {Promise<object>} Success message
 */
export const deleteUser = usersResource.remove;

/**
 * Get all available roles
 * @returns {Promise<Array>} Array of role names
 */
export const getAllRoles = async () => {
  return get('/users/roles');
};
