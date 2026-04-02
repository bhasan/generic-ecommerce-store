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
});
