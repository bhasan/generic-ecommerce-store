import { describe, it, expect } from 'vitest';
import * as svc from './posOrderService';
describe('posOrderService (shim)', () => {
  it('exports push functions', () => {
    expect(typeof svc.pushOrderCreated).toBe('function');
    expect(typeof svc.pushOrderUpdated).toBe('function');
  });
});
