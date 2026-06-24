import express, { Application } from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import prisma from './config/database';
import { logger } from './utils/logger';

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
import printJobRoutes from './routes/printJob.routes';
import reportingRoutes from './routes/reporting.routes';
import { DEFAULT_TAX_RATE } from './constants/settings';
import { PaymentSettingsService } from './services/paymentSettings.service';
import { StoreSettingsService } from './services/storeSettings.service';
import { OrderingConstraintsService } from './services/orderingConstraints.service';
import { BrandingService } from './services/branding.service';
import { brandingController } from './controllers/branding.controller';
import { asyncHandler } from './utils/asyncHandler.util';
import brandingRoutes from './routes/branding.routes';
import { parsePositiveInt } from './utils/request.util';

// Import middleware
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { requestLogger } from './middleware/logger.middleware';
import { metricsMiddleware } from './middleware/metrics.middleware';
import { serializeDecimal } from './middleware/serializeDecimal.middleware';
import { authLimiter, generalLimiter, readWriteLimiter } from './middleware/rateLimit.middleware';
import metricsRoute from './routes/metrics';

// Load environment variables
dotenv.config();

const app: Application = express();
const trustProxyHops = parsePositiveInt(process.env.TRUST_PROXY_HOPS, 1);
app.set('trust proxy', trustProxyHops);
const PORT = process.env.PORT || 3000;
const REQUEST_TIMEOUT_MS = parsePositiveInt(process.env.REQUEST_TIMEOUT_MS, 30000);

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

// Prometheus metrics collection (before requestLogger so every request is counted)
app.use(metricsMiddleware);

// Request logging (must be after body parsing to capture request body)
app.use(requestLogger);

// Convert Prisma Decimal money fields to numbers in every JSON response
app.use(serializeDecimal);

// ========================================
// ROUTES
// ========================================

// Metrics endpoint (internal only — not proxied by Nginx)
app.use('/metrics', metricsRoute);

// Health check route
app.get('/api/health', async (req, res) => {
  const timestamp = new Date().toISOString();
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      message: 'Backend API is running!',
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
      message: 'Backend API is running with degraded dependencies.',
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

const paymentSettingsService = new PaymentSettingsService();
const storeSettingsService = new StoreSettingsService();
const orderingConstraintsService = new OrderingConstraintsService();
const brandingService = new BrandingService();

// Config check route
app.get('/api/config', asyncHandler(async (_req, res) => {
  const [paymentSettings, storeSettings, orderingConstraints, branding] = await Promise.all([
    paymentSettingsService.getPaymentSettings(),
    storeSettingsService.getStoreSettings(),
    orderingConstraintsService.getOrderingConstraints(),
    brandingService.getBranding(),
  ]);
  res.setHeader('Cache-Control', 'public, max-age=30, must-revalidate');
  res.json({
    taxRate: DEFAULT_TAX_RATE,
    minimumDeliveryOrder: orderingConstraints.minimumDeliveryOrder,
      minimumDeliveryOrderEnabled: orderingConstraints.minimumDeliveryOrderEnabled,
      deliveryDisabled: orderingConstraints.deliveryDisabled,
      deliveryDisabledMessage: orderingConstraints.deliveryDisabledMessage,
      deliveryRadiusMiles: orderingConstraints.deliveryRadiusMiles,
      pickupLocation: storeSettings.address,
    storeCashappUsername: paymentSettings.cashapp?.handle || '',
    paymentSettings: {
      ...paymentSettings,
      // Strip server-side credentials — only the enabled flag is needed by the frontend
      cc_payment: { enabled: paymentSettings.cc_payment.enabled },
    },
    storeSettings,
    branding,
  });
}));

app.get('/api/branding/css', generalLimiter, brandingController.getCss);

// Serve uploaded files (must be before /api routes so /api/uploads is not caught by other routes)
app.use('/api/uploads', express.static(path.join(process.cwd(), 'uploads'), {
  maxAge: '30d',
  immutable: true, // filename includes timestamp, so content never changes
}));

// API routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/upload', generalLimiter, uploadRoutes);
app.use('/api/products', generalLimiter, productRoutes);
app.use('/api/categories', generalLimiter, categoryRoutes);
app.use('/api/orders', readWriteLimiter, orderRoutes);
app.use('/api/users', generalLimiter, userRoutes);
app.use('/api/announcements', generalLimiter, announcementRoutes);
app.use('/api/contact', readWriteLimiter, contactRoutes);
app.use('/api/notifications', readWriteLimiter, notificationRoutes);
app.use('/api/payment-settings', generalLimiter, paymentSettingsRoutes);
app.use('/api/store-settings', generalLimiter, storeSettingsRoutes);
app.use('/api/ordering-constraints', generalLimiter, orderingConstraintsRoutes);
app.use('/api/landing-page-settings', generalLimiter, landingPageSettingsRoutes);
app.use('/api/branding', generalLimiter, brandingRoutes);
app.use('/api/storecredit', generalLimiter, creditRoutes);
app.use('/api/print-jobs', readWriteLimiter, printJobRoutes);
app.use('/api/reporting/v1', reportingRoutes);

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
  logger.info('Proxy trust configured', {
    trustProxyHops: app.get('trust proxy'),
  });
  console.log('========================================');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
  console.log('========================================');
});

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
