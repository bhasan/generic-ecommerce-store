// backend/src/config/tenantScope.test.ts
import { describe, it, expect } from 'vitest';
import { UNSCOPED_TABLES, STORE_SCOPED_TABLES, isUnscoped, isStoreScoped } from './tenantScope';

describe('tenantScope', () => {
  it('treats infra tables as unscoped', () => {
    expect(isUnscoped('roles')).toBe(true);
    expect(isUnscoped('refresh_tokens')).toBe(true);
    expect(isUnscoped('products')).toBe(false);
  });

  it('classifies store-scoped tables', () => {
    expect(isStoreScoped('orders')).toBe(true);
    expect(isStoreScoped('payments')).toBe(true);
    expect(isStoreScoped('products')).toBe(false);
  });

  it('keeps the two sets disjoint', () => {
    for (const t of STORE_SCOPED_TABLES) {
      expect(UNSCOPED_TABLES.has(t)).toBe(false);
    }
  });
});
