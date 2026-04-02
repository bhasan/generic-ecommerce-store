import { get, post, patch, del } from './api';

/**
 * Get active announcements (public endpoint)
 * @returns {Promise<Array>} Array of active announcement objects
 */
export const getActiveAnnouncements = async () => {
  return get('/announcements/active');
};

/**
 * Get all announcements (admin only)
 * @returns {Promise<Array>} Array of all announcement objects
 */
export const getAllAnnouncements = async () => {
  return get('/announcements');
};

/**
 * Get announcement by ID (admin only)
 * @param {number} id - Announcement ID
 * @returns {Promise<object>} Announcement object
 */
export const getAnnouncementById = async (id) => {
  return get(`/announcements/${id}`);
};

/**
 * Create announcement (admin only)
 * @param {object} data - Announcement data {message, type?, dismissible?, enabled?}
 * @returns {Promise<object>} Created announcement object
 */
export const createAnnouncement = async (data) => {
  const response = await post('/announcements', data);
  return response.announcement || response;
};

/**
 * Update announcement (admin only)
 * @param {number} id - Announcement ID
 * @param {object} data - Update data {message?, type?, dismissible?, enabled?}
 * @returns {Promise<object>} Updated announcement object
 */
export const updateAnnouncement = async (id, data) => {
  const response = await patch(`/announcements/${id}`, data);
  return response.announcement || response;
};

/**
 * Delete announcement (admin only)
 * @param {number} id - Announcement ID
 * @returns {Promise<object>} Success message
 */
export const deleteAnnouncement = async (id) => {
  return del(`/announcements/${id}`);
};

