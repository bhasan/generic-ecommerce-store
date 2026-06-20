import { describe, it, expect } from 'vitest';
import { parseCurbsideAddress, formatCurbsideAddress } from './curbside';

describe('parseCurbsideAddress', () => {
  it('parses vehicle only', () => {
    expect(parseCurbsideAddress('CURBSIDE: Black Honda Civic')).toEqual({
      vehicleDescription: 'Black Honda Civic',
      parkingSpot: null,
    });
  });

  it('parses vehicle + spot', () => {
    expect(parseCurbsideAddress('CURBSIDE: Silver Camry | SPOT: A-12')).toEqual({
      vehicleDescription: 'Silver Camry',
      parkingSpot: 'A-12',
    });
  });

  it('handles extra whitespace', () => {
    expect(parseCurbsideAddress('CURBSIDE:  Red Model 3  | SPOT:  Space 4  ')).toEqual({
      vehicleDescription: 'Red Model 3',
      parkingSpot: 'Space 4',
    });
  });

  it('returns nulls for null input', () => {
    expect(parseCurbsideAddress(null)).toEqual({ vehicleDescription: null, parkingSpot: null });
  });

  it('returns nulls for undefined input', () => {
    expect(parseCurbsideAddress(undefined)).toEqual({ vehicleDescription: null, parkingSpot: null });
  });

  it('handles case-insensitive CURBSIDE prefix', () => {
    expect(parseCurbsideAddress('curbside: Blue Truck')).toEqual({
      vehicleDescription: 'Blue Truck',
      parkingSpot: null,
    });
  });
});

describe('formatCurbsideAddress', () => {
  it('formats vehicle only', () => {
    expect(formatCurbsideAddress({ vehicleDescription: 'Black Honda Civic', parkingSpot: null }))
      .toBe('CURBSIDE: Black Honda Civic');
  });

  it('formats vehicle + spot', () => {
    expect(formatCurbsideAddress({ vehicleDescription: 'Silver Camry', parkingSpot: 'A-12' }))
      .toBe('CURBSIDE: Silver Camry | SPOT: A-12');
  });

  it('handles null vehicleDescription', () => {
    expect(formatCurbsideAddress({ vehicleDescription: null, parkingSpot: null }))
      .toBe('CURBSIDE: ');
  });
});

describe('round-trip', () => {
  it('parse then format returns equivalent string', () => {
    const original = 'CURBSIDE: Black Honda Civic | SPOT: A-12';
    const parsed = parseCurbsideAddress(original);
    expect(formatCurbsideAddress(parsed)).toBe(original);
  });
});
