/**
 * Contact Messages API service
 * Handles contact message management for admin/managers
 */

import { get, post, patch, del } from './api';

/**
 * Get all contact messages
 * @param {Object} filters - Optional filters
 * @param {string} filters.status - Filter by status (NEW, READ, RESOLVED)
 * @returns {Promise<Array>} List of contact messages
 */
export const getAllMessages = async (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.status) {
    params.append('status', filters.status);
  }
  
  const queryString = params.toString();
  const url = queryString ? `/contact/messages?${queryString}` : '/contact/messages';
  
  return get(url);
};

/**
 * Get count of new (unread) messages
 * @returns {Promise<{count: number}>} Count of new messages
 */
export const getNewMessageCount = async () => {
  return get('/contact/messages/count');
};

/**
 * Get a single message by ID
 * @param {number} id - Message ID
 * @returns {Promise<Object>} Message details
 */
export const getMessageById = async (id) => {
  return get(`/contact/messages/${id}`);
};

/**
 * Update message status and/or admin notes
 * @param {number} id - Message ID
 * @param {Object} data - Update data
 * @param {string} data.status - New status (NEW, READ, RESOLVED)
 * @param {string} data.adminNotes - Admin notes
 * @returns {Promise<Object>} Updated message
 */
export const updateMessage = async (id, data) => {
  return patch(`/contact/messages/${id}`, data);
};

/**
 * Mark message as read
 * @param {number} id - Message ID
 * @returns {Promise<Object>} Updated message
 */
export const markAsRead = async (id) => {
  return patch(`/contact/messages/${id}/read`, {});
};

/**
 * Mark message as resolved
 * @param {number} id - Message ID
 * @returns {Promise<Object>} Updated message
 */
export const markAsResolved = async (id) => {
  return patch(`/contact/messages/${id}/resolve`, {});
};

/**
 * Delete a message (Admin only)
 * @param {number} id - Message ID
 * @returns {Promise<Object>} Success response
 */
export const deleteMessage = async (id) => {
  return del(`/contact/messages/${id}`);
};

/**
 * Reply to a message (sends email to customer)
 * @param {number} id - Message ID
 * @param {string} replyMessage - The reply message text
 * @returns {Promise<Object>} Updated message with reply details
 */
export const replyToMessage = async (id, replyMessage) => {
  return post(`/contact/messages/${id}/reply`, { replyMessage });
};
