import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
const { logger } = vi.hoisted(() => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../utils/logger', () => ({
  logger,
}));

describe('email service logging', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('logs request context when reply email is unavailable', async () => {
    delete process.env.MAKE_WEBHOOK_URL;
    delete process.env.MAKE_API_KEY;

    const { EmailService } = await import('./email.service');
    const service = new EmailService();

    await expect(service.sendReplyEmail({
      type: 'reply',
      toEmail: 'customer@test.com',
      toName: 'Customer',
      subject: 'Question',
      originalMessage: 'Original',
      replyMessage: 'Reply',
      repliedBy: 'Manager',
    }, {
      requestId: 'req-10',
      actorUserId: 3,
      messageId: 6,
    })).rejects.toThrow('Email service is currently unavailable. Please try again later.');

    expect(logger.warn).toHaveBeenCalledWith('Attempted to send reply email but webhook is not configured', {
      requestId: 'req-10',
      actorUserId: 3,
      messageId: 6,
    });
  });

  it('logs request context on successful reply email sends', async () => {
    process.env.MAKE_WEBHOOK_URL = 'https://example.test/webhook';
    process.env.MAKE_API_KEY = 'test-key';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: vi.fn(),
    } as any);

    const { EmailService } = await import('./email.service');
    const service = new EmailService();

    const result = await service.sendReplyEmail({
      type: 'reply',
      toEmail: 'customer@test.com',
      toName: 'Customer',
      subject: 'Question',
      originalMessage: 'Original',
      replyMessage: 'Reply',
      repliedBy: 'Manager',
      orderId: 8,
    }, {
      requestId: 'req-11',
      actorUserId: 5,
      messageId: 9,
    });

    expect(logger.info).toHaveBeenCalledWith('Reply email sent successfully via Make.com webhook', expect.objectContaining({
      toEmail: 'customer@test.com',
      requestId: 'req-11',
      actorUserId: 5,
      messageId: 9,
    }));
    expect(result).toBe(true);
  });
});
