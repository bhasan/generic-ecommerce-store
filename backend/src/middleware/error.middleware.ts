import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { AppError } from '../utils/appError';

// Re-export so existing `import { AppError } from '.../middleware/error.middleware'`
// call sites keep working unchanged. `AppError` now lives in the pure
// `../utils/appError` module (no express coupling) — see that file for why.
export { AppError } from '../utils/appError';

/**
 * Global error handling middleware
 */
export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const requestId = req.requestId || 'unknown';
  const userId = req.user?.userId || 'anonymous';
  const userRoles = req.user?.roles || [];
  
  // Multer errors (file upload)
  const multerErr = err as Error & { code?: string };
  if (multerErr.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({
      error: { message: 'File too large. Maximum size is 50MB.', code: 'FILE_TOO_LARGE', requestId },
    });
    return;
  }
  if (multerErr.code === 'LIMIT_UNEXPECTED_FILE') {
    res.status(400).json({
      error: { message: 'Unexpected file field. Use "file" as the field name.', code: 'INVALID_FIELD', requestId },
    });
    return;
  }
  if (err.message === 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP, MP4, WebM.') {
    res.status(400).json({
      error: { message: err.message, code: 'INVALID_FILE_TYPE', requestId },
    });
    return;
  }

  if (err instanceof AppError) {
    logger.error('API Error', err, {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: err.statusCode,
      errorCode: err.code,
      userId,
      userRoles,
    });
    
    res.status(err.statusCode).json({
      error: {
        message: err.message,
        code: err.code,
        requestId,
      },
    });
    return;
  }

  // Unhandled errors
  logger.error('Unhandled API Error', err, {
    requestId,
    method: req.method,
    path: req.path,
    statusCode: 500,
    errorCode: 'INTERNAL_ERROR',
    userId,
    userRoles,
  });

  res.status(500).json({
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      requestId,
    },
  });
};

/**
 * 404 Not Found handler
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  const requestId = req.requestId || 'unknown';
  logger.warn('Route not found', {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip || req.socket.remoteAddress,
    requestId,
  });
  
  res.status(404).json({
    error: {
      message: 'Route not found',
      code: 'NOT_FOUND',
      requestId,
    },
    path: req.originalUrl,
  });
};
