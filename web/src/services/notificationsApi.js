/**
 * Staff Notifications API
 * Fetches lightweight counts for staff (orders by status, pending registrations)
 */

import { get } from './api';

/**
 * Get staff notification counts
 * @returns {Promise<{ordersByStatus: Record<string, number>, pendingRegistrations: number}>}
 */
export const getStaffNotificationCounts = async () => {
  return get('/notifications/staff', { skipAutoLogout: true });
};
