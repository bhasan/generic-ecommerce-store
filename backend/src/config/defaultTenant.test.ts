import { describe, it, expect } from 'vitest';
import { setDefaultTenantId, getDefaultTenantId } from './defaultTenant';

describe('defaultTenant cache', () => {
  it('is null before it is set', () => {
    // fresh module state per file run
    expect(getDefaultTenantId()).toBeNull();
  });

  it('returns the value once set', () => {
    setDefaultTenantId(7);
    expect(getDefaultTenantId()).toBe(7);
  });
});
