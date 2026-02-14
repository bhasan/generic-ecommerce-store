/**
 * Normalize any value to a string suitable for error/notification display.
 * Prevents "[object Object]" when an object is passed to notifications.
 * @param {*} value - Message from API, Error, or any value
 * @param {string} fallback - Fallback when value cannot be turned into a readable string
 * @returns {string}
 */
export function toNotificationMessage(value, fallback = 'Something went wrong. Please try again.') {
  if (value == null) return fallback;
  if (typeof value === 'string') return value.trim() || fallback;
  if (value instanceof Error) return value.message ? String(value.message).trim() || fallback : fallback;
  if (Array.isArray(value)) {
    const first = value[0];
    if (typeof first === 'string') return first.trim() || fallback;
    if (first && typeof first === 'object' && (first.msg != null || first.message != null)) {
      const text = first.msg ?? first.message;
      return toNotificationMessage(text, fallback);
    }
    return fallback;
  }
  if (typeof value === 'object') {
    const msg = value.message ?? value.msg ?? value.error;
    if (msg != null) return toNotificationMessage(msg, fallback);
  }
  return fallback;
}
