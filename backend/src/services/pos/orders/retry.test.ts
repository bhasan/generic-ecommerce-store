import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { logger as mockLogger } from '../../../utils/logger';
import { retryWithBackoff } from './retry';

describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it('succeeds on first attempt without logging', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const promise = retryWithBackoff(fn, { label: 'test' });
    await vi.runAllTimersAsync();
    await promise;

    expect(fn).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).not.toHaveBeenCalled();
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('retries on failure and succeeds on second attempt', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue(undefined);

    const promise = retryWithBackoff(fn, { label: 'test' });
    await vi.runAllTimersAsync();
    await promise;

    expect(fn).toHaveBeenCalledTimes(2);
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('exhausts all 3 attempts: logs error twice, logs final warning once, does not throw', async () => {
    const err = new Error('always fail');
    const fn = vi.fn().mockRejectedValue(err);

    const promise = retryWithBackoff(fn, { label: 'test' });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBeUndefined();

    expect(fn).toHaveBeenCalledTimes(3);
    expect(mockLogger.error).toHaveBeenCalledTimes(2);
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('test'),
      expect.objectContaining({ error: err })
    );
  });

  it('custom attempts: 1 — fails immediately, logs final warning, does not throw', async () => {
    const err = new Error('fail');
    const fn = vi.fn().mockRejectedValue(err);

    const promise = retryWithBackoff(fn, { label: 'quick', attempts: 1 });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBeUndefined();

    expect(fn).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
  });

  it('applies backoff delays in correct order', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

    const promise = retryWithBackoff(fn, { label: 'delay-test' });
    await vi.runAllTimersAsync();
    await promise;

    const delays = setTimeoutSpy.mock.calls.map(call => call[1]);
    expect(delays).toContain(1000);
    expect(delays).toContain(2000);
  });

  it('clamps delay at 4000ms for attempts beyond 3 when attempts: 5', async () => {
    const err = new Error('fail');
    const fn = vi.fn().mockRejectedValue(err);
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

    const promise = retryWithBackoff(fn, { label: 'clamp-test', attempts: 5 });
    await vi.runAllTimersAsync();
    await promise;

    const delays = setTimeoutSpy.mock.calls.map(call => call[1]);
    // Attempts 4 and 5 (indices 3 and 4) should clamp to 4000ms
    const fourThousands = delays.filter(d => d === 4000);
    expect(fourThousands.length).toBeGreaterThanOrEqual(2);
  });
});
