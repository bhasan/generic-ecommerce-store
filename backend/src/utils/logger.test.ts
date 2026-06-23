import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Import after mocking so NODE_ENV/LOG_LEVEL are set before the module loads.
// We re-import fresh instances per describe block using vi.resetModules().

describe('logger', () => {
  let consoleSpy: { log: ReturnType<typeof vi.spyOn>; warn: ReturnType<typeof vi.spyOn>; error: ReturnType<typeof vi.spyOn> };

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const parseLog = (spy: ReturnType<typeof vi.spyOn>, callIndex = 0): Record<string, unknown> =>
    JSON.parse((spy.mock.calls[callIndex]?.[0] as string) ?? '{}');

  describe('every log line', () => {
    it('includes service and env fields', async () => {
      const { logger } = await import('./logger');
      logger.info('test message');
      const log = parseLog(consoleSpy.log);
      expect(log.service).toBe('backend');
      expect(log.env).toBeDefined();
    });

    it('includes timestamp and level', async () => {
      const { logger } = await import('./logger');
      logger.info('test');
      const log = parseLog(consoleSpy.log);
      expect(log.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(log.level).toBe('info');
    });

    it('merges context fields into output', async () => {
      const { logger } = await import('./logger');
      logger.info('with context', { requestId: 'req_abc', userId: 42 });
      const log = parseLog(consoleSpy.log);
      expect(log.requestId).toBe('req_abc');
      expect(log.userId).toBe(42);
    });
  });

  describe('info', () => {
    it('writes to console.log', async () => {
      const { logger } = await import('./logger');
      logger.info('hello');
      expect(consoleSpy.log).toHaveBeenCalledOnce();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
    });
  });

  describe('warn', () => {
    it('writes to console.warn', async () => {
      const { logger } = await import('./logger');
      logger.warn('heads up');
      expect(consoleSpy.warn).toHaveBeenCalledOnce();
      const log = parseLog(consoleSpy.warn);
      expect(log.level).toBe('warn');
    });
  });

  describe('error', () => {
    it('writes to console.error with Error fields', async () => {
      const { logger } = await import('./logger');
      const err = new Error('boom');
      logger.error('something failed', err);
      expect(consoleSpy.error).toHaveBeenCalledOnce();
      const log = parseLog(consoleSpy.error);
      expect(log.level).toBe('error');
      expect(log.errorMessage).toBe('boom');
      expect(typeof log.errorStack).toBe('string');
      expect(log.errorName).toBe('Error');
    });

    it('handles non-Error objects', async () => {
      const { logger } = await import('./logger');
      logger.error('failed', { code: 'SOME_ERROR' });
      const log = parseLog(consoleSpy.error);
      expect(log.error).toEqual({ code: 'SOME_ERROR' });
    });
  });

  describe('debug', () => {
    it('is suppressed when NODE_ENV is production and LOG_LEVEL is not debug', async () => {
      vi.resetModules();
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('LOG_LEVEL', '');
      const { logger } = await import('./logger');
      logger.debug('verbose detail');
      expect(consoleSpy.log).not.toHaveBeenCalled();
      vi.unstubAllEnvs();
    });

    it('emits when LOG_LEVEL=debug regardless of NODE_ENV', async () => {
      vi.resetModules();
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('LOG_LEVEL', 'debug');
      const { logger } = await import('./logger');
      logger.debug('verbose detail');
      expect(consoleSpy.log).toHaveBeenCalledOnce();
      const log = parseLog(consoleSpy.log);
      expect(log.level).toBe('debug');
      vi.unstubAllEnvs();
    });
  });

  describe('logEvent', () => {
    it('writes to console.log', async () => {
      const { logger } = await import('./logger');
      logger.logEvent('order.created', { orderId: 1 });
      expect(consoleSpy.log).toHaveBeenCalledOnce();
    });

    it('sets message and event to the event name', async () => {
      const { logger } = await import('./logger');
      logger.logEvent('auth.login_success', { userId: 5 });
      const log = parseLog(consoleSpy.log);
      expect(log.message).toBe('auth.login_success');
      expect(log.event).toBe('auth.login_success');
    });

    it('merges context into the log payload', async () => {
      const { logger } = await import('./logger');
      logger.logEvent('payment.succeeded', { orderId: 10, transId: 'txn_abc' });
      const log = parseLog(consoleSpy.log);
      expect(log.orderId).toBe(10);
      expect(log.transId).toBe('txn_abc');
    });

    it('always sets level to info', async () => {
      const { logger } = await import('./logger');
      logger.logEvent('order.status_changed', {});
      const log = parseLog(consoleSpy.log);
      expect(log.level).toBe('info');
    });

    it('includes service and env fields', async () => {
      const { logger } = await import('./logger');
      logger.logEvent('order.created', {});
      const log = parseLog(consoleSpy.log);
      expect(log.service).toBe('backend');
      expect(log.env).toBeDefined();
    });
  });
});
