export const required = (value, label) =>
  (value === undefined || value === null || String(value).trim() === '')
    ? `${label} is required`
    : '';

export const minLength = (value, min, label) =>
  String(value).trim().length < min
    ? `${label} must be at least ${min} characters`
    : '';
