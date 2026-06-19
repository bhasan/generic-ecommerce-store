import { AppError } from '../middleware/error.middleware';

export const toUtcIso = (value: Date | string | null | undefined): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

export const parseIsoDateParam = (value: unknown, fieldName: string): Date | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new AppError(`${fieldName} must be an ISO-8601 timestamp`, 400, 'INVALID_QUERY');
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(`${fieldName} must be an ISO-8601 timestamp`, 400, 'INVALID_QUERY');
  }
  return date;
};
