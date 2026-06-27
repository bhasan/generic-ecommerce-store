import { describe, it, expect } from 'vitest';
import { formatCurrency, formatPrice } from './currencyUtils';

describe('formatCurrency', () => {
  it('formats a float to 2 decimal places by default', () => {
    expect(formatCurrency(12.5)).toBe('12.50');
    expect(formatCurrency(99.99)).toBe('99.99');
    expect(formatCurrency(0.5)).toBe('0.50');
  });

  it('formats integers with trailing zeros', () => {
    expect(formatCurrency(12)).toBe('12.00');
    expect(formatCurrency(100)).toBe('100.00');
    expect(formatCurrency(0)).toBe('0.00');
  });

  it('formats negative numbers correctly', () => {
    expect(formatCurrency(-12.5)).toBe('-12.50');
    expect(formatCurrency(-0.99)).toBe('-0.99');
    expect(formatCurrency(-100)).toBe('-100.00');
  });

  it('handles null and undefined by returning 0.00', () => {
    expect(formatCurrency(null)).toBe('0.00');
    expect(formatCurrency(undefined)).toBe('0.00');
  });

  it('respects custom decimal places', () => {
    expect(formatCurrency(12.5, 1)).toBe('12.5');
    expect(formatCurrency(12.5, 3)).toBe('12.500');
    expect(formatCurrency(12.5, 0)).toBe('13'); // Rounds up: 12.5 -> 13
  });

  it('handles string numbers by converting to number', () => {
    expect(formatCurrency('12.50')).toBe('12.50');
    expect(formatCurrency('99')).toBe('99.00');
    expect(formatCurrency('-12.5')).toBe('-12.50');
  });

  it('rounds correctly', () => {
    expect(formatCurrency(12.456)).toBe('12.46');
    expect(formatCurrency(12.454)).toBe('12.45');
    expect(formatCurrency(0.005)).toBe('0.01');
  });
});

describe('formatPrice', () => {
  it('formats a float to $x.xx format', () => {
    expect(formatPrice(12.5)).toBe('$12.50');
    expect(formatPrice(99.99)).toBe('$99.99');
    expect(formatPrice(0.5)).toBe('$0.50');
  });

  it('formats integers with trailing zeros', () => {
    expect(formatPrice(12)).toBe('$12.00');
    expect(formatPrice(100)).toBe('$100.00');
    expect(formatPrice(0)).toBe('$0.00');
  });

  it('formats negative numbers correctly', () => {
    expect(formatPrice(-12.5)).toBe('$-12.50');
    expect(formatPrice(-0.99)).toBe('$-0.99');
    expect(formatPrice(-100)).toBe('$-100.00');
  });

  it('handles null and undefined by returning $0.00', () => {
    expect(formatPrice(null)).toBe('$0.00');
    expect(formatPrice(undefined)).toBe('$0.00');
  });

  it('handles string numbers by converting to number', () => {
    expect(formatPrice('12.50')).toBe('$12.50');
    expect(formatPrice('99')).toBe('$99.00');
    expect(formatPrice('-12.5')).toBe('$-12.50');
  });

  it('rounds correctly', () => {
    expect(formatPrice(12.456)).toBe('$12.46');
    expect(formatPrice(12.454)).toBe('$12.45');
    expect(formatPrice(0.005)).toBe('$0.01');
  });

  it('always uses 2 decimal places', () => {
    expect(formatPrice(12.5)).toBe('$12.50');
    expect(formatPrice(12)).toBe('$12.00');
    // formatPrice should never use more or less than 2 decimal places
  });
});
