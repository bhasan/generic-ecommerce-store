import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Custom error class
 */
export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
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
  const requestId = (req as any).requestId || 'unknown';
  
  if (err instanceof AppError) {
    logger.error('API Error', err, {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: err.statusCode,
      userId: (req as any).user?.userId || 'anonymous',
      userRoles: (req as any).user?.roles || [],
    });
    
    res.status(err.statusCode).json({
      error: err.message,
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
    userId: (req as any).user?.userId || 'anonymous',
    userRoles: (req as any).user?.roles || [],
  });

  res.status(500).json({
    error: 'Internal server error',
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
  logger.warn('Route not found', {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip || req.socket.remoteAddress,
  });
  
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  });
};
