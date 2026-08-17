import { describe, it, expect, beforeEach, vi } from 'vitest';
import userController from './user.controller';
import userService from '../services/user.service';
import { validationResult } from 'express-validator';
import { logger } from '../utils/logger';

vi.mock('express-validator', () => ({
  validationResult: vi.fn(),
}));

vi.mock('../services/user.service', () => ({
  default: {
    updateUser: vi.fn(),
    approveUser: vi.fn(),
    rejectUser: vi.fn(),
    unRejectUser: vi.fn(),
    deleteUser: vi.fn(),
  },
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

describe('user controller logging', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 on updateUser validation failure', async () => {
    (validationResult as any).mockReturnValue({
      isEmpty: () => false,
      array: () => [{ msg: 'bad email' }],
    });
    const req: any = { params: { id: '2' }, user: { userId: 9 }, requestId: 'req-1' };
    const res = createResponse();

    await userController.updateUser(req, res as any);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('logs approval requests without changing response shape', async () => {
    (userService.approveUser as any).mockResolvedValue({ id: 2 });
    const req: any = { params: { id: '2' }, user: { userId: 9 }, requestId: 'req-2' };
    const res = createResponse();
    const next = vi.fn();

    await userController.approveUser(req, res as any, next);

    expect(logger.info).toHaveBeenCalledWith('User approval requested', expect.objectContaining({
      actorUserId: 9,
      targetUserId: 2,
    }));
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'User approved successfully',
      data: { user: { id: 2 } },
    });
    expect(next).not.toHaveBeenCalled();
  });
});
