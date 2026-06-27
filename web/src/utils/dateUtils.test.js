import { formatDate, formatDateShort, formatDateTime } from './dateUtils';

describe('dateUtils', () => {
  describe('formatDate', () => {
    it('returns N/A for null', () => {
      expect(formatDate(null)).toBe('N/A');
    });

    it('returns N/A for undefined', () => {
      expect(formatDate(undefined)).toBe('N/A');
    });

    it('returns formatted date with time for valid date string', () => {
      const result = formatDate('2024-01-15T10:30:00Z');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('handles invalid date gracefully', () => {
      const result = formatDate('invalid');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  describe('formatDateShort', () => {
    it('returns N/A for null', () => {
      expect(formatDateShort(null)).toBe('N/A');
    });

    it('returns N/A for undefined', () => {
      expect(formatDateShort(undefined)).toBe('N/A');
    });

    it('returns formatted date (no time) for valid date string', () => {
      const result = formatDateShort('2024-01-15T10:30:00Z');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('handles invalid date gracefully', () => {
      const result = formatDateShort('invalid');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  describe('formatDateTime', () => {
    it('returns N/A for null', () => {
      expect(formatDateTime(null)).toBe('N/A');
    });

    it('returns N/A for undefined', () => {
      expect(formatDateTime(undefined)).toBe('N/A');
    });

    it('returns formatted date and time for valid date string', () => {
      const result = formatDateTime('2024-01-15T10:30:00Z');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(result).toMatch(/2024|Jan|1\/15|15\/1/);
    });

    it('handles invalid date gracefully', () => {
      expect(formatDateTime('invalid')).toBe('invalid');
    });
  });
});
