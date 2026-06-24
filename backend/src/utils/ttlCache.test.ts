import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TtlCache } from './ttlCache';

describe('TtlCache', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns a stored value before expiry and undefined after', () => {
    const cache = new TtlCache<number>(1000);
    cache.set('k', 42);
    expect(cache.get('k')).toBe(42);
    vi.advanceTimersByTime(1001);
    expect(cache.get('k')).toBeUndefined();
  });

  it('delete and clear remove entries', () => {
    const cache = new TtlCache<string>(1000);
    cache.set('a', 'x'); cache.set('b', 'y');
    cache.delete('a');
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('y');
    cache.clear();
    expect(cache.get('b')).toBeUndefined();
  });
});
