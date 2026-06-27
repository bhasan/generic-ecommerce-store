/**
 * Formats a currency amount to a fixed number of decimal places.
 * Null-safe: returns '0.00' for null/undefined values.
 *
 * @param {number} amount - The amount to format
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted number string (e.g., "12.50")
 */
export const formatCurrency = (amount, decimals = 2) => {
  if (amount === null || amount === undefined) {
    return '0.00';
  }
  return Number(amount).toFixed(decimals);
};

/**
 * Formats a currency amount as a price string with dollar sign.
 * Null-safe: returns '$0.00' for null/undefined values.
 *
 * @param {number} amount - The amount to format
 * @returns {string} Formatted price string (e.g., "$12.50")
 */
export const formatPrice = (amount) => {
  if (amount === null || amount === undefined) {
    return '$0.00';
  }
  return `$${Number(amount).toFixed(2)}`;
};
