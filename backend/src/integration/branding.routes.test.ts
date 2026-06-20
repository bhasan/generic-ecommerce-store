import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../middleware/error.middleware';

const verifyToken = vi.hoisted(() => vi.fn());
const extractTokenFromHeader = vi.hoisted(() =>
  vi.fn((header?: string) => {
    if (!header?.startsWith('Bearer ')) return null;
    return header.slice('Bearer '.length);
  })
);

const brandingService = vi.hoisted(() => ({
  getBranding: vi.fn(),
  updateBranding: vi.fn(),
  generateCssBlock: vi.fn(),
}));

vi.mock('../utils/jwt.util', () => ({ verifyToken, extractTokenFromHeader }));
vi.mock('../services/branding.service', () => ({
  BrandingService: vi.fn(() => brandingService),
}));

const DEFAULT_BRANDING = {
  storeName: '',
  tagline: '',
  logoUrl: '',
  heroImageUrl: '',
  faviconUrls: { '16': '', '32': '', '180': '' },
  palette: 'purple-dark',
  customColors: null,
};

const createServer = async () => {
  const { default: brandingRoutes } = await import('../routes/branding.routes');
  const { brandingController } = await import('../controllers/branding.controller');

  const app = express();
  app.use(express.json());
  app.use((_req, _res, next) => { (_req as any).requestId = 'req-branding'; next(); });

  app.get('/api/branding/css', brandingController.getCss.bind(brandingController));
  app.use('/api/branding', brandingRoutes);
  app.use(errorHandler);
  return app.listen(0);
};

const rawRequest = async (
  server: ReturnType<typeof express.application.listen>,
  path: string,
  init?: RequestInit
) => {
  const { port } = server.address() as AddressInfo;
  return fetch(`http://127.0.0.1:${port}${path}`, init);
};

const requestJson = async (
  server: ReturnType<typeof express.application.listen>,
  path: string,
  init?: RequestInit
) => {
  const response = await rawRequest(server, path, init);
  const body = await response.json();
  return { response, body };
};

describe('branding routes integration', () => {
  let server: Awaited<ReturnType<typeof createServer>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    brandingService.getBranding.mockResolvedValue(DEFAULT_BRANDING);
    brandingService.generateCssBlock.mockResolvedValue(':root {}');
    server = await createServer();
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // ── Public CSS endpoint ─────────────────────────────────────────────────

  it('serves the CSS block publicly without any authentication', async () => {
    brandingService.generateCssBlock.mockResolvedValue(':root {\n  --color-primary: #7c3aed;\n}');

    const response = await rawRequest(server, '/api/branding/css');
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/css');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(text).toContain('--color-primary: #7c3aed');
  });

  it('returns an empty :root block when no custom colors are configured', async () => {
    const response = await rawRequest(server, '/api/branding/css');
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toBe(':root {}');
  });

  it('does not expose injection payloads: CSS endpoint forwards service output verbatim', async () => {
    // The service validates values at emit time (tested in branding.service.test.ts).
    // This test verifies the controller faithfully forwards whatever the service returns
    // and does not add any extra interpolation of its own.
    brandingService.generateCssBlock.mockResolvedValue(':root {\n  --color-primary: #2563eb;\n}');

    const response = await rawRequest(server, '/api/branding/css');
    const text = await response.text();

    expect(text).not.toContain('body');
    expect(text).not.toContain('display');
    expect(text).toContain('#2563eb');
  });

  // ── GET /api/branding ──────────────────────────────────────────────────

  it('returns 401 when no auth token is provided', async () => {
    const { response } = await requestJson(server, '/api/branding');

    expect(response.status).toBe(401);
    expect(brandingService.getBranding).not.toHaveBeenCalled();
  });

  it('returns 403 for a MANAGEMENT role on GET /api/branding', async () => {
    verifyToken.mockReturnValue({ userId: 5, username: 'manager', roles: ['MANAGEMENT'] });

    const { response } = await requestJson(server, '/api/branding', {
      headers: { Authorization: 'Bearer manager-token' },
    });

    expect(response.status).toBe(403);
    expect(brandingService.getBranding).not.toHaveBeenCalled();
  });

  it('returns the full branding object to an ADMIN user', async () => {
    verifyToken.mockReturnValue({ userId: 1, username: 'admin', roles: ['ADMIN'] });
    brandingService.getBranding.mockResolvedValue({ ...DEFAULT_BRANDING, storeName: 'Acme Shop', palette: 'blue-dark' });

    const { response, body } = await requestJson(server, '/api/branding', {
      headers: { Authorization: 'Bearer admin-token' },
    });

    expect(response.status).toBe(200);
    expect(body.storeName).toBe('Acme Shop');
    expect(body.palette).toBe('blue-dark');
    expect(body.faviconUrls).toEqual({ '16': '', '32': '', '180': '' });
  });

  // ── PUT /api/branding ──────────────────────────────────────────────────

  it('returns 403 for a non-admin role on PUT /api/branding', async () => {
    verifyToken.mockReturnValue({ userId: 10, username: 'employee', roles: ['EMPLOYEE'] });

    const { response } = await requestJson(server, '/api/branding', {
      method: 'PUT',
      headers: { Authorization: 'Bearer employee-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeName: 'Hacked' }),
    });

    expect(response.status).toBe(403);
    expect(brandingService.updateBranding).not.toHaveBeenCalled();
  });

  it('updates branding and returns the saved result to an ADMIN user', async () => {
    verifyToken.mockReturnValue({ userId: 1, username: 'admin', roles: ['ADMIN'] });
    const saved = { ...DEFAULT_BRANDING, storeName: 'New Store', tagline: 'Fresh start', palette: 'green-dark' };
    brandingService.updateBranding.mockResolvedValue(saved);

    const { response, body } = await requestJson(server, '/api/branding', {
      method: 'PUT',
      headers: { Authorization: 'Bearer admin-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeName: 'New Store', tagline: 'Fresh start', palette: 'green-dark' }),
    });

    expect(response.status).toBe(200);
    expect(body.message).toBe('Branding updated successfully');
    expect(body.branding.storeName).toBe('New Store');
    expect(body.branding.tagline).toBe('Fresh start');
    expect(brandingService.updateBranding).toHaveBeenCalledWith({
      storeName: 'New Store',
      tagline: 'Fresh start',
      palette: 'green-dark',
    });
  });

  it('surfaces service errors through the global error handler', async () => {
    verifyToken.mockReturnValue({ userId: 1, username: 'admin', roles: ['ADMIN'] });
    brandingService.updateBranding.mockRejectedValue(new Error('DB unavailable'));

    const { response, body } = await requestJson(server, '/api/branding', {
      method: 'PUT',
      headers: { Authorization: 'Bearer admin-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeName: 'x' }),
    });

    expect(response.status).toBe(500);
    expect(body.error).toBeDefined();
  });
});
