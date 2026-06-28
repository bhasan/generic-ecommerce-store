import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authorize } from './role.middleware';
import { logger } from '../utils/logger';

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

describe('role middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when user is missing', () => {
    const middleware = authorize('ADMIN');
    const req: any = { path: '/admin', method: 'GET', requestId: 'req-1' };
    const res = createResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(logger.warn).toHaveBeenCalledWith('Authorization failed: missing authenticated user', expect.any(Object));
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when user lacks required role', () => {
    const middleware = authorize('ADMIN');
    const req: any = {
      path: '/admin',
      method: 'GET',
      requestId: 'req-2',
      user: { userId: 10, roles: ['CUSTOMER'] },
    };
    const res = createResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(logger.warn).toHaveBeenCalledWith('Authorization failed: insufficient permissions', expect.objectContaining({
      requestId: 'req-2',
      userId: 10,
      currentRoles: ['CUSTOMER'],
      requiredRoles: ['ADMIN'],
    }));
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when user has required role', () => {
    const middleware = authorize('ADMIN');
    const req: any = {
      path: '/admin',
      method: 'GET',
      requestId: 'req-3',
      user: { userId: 10, roles: ['ADMIN'] },
    };
    const res = createResponse();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('accepts a tenant-wide role for any store and rejects a wrong-store role', () => {
    const middleware = authorize('MANAGEMENT');

    // tenant-wide ADMIN passes
    const reqAdmin: any = { user: { roles: [{ name: 'ADMIN', storeId: null }] }, store: { id: 5 }, path: '/', method: 'GET' };
    const mwAdmin = authorize('ADMIN');
    const res1 = createResponse();
    const next1 = vi.fn();
    mwAdmin(reqAdmin, res1, next1);
    expect(next1).toHaveBeenCalled();

    // MANAGEMENT scoped to store 9 fails on store 5
    const reqMgr: any = { user: { roles: [{ name: 'MANAGEMENT', storeId: 9 }] }, store: { id: 5 }, path: '/', method: 'GET' };
    const res2 = createResponse();
    const next2 = vi.fn();
    middleware(reqMgr, res2, next2);
    expect(next2).not.toHaveBeenCalled();
    expect(res2.status).toHaveBeenCalledWith(403);
  });
});
