import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validationResult } from 'express-validator';
import authController from './auth.controller';
import authService from '../services/auth.service';
import { logger } from '../utils/logger';

vi.mock('express-validator', () => ({
  validationResult: vi.fn(),
}));

vi.mock('../services/auth.service', () => ({
  default: {
    register: vi.fn(),
    login: vi.fn(),
    getProfile: vi.fn(),
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

const createResponse = () => {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res;
};

describe('auth controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when register validation fails', async () => {
    (validationResult as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      isEmpty: () => false,
      array: () => [{ msg: 'bad email' }],
    });
    const req: any = { path: '/api/auth/register', method: 'POST', requestId: 'req-1' };
    const res = createResponse();

    await authController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when login validation fails', async () => {
    (validationResult as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      isEmpty: () => false,
      array: () => [{ msg: 'password required' }],
    });
    const req: any = { path: '/api/auth/login', method: 'POST', requestId: 'req-2' };
    const res = createResponse();

    await authController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns login payload unchanged on success', async () => {
    (validationResult as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      isEmpty: () => true,
      array: () => [],
    });
    (authService.login as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: 1 },
      token: 'token',
    });
    const req: any = { body: { email: 'x', password: 'y' } };
    const res = createResponse();
    const next = vi.fn();

    await authController.login(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Login successful',
      user: { id: 1 },
      token: 'token',
    });
    expect(next).not.toHaveBeenCalled();
  });
});
