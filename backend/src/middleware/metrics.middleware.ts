import { Request, Response, NextFunction } from 'express';
import { Counter, Histogram, register, collectDefaultMetrics } from 'prom-client';

collectDefaultMetrics({ register });

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// Normalize Express route path — strips IDs so /api/orders/123 becomes /api/orders/:id
function normalizeRoute(req: Request): string {
  return req.route?.path
    ? `${req.baseUrl}${req.route.path}`
    : req.path.replace(/\/\d+/g, '/:id');
}

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const end = httpRequestDuration.startTimer();

  res.on('finish', () => {
    const route = normalizeRoute(req);
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };
    end(labels);
    httpRequestsTotal.inc(labels);
  });

  next();
};

export { register };
