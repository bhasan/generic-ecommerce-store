import { get, post, patch, del } from './api';

/**
 * Get active announcements (public endpoint)
 * @returns {Promise<Array>} Array of active announcement objects
 */
export const getActiveAnnouncements = async () => {
  try {
    const response = await get('/announcements/active');
    return response;
  } catch (error) {
    throw error;
  }
};

/**
 * Get all announcements (admin only)
 * @returns {Promise<Array>} Array of all announcement objects
 */
export const getAllAnnouncements = async () => {
  try {
    const response = await get('/announcements');
    return response;
  } catch (error) {
    throw error;
  }
};

/**
 * Get announcement by ID (admin only)
 * @param {number} id - Announcement ID
 * @returns {Promise<object>} Announcement object
 */
export const getAnnouncementById = async (id) => {
  try {
    const response = await get(`/announcements/${id}`);
    return response;
  } catch (error) {
    throw error;
  }
};

/**
 * Create announcement (admin only)
 * @param {object} data - Announcement data {message, type?, dismissible?, enabled?}
 * @returns {Promise<object>} Created announcement object
 */
export const createAnnouncement = async (data) => {
  try {
    const response = await post('/announcements', data);
    return response.announcement || response;
  } catch (error) {
    throw error;
  }
};

/**
 * Update announcement (admin only)
 * @param {number} id - Announcement ID
 * @param {object} data - Update data {message?, type?, dismissible?, enabled?}
 * @returns {Promise<object>} Updated announcement object
 */
export const updateAnnouncement = async (id, data) => {
  try {
    const response = await patch(`/announcements/${id}`, data);
    return response.announcement || response;
  } catch (error) {
    throw error;
  }
};

/**
 * Delete announcement (admin only)
 * @param {number} id - Announcement ID
 * @returns {Promise<object>} Success message
 */
export const deleteAnnouncement = async (id) => {
  try {
    const response = await del(`/announcements/${id}`);
    return response;
  } catch (error) {
    throw error;
  }
};

