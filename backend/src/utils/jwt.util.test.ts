// backend/src/utils/jwt.util.test.ts
import { describe, it, expect } from 'vitest';
import { generateToken, verifyToken } from './jwt.util';

describe('tenant-aware JWT', () => {
  it('round-trips tenantId and scoped roles', () => {
    const token = generateToken({
      userId: 1,
      username: 'u',
      tenantId: 42,
      roles: [{ name: 'MANAGEMENT', storeId: 5 }],
    });
    const decoded = verifyToken(token);
    expect(decoded.tenantId).toBe(42);
    expect(decoded.roles).toEqual([{ name: 'MANAGEMENT', storeId: 5 }]);
  });
});
