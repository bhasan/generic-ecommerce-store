import { describe, it, expect, beforeEach, vi } from 'vitest';
const prismaMock = {
  announcement: {
    findMany: vi.fn(),
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
};

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.mock('../config/database', () => ({
  default: prismaMock,
}));

vi.mock('../utils/logger', () => ({
  logger,
}));

describe('announcement service logging', () => {
  beforeEach(() => vi.clearAllMocks());

  it('logs active announcement retrieval counts', async () => {
    prismaMock.announcement.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const { AnnouncementService } = await import('./announcement.service');
    const service = new AnnouncementService();

    const result = await service.getActiveAnnouncements();

    expect(logger.info).toHaveBeenCalledWith('Active announcements retrieved', { count: 2 });
    expect(result).toHaveLength(2);
  });

  it('logs creation and preserves return value', async () => {
    prismaMock.announcement.create.mockResolvedValue({ id: 7, enabled: true, type: 'INFO' });
    const { AnnouncementService } = await import('./announcement.service');
    const service = new AnnouncementService();

    const result = await service.createAnnouncement({ message: 'Hello', type: 'INFO' });

    expect(logger.info).toHaveBeenCalledWith('Creating announcement', expect.objectContaining({ type: 'INFO' }));
    expect(logger.info).toHaveBeenCalledWith('Announcement created', expect.objectContaining({ announcementId: 7 }));
    expect(result.id).toBe(7);
  });
});
