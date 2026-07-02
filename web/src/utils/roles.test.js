import { describe, it, expect } from 'vitest';
import { isSuperAdmin, ROLES } from './roles';

describe('isSuperAdmin', () => {
  it('is true when the user has the SUPER_ADMIN role', () => {
    expect(isSuperAdmin({ roles: [ROLES.ADMIN, ROLES.SUPER_ADMIN] })).toBe(true);
  });
  it('is false for a plain admin', () => {
    expect(isSuperAdmin({ roles: [ROLES.ADMIN] })).toBe(false);
  });
  it('is false for null/undefined', () => {
    expect(isSuperAdmin(null)).toBe(false);
    expect(isSuperAdmin(undefined)).toBe(false);
  });
});
