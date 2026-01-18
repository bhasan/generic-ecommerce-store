import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Custom error class
 */
export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  code: string;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

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
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
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
    ...(process.env.NODE_ENV === 'development' && { 
      message: err.message,
      stack: err.stack 
    })
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
