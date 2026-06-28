import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authenticate, optionalAuthenticate } from './auth.middleware';
import { logger } from '../utils/logger';
import { extractTokenFromHeader, verifyToken } from '../utils/jwt.util';

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../utils/jwt.util', () => ({
  extractTokenFromHeader: vi.fn(),
  verifyToken: vi.fn(),
}));

const createResponse = () => {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res;
};

describe('auth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 and logs when token is missing', async () => {
    (extractTokenFromHeader as unknown as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const req: any = { headers: {}, path: '/protected', method: 'GET', requestId: 'req-1' };
    const res = createResponse();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(logger.warn).toHaveBeenCalledWith('Authentication failed: missing bearer token', expect.objectContaining({
      requestId: 'req-1',
      path: '/protected',
    }));
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches user and calls next when token is valid', async () => {
    (extractTokenFromHeader as unknown as ReturnType<typeof vi.fn>).mockReturnValue('token');
    (verifyToken as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      userId: 42,
      email: 'user@test.com',
      roles: ['ADMIN'],
    });
    const req: any = { headers: {}, path: '/protected', method: 'GET', requestId: 'req-2', tenantId: 1 };
    const res = createResponse();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(req.user).toEqual(expect.objectContaining({ userId: 42 }));
    expect(logger.info).toHaveBeenCalledWith('Authentication succeeded', expect.objectContaining({
      requestId: 'req-2',
      userId: 42,
    }));
    expect(next).toHaveBeenCalled();
  });

  it('returns 401 and logs when token verification fails', async () => {
    (extractTokenFromHeader as unknown as ReturnType<typeof vi.fn>).mockReturnValue('token');
    (verifyToken as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('bad token');
    });
    const req: any = { headers: {}, path: '/protected', method: 'GET', requestId: 'req-3' };
    const res = createResponse();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(logger.warn).toHaveBeenCalledWith('Authentication failed: invalid or expired token', expect.objectContaining({
      requestId: 'req-3',
      errorMessage: 'bad token',
    }));
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('optionalAuthenticate continues and attaches user when token is valid', async () => {
    (extractTokenFromHeader as unknown as ReturnType<typeof vi.fn>).mockReturnValue('token');
    (verifyToken as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      userId: 5,
      email: 'user@test.com',
      roles: ['CUSTOMER'],
    });
    const req: any = { headers: {}, path: '/public', method: 'GET', requestId: 'req-4', tenantId: 1 };
    const next = vi.fn();

    await optionalAuthenticate(req, {} as any, next);

    expect(req.user).toEqual(expect.objectContaining({ userId: 5 }));
    expect(logger.debug).toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('optionalAuthenticate logs invalid token and continues without user', async () => {
    (extractTokenFromHeader as unknown as ReturnType<typeof vi.fn>).mockReturnValue('token');
    (verifyToken as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('expired');
    });
    const req: any = { headers: {}, path: '/public', method: 'GET', requestId: 'req-5' };
    const next = vi.fn();

    await optionalAuthenticate(req, {} as any, next);

    expect(logger.warn).toHaveBeenCalledWith('Optional authentication ignored invalid token', expect.objectContaining({
      requestId: 'req-5',
      errorMessage: 'expired',
    }));
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('rejects a token minted for another tenant', async () => {
    (extractTokenFromHeader as unknown as ReturnType<typeof vi.fn>).mockReturnValue('token');
    (verifyToken as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      userId: 1, username: 'u', tenantId: 99, roles: [],
    });
    const req: any = { headers: { authorization: 'Bearer x' }, tenantId: 1, path: '/', method: 'GET' };
    const res = createResponse();
    const next = vi.fn();
    await authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
