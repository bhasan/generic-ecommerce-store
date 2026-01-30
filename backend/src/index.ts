import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import prisma from './config/database';

// Import routes
import authRoutes from './routes/auth.routes';
import productRoutes from './routes/product.routes';
import orderRoutes from './routes/order.routes';
import userRoutes from './routes/user.routes';
import announcementRoutes from './routes/announcement.routes';
import categoryRoutes from './routes/category.routes';
import contactRoutes from './routes/contact.routes';

// Import middleware
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { requestLogger } from './middleware/logger.middleware';

// Load environment variables
dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 3000;
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10);

// ========================================
// SECURITY MIDDLEWARE
// ========================================

// Helmet helps secure Express apps by setting various HTTP headers
app.use(helmet());

// Enable CORS for all routes
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

// Rate limiting for authentication routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '20', 10), // Limit each IP to 20 requests per windowMs (configurable via env)
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (_req) => {
    // Skip rate limiting in development mode
    return process.env.NODE_ENV === 'development';
  },
});

// General rate limiter
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  skip: (_req) => {
    // Skip rate limiting in development mode
    return process.env.NODE_ENV === 'development';
  },
});

// ========================================
// BODY PARSING MIDDLEWARE
// ========================================

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ========================================
// TIMEOUT SAFETY
// ========================================

app.use((req, res, next) => {
  req.setTimeout(REQUEST_TIMEOUT_MS);
  res.setTimeout(REQUEST_TIMEOUT_MS, () => {
    if (res.headersSent) {
      return;
    }
    res.status(503).json({
      error: {
        message: 'Request timeout',
        code: 'REQUEST_TIMEOUT',
        requestId: req.requestId || 'unknown',
      },
    });
  });
  next();
});

// ========================================
// LOGGING MIDDLEWARE
// ========================================

// Request logging (must be after body parsing to capture request body)
app.use(requestLogger);

// ========================================
// ROUTES
// ========================================

// Health check route
app.get('/api/health', async (req, res) => {
  const timestamp = new Date().toISOString();
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      message: 'Smoke Station Backend API is running!',
      timestamp,
      environment: process.env.NODE_ENV || 'development',
      checks: {
        database: 'ok',
      },
      requestId: req.requestId || 'unknown',
    });
  } catch (error) {
    res.status(503).json({
      status: 'degraded',
      message: 'Smoke Station Backend API is running with degraded dependencies.',
      timestamp,
      environment: process.env.NODE_ENV || 'development',
      checks: {
        database: 'error',
      },
      requestId: req.requestId || 'unknown',
      error: process.env.NODE_ENV === 'development'
        ? { message: (error as Error).message }
        : undefined,
    });
  }
});

// API routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/products', generalLimiter, productRoutes);
app.use('/api/categories', generalLimiter, categoryRoutes);
app.use('/api/orders', generalLimiter, orderRoutes);
app.use('/api/users', generalLimiter, userRoutes);
app.use('/api/announcements', generalLimiter, announcementRoutes);
app.use('/api/contact', generalLimiter, contactRoutes);

// ========================================
// ERROR HANDLING
// ========================================

// 404 handler (must be after all routes)
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// ========================================
// SERVER START
// ========================================

app.listen(PORT, () => {
  console.log('========================================');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
  console.log('========================================');
});

import { logger } from './utils/logger';

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', reason instanceof Error ? reason : new Error(String(reason)), {
    promise: String(promise),
  });
  // In production, you might want to exit the process
  // process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', error);
  // In production, you should exit the process
  process.exit(1);
});

export default app;
