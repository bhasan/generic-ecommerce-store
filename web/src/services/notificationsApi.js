import { get, patch } from './api';

export const getNotifications = async ({ unreadOnly = false } = {}) => {
  const query = unreadOnly ? '?unread=true' : '';
  return get(`/notifications${query}`, { skipAutoLogout: true });
};

export const getUnreadNotificationCount = async () => {
  return get('/notifications/unread-count', { skipAutoLogout: true });
};

export const markNotificationRead = async (id) => {
  return patch(`/notifications/${id}/read`, {}, { skipAutoLogout: true });
};

export const markAllNotificationsRead = async () => {
  return patch('/notifications/read-all', {}, { skipAutoLogout: true });
};

/**
 * Staff Notifications API
 * Fetches lightweight counts for staff (orders by status, pending registrations)
 */
export const getStaffNotificationCounts = async () => {
  return get('/notifications/staff', { skipAutoLogout: true });
};
