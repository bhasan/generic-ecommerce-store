/**
 * Contact API service
 * Handles contact form submissions
 */

import { post } from './api';

/**
 * Submit a contact form message
 * @param {Object} data - Contact form data
 * @param {string} data.subject - Subject/topic of the inquiry
 * @param {string|null} data.orderId - Optional order ID reference
 * @param {string} data.message - The message content
 * @returns {Promise<Object>} Response with success status
 */
export const submitContactForm = async (data) => {
  const response = await post('/contact', {
    subject: data.subject,
    orderId: data.orderId || null,
    message: data.message
  });
  
  return response;
};
