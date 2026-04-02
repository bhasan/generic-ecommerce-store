const {
  validationResultMock,
  emailServiceMock,
  contactMessageServiceMock,
  notificationEventsServiceMock,
  prismaMock,
  logger,
} = vi.hoisted(() => ({
  validationResultMock: vi.fn(),
  emailServiceMock: {
    isReady: vi.fn(),
    sendReplyEmail: vi.fn(),
  },
  contactMessageServiceMock: {
    createMessage: vi.fn(),
    getAllMessages: vi.fn(),
    getNewMessageCount: vi.fn(),
    getMessageById: vi.fn(),
    updateMessage: vi.fn(),
    markAsRead: vi.fn(),
    markAsResolved: vi.fn(),
    deleteMessage: vi.fn(),
  },
  notificationEventsServiceMock: {
    notifyContactMessageReceived: vi.fn(),
    notifyContactReplySent: vi.fn(),
  },
  prismaMock: {
    user: {
      findUnique: vi.fn(),
    },
  },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('express-validator', () => ({
  validationResult: validationResultMock,
}));

vi.mock('../services/email.service', () => ({
  default: emailServiceMock,
}));

vi.mock('../services/contactMessage.service', () => ({
  default: contactMessageServiceMock,
}));

vi.mock('../services/notificationEvents.service', () => ({
  notificationEventsService: notificationEventsServiceMock,
}));

vi.mock('../config/database', () => ({
  default: prismaMock,
}));

vi.mock('../utils/logger', () => ({
  logger,
}));

import { ContactController } from './contact.controller';

const createResponse = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
});

describe('contact controller logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs validation failures for contact form submission', async () => {
    validationResultMock.mockReturnValue({
      isEmpty: () => false,
      array: () => [{ msg: 'Subject is required' }],
    });
    const controller = new ContactController();
    const req: any = { requestId: 'req-1', user: { userId: 7 } };
    const res = createResponse();

    await controller.submitContactForm(req, res as any, vi.fn());

    expect(logger.warn).toHaveBeenCalledWith('Contact form validation failed', expect.objectContaining({
      requestId: 'req-1',
      actorUserId: 7,
    }));
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('logs successful contact form submissions', async () => {
    validationResultMock.mockReturnValue({
      isEmpty: () => true,
      array: () => [],
    });
    prismaMock.user.findUnique.mockResolvedValue({ name: 'Customer', phoneNumber: '555' });
    contactMessageServiceMock.createMessage.mockResolvedValue({ id: 44 });
    const controller = new ContactController();
    const req: any = {
      requestId: 'req-2',
      body: { subject: 'Help', orderId: '12', message: 'Need help' },
      user: { userId: 5, username: 'customer@test.com' },
    };
    const res = createResponse();

    await controller.submitContactForm(req, res as any, vi.fn());

    expect(logger.info).toHaveBeenCalledWith('Contact form submitted', {
      requestId: 'req-2',
      actorUserId: 5,
      messageId: 44,
      orderId: 12,
      subject: 'Help',
    });
    expect(notificationEventsServiceMock.notifyContactMessageReceived).toHaveBeenCalledWith(44, {
      userId: 5,
      username: 'customer@test.com',
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('passes request correlation into reply emails', async () => {
    validationResultMock.mockReturnValue({
      isEmpty: () => true,
      array: () => [],
    });
    contactMessageServiceMock.getMessageById.mockResolvedValue({
      id: 6,
      userId: 12,
      userEmail: 'customer@test.com',
      userName: 'Customer',
      subject: 'Question',
      message: 'Original',
      repliedAt: null,
      orderId: 3,
    });
    prismaMock.user.findUnique.mockResolvedValue({ username: 'Manager' });
    emailServiceMock.isReady.mockReturnValue(true);
    emailServiceMock.sendReplyEmail.mockResolvedValue(true);
    contactMessageServiceMock.updateMessage.mockResolvedValue({ id: 6 });

    const controller = new ContactController();
    const req: any = {
      requestId: 'req-3',
      params: { id: '6' },
      body: { replyMessage: 'Reply body' },
      user: { userId: 9 },
    };
    const res = createResponse();

    await controller.replyToMessage(req, res as any, vi.fn());

    expect(emailServiceMock.sendReplyEmail).toHaveBeenCalledWith(expect.objectContaining({
      toEmail: 'customer@test.com',
      repliedBy: 'Manager',
    }), {
      requestId: 'req-3',
      actorUserId: 9,
      messageId: 6,
    });
    expect(notificationEventsServiceMock.notifyContactReplySent).toHaveBeenCalledWith(6, 12, {
      userId: 9,
      username: 'Manager',
    });
  });
});
