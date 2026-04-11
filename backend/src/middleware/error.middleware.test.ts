import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from './error.middleware';

const createResponse = () => {
  const response: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return response;
};

describe('errorHandler upload errors', () => {
  it('returns a 400 with the configured 50MB file-size message', () => {
    const req: any = {
      requestId: 'req-test',
      user: { userId: 7, roles: ['ADMIN'] },
      method: 'POST',
      path: '/api/upload',
    };
    const res = createResponse();

    errorHandler({ code: 'LIMIT_FILE_SIZE', message: 'too large' } as any, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        message: 'File too large. Maximum size is 50MB.',
        code: 'FILE_TOO_LARGE',
        requestId: 'req-test',
      },
    });
  });

  it('returns a 400 for invalid upload file types', () => {
    const req: any = {
      requestId: 'req-test',
      user: { userId: 7, roles: ['ADMIN'] },
      method: 'POST',
      path: '/api/upload',
    };
    const res = createResponse();

    errorHandler(
      new Error('Invalid file type. Allowed: JPEG, PNG, GIF, WebP, MP4, WebM.'),
      req,
      res,
      vi.fn()
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        message: 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP, MP4, WebM.',
        code: 'INVALID_FILE_TYPE',
        requestId: 'req-test',
      },
    });
  });
});
