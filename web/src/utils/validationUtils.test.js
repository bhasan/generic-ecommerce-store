import { required, minLength } from './validationUtils';

describe('validationUtils', () => {
  describe('required', () => {
    it('returns error string for empty string', () => {
      expect(required('', 'Username')).toBe('Username is required');
    });

    it('returns empty string for non-empty value', () => {
      expect(required('hello', 'Username')).toBe('');
    });

    it('returns error string for null', () => {
      expect(required(null, 'Username')).toBe('Username is required');
    });

    it('returns error string for undefined', () => {
      expect(required(undefined, 'Username')).toBe('Username is required');
    });

    it('trims whitespace', () => {
      expect(required('   ', 'Username')).toBe('Username is required');
    });
  });

  describe('minLength', () => {
    it('returns error string when value is shorter than min', () => {
      expect(minLength('ab', 3, 'Password')).toBe('Password must be at least 3 characters');
    });

    it('returns empty string when value meets minimum', () => {
      expect(minLength('abc', 3, 'Password')).toBe('');
    });

    it('returns empty string when value is longer than minimum', () => {
      expect(minLength('abcd', 3, 'Password')).toBe('');
    });

    it('trims whitespace before checking length', () => {
      expect(minLength('   a   ', 3, 'Password')).toBe('Password must be at least 3 characters');
    });
  });
});
