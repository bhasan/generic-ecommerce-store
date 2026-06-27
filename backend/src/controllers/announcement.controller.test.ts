import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnnouncementController } from './announcement.controller';
import { logger } from '../utils/logger';
import { validationResult } from 'express-validator';

vi.mock('express-validator', () => ({
  validationResult: vi.fn(),
}));

const { serviceMock } = vi.hoisted(() => ({
  serviceMock: {
    createAnnouncement: vi.fn(),
    deleteAnnouncement: vi.fn(),
  },
}));

vi.mock('../services/announcement.service', () => ({
  AnnouncementService: vi.fn(() => serviceMock),
}));

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const createResponse = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
});

describe('announcement controller logging', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls validateRequest on create', async () => {
    // When validators run and produce errors, validateRequest sends 400
    // This is now the route's responsibility; controller assumes valid input
    // Test that the controller correctly calls validateRequest
    (validationResult as any).mockReturnValue({
      isEmpty: () => false,
      array: () => [{ msg: 'Message is required' }],
    });
    const controller = new AnnouncementController();
    const req: any = { body: {}, user: { userId: 1 }, requestId: 'req-1' };
    const res = createResponse();

    await controller.createAnnouncement(req, res as any);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('logs delete requests and preserves response shape', async () => {
    const controller = new AnnouncementController();
    const req: any = { params: { id: '6' }, user: { userId: 1 }, requestId: 'req-2' };
    const res = createResponse();

    await controller.deleteAnnouncement(req, res as any, vi.fn());

    expect(logger.info).toHaveBeenCalledWith('Announcement delete requested', expect.objectContaining({
      actorUserId: 1,
      targetAnnouncementId: 6,
    }));
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Announcement deleted successfully', data: null });
  });
});
