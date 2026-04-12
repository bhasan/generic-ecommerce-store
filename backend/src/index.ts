import express, { Application } from 'express';
import path from 'path';
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
import notificationRoutes from './routes/notification.routes';
import uploadRoutes from './routes/upload.routes';
import paymentSettingsRoutes from './routes/paymentSettings.routes';
import storeSettingsRoutes from './routes/storeSettings.routes';
import orderingConstraintsRoutes from './routes/orderingConstraints.routes';
import landingPageSettingsRoutes from './routes/landingPageSettings.routes';
import creditRoutes from './routes/credit.routes';

// Import middleware
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { requestLogger } from './middleware/logger.middleware';

// Load environment variables
dotenv.config();

const app: Application = express();
app.set('trust proxy', 1); // Trust Nginx reverse proxy so rate limiter uses real client IPs
const PORT = process.env.PORT || 3000;
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10);

// ========================================
// SECURITY MIDDLEWARE
// ========================================

// Helmet helps secure Express apps by setting various HTTP headers
app.use(helmet());

// Validate CORS origin
const corsOrigin = process.env.CORS_ORIGIN;
if (!corsOrigin || corsOrigin === '*') {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: CORS_ORIGIN must be set to a specific domain in production (not *)');
  }
  console.warn('[WARN] CORS_ORIGIN is wildcard — acceptable for development only');
}

// Enable CORS for all routes
app.use(cors({
  origin: corsOrigin || '*',
  credentials: true,
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

import { DEFAULT_TAX_RATE } from './constants/settings';
import { PaymentSettingsService } from './services/paymentSettings.service';
import { StoreSettingsService } from './services/storeSettings.service';
import { OrderingConstraintsService } from './services/orderingConstraints.service';

const paymentSettingsService = new PaymentSettingsService();
const storeSettingsService = new StoreSettingsService();
const orderingConstraintsService = new OrderingConstraintsService();

// Config check route
app.get('/api/config', async (_req, res) => {
  const [paymentSettings, storeSettings, orderingConstraints] = await Promise.all([
    paymentSettingsService.getPaymentSettings(),
    storeSettingsService.getStoreSettings(),
    orderingConstraintsService.getOrderingConstraints(),
  ]);
  res.json({
    taxRate: DEFAULT_TAX_RATE,
    minimumDeliveryOrder: orderingConstraints.minimumDeliveryOrder,
      minimumDeliveryOrderEnabled: orderingConstraints.minimumDeliveryOrderEnabled,
      deliveryDisabled: orderingConstraints.deliveryDisabled,
      deliveryDisabledMessage: orderingConstraints.deliveryDisabledMessage,
      deliveryRadiusMiles: orderingConstraints.deliveryRadiusMiles,
      pickupLocation: storeSettings.address,
    storeCashappUsername: paymentSettings.cashapp?.handle || '',
    paymentSettings,
    storeSettings,
  });
});

// Serve uploaded files (must be before /api routes so /api/uploads is not caught by other routes)
app.use('/api/uploads', express.static(path.join(process.cwd(), 'uploads')));

// API routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/upload', generalLimiter, uploadRoutes);
app.use('/api/products', generalLimiter, productRoutes);
app.use('/api/categories', generalLimiter, categoryRoutes);
app.use('/api/orders', generalLimiter, orderRoutes);
app.use('/api/users', generalLimiter, userRoutes);
app.use('/api/announcements', generalLimiter, announcementRoutes);
app.use('/api/contact', generalLimiter, contactRoutes);
app.use('/api/notifications', generalLimiter, notificationRoutes);
app.use('/api/payment-settings', generalLimiter, paymentSettingsRoutes);
app.use('/api/store-settings', generalLimiter, storeSettingsRoutes);
app.use('/api/ordering-constraints', generalLimiter, orderingConstraintsRoutes);
app.use('/api/landing-page-settings', generalLimiter, landingPageSettingsRoutes);
app.use('/api/credits', generalLimiter, creditRoutes);

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

// Validates production-only env requirements before startup and keeps wildcard CORS out of prod.
function validateProductionEnv() {
  if (process.env.NODE_ENV !== 'production') return;
  const required = ['JWT_SECRET', 'CORS_ORIGIN', 'DATABASE_URL'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`FATAL: Missing required environment variables: ${missing.join(', ')}`);
  }
  if (process.env.CORS_ORIGIN === '*') {
    throw new Error('FATAL: CORS_ORIGIN must not be wildcard (*) in production');
  }
}

validateProductionEnv();

// Starts the Express app with the configured port, which defaults to 3000 when PORT is unset.
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
