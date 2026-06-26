import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError, errorHandler } from '../middleware/error.middleware';

const verifyToken = vi.hoisted(() => vi.fn());
const extractTokenFromHeader = vi.hoisted(() => vi.fn((header?: string) => {
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
}));
const logger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
const productService = vi.hoisted(() => ({
  getAllProducts: vi.fn(),
  getProductById: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
}));
const uploadController = vi.hoisted(() => ({
  uploadImage: vi.fn((req, res) => res.status(201).json({ url: `/api/uploads/${req.file?.filename || 'mock-upload.webp'}` })),
  uploadImages: vi.fn((req, res) =>
    res.status(201).json({ urls: (req.files || []).map((file: any) => `/api/uploads/${file.filename}`) })
  ),
  getImages: vi.fn((_req, res) => res.status(200).json({ images: [{ filename: 'existing.webp', url: '/api/uploads/existing.webp' }] })),
  deleteImage: vi.fn((_req, res) => res.status(200).json({ message: 'Image deleted successfully' })),
  importZip: vi.fn((_req, res) => res.status(200).json({ imported: 2, skipped: 1 })),
  uploadFavicon: vi.fn((_req, res) => res.status(201).json({ urls: { '16': '/api/uploads/favicon-16.png', '32': '/api/uploads/favicon-32.png', '180': '/api/uploads/favicon-180.png' } })),
}));
const upload = vi.hoisted(() => ({
  single: vi.fn(() => (req: any, _res: any, next: any) => {
    req.file = { filename: 'single-upload.webp', mimetype: 'image/webp' };
    next();
  }),
  array: vi.fn(() => (req: any, _res: any, next: any) => {
    req.files = [
      { filename: 'upload-one.webp', mimetype: 'image/webp' },
      { filename: 'upload-two.webp', mimetype: 'image/webp' },
    ];
    next();
  }),
}));

// memUpload mock — used by the import-zip route (multer.memoryStorage())
const multerMock = vi.hoisted(() => {
  const instance = {
    single: vi.fn(() => (req: any, _res: any, next: any) => {
      req.file = { buffer: Buffer.from('fake-zip'), originalname: 'export.zip', mimetype: 'application/zip' };
      next();
    }),
  };
  const fn = vi.fn(() => instance) as any;
  fn.memoryStorage = vi.fn(() => ({}));
  return fn;
});

vi.mock('../utils/jwt.util', () => ({
  verifyToken,
  extractTokenFromHeader,
}));

vi.mock('../utils/logger', () => ({
  logger,
}));

vi.mock('../services/product.service', () => ({
  default: productService,
}));

vi.mock('../controllers/upload.controller', () => ({
  default: uploadController,
}));

vi.mock('../config/multer', () => ({
  upload,
}));

vi.mock('multer', () => ({
  default: multerMock,
}));

const createServer = async () => {
  const { default: productRoutes } = await import('../routes/product.routes');
  const { default: uploadRoutes } = await import('../routes/upload.routes');

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.requestId = 'req-media';
    next();
  });
  app.use('/api/products', productRoutes);
  app.use('/api/upload', uploadRoutes);
  app.use(errorHandler);
  return app.listen(0);
};

const requestJson = async (server: ReturnType<typeof express.application.listen>, path: string, init?: RequestInit) => {
  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}${path}`, init);
  const body = await response.json();
  return { response, body };
};

describe('media routes integration', () => {
  let server: Awaited<ReturnType<typeof createServer>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = await createServer();
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  it('allows public product listing when no auth token is present', async () => {
    productService.getAllProducts.mockResolvedValue([{ id: 1, name: 'Visible Product' }]);

    const { response, body } = await requestJson(server, '/api/products');

    expect(response.status).toBe(200);
    expect(body).toEqual([{ id: 1, name: 'Visible Product' }]);
    expect(productService.getAllProducts).toHaveBeenCalledWith(undefined, 500, 0);
  });

  it('forwards limit and offset query params to the product service', async () => {
    productService.getAllProducts.mockResolvedValue([]);

    const { response } = await requestJson(server, '/api/products?limit=10&offset=20');

    expect(response.status).toBe(200);
    expect(productService.getAllProducts).toHaveBeenCalledWith(undefined, 10, 20);
  });

  it('ignores invalid optional auth tokens on product routes and still serves public data', async () => {
    extractTokenFromHeader.mockReturnValue('broken-token');
    verifyToken.mockImplementation(() => {
      throw new Error('bad token');
    });
    productService.getProductById.mockResolvedValue({ id: 44, name: 'Public Product' });

    const { response, body } = await requestJson(server, '/api/products/44', {
      headers: { Authorization: 'Bearer broken-token' },
    });

    expect(response.status).toBe(200);
    expect(body).toEqual({ id: 44, name: 'Public Product' });
    expect(logger.warn).toHaveBeenCalledWith('Optional authentication ignored invalid token', expect.objectContaining({
      requestId: 'req-media',
      path: '/44',
    }));
  });

  it('surfaces hidden/media product access errors through the global handler', async () => {
    productService.getProductById.mockRejectedValue(new AppError('Product not found', 404, 'INTERNAL_ERROR'));

    const { response, body } = await requestJson(server, '/api/products/77');

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: {
        message: 'Product not found',
        code: 'INTERNAL_ERROR',
        requestId: 'req-media',
      },
    });
  });

  it('requires management-or-admin access for media uploads', async () => {
    verifyToken.mockReturnValue({ userId: 10, username: 'employee-one', roles: ['EMPLOYEE'] });

    const { response, body } = await requestJson(server, '/api/upload', {
      method: 'POST',
      headers: { Authorization: 'Bearer employee-token' },
    });

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: 'Access denied. Insufficient permissions.',
      required: ['MANAGEMENT', 'ADMIN'],
      current: ['EMPLOYEE'],
    });
    expect(uploadController.uploadImage).not.toHaveBeenCalled();
  });

  it('runs the single-upload route through auth, role checks, and upload middleware', async () => {
    verifyToken.mockReturnValue({ userId: 3, username: 'manager-one', roles: ['MANAGEMENT'] });

    const { response, body } = await requestJson(server, '/api/upload', {
      method: 'POST',
      headers: { Authorization: 'Bearer manager-token' },
    });

    expect(response.status).toBe(201);
    expect(body).toEqual({ url: '/api/uploads/single-upload.webp' });
    expect(uploadController.uploadImage).toHaveBeenCalled();
  });

  it('runs the multi-upload route through auth, role checks, and upload middleware', async () => {
    verifyToken.mockReturnValue({ userId: 1, username: 'admin-one', roles: ['ADMIN'] });

    const { response, body } = await requestJson(server, '/api/upload/multiple', {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token' },
    });

    expect(response.status).toBe(201);
    expect(body).toEqual({
      urls: ['/api/uploads/upload-one.webp', '/api/uploads/upload-two.webp'],
    });
    expect(uploadController.uploadImages).toHaveBeenCalled();
  });

  it('enforces product media mutation validation before calling the product service', async () => {
    verifyToken.mockReturnValue({ userId: 3, username: 'manager-one', roles: ['MANAGEMENT'] });

    const { response, body } = await requestJson(server, '/api/products', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer manager-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Missing Variants Product',
        categoryId: 2,
        // variants array is required — omitting it triggers the validator
      }),
    });

    expect(response.status).toBe(400);
    expect(body.errors[0].msg).toBe('At least one variant is required');
    expect(productService.createProduct).not.toHaveBeenCalled();
  });

  it('allows management users to create products with media payload fields', async () => {
    verifyToken.mockReturnValue({ userId: 3, username: 'manager-one', roles: ['MANAGEMENT'] });
    productService.createProduct.mockResolvedValue({ id: 88, name: 'Media Product' });

    const payload = {
      name: 'Media Product',
      categoryId: 2,
      variants: [{ label: 'Default', basePrice: 12, stock: 0, stockEnabled: false, isDefault: true, active: true, pricingMode: 'UNIT', quantityOptions: [], priceBreaks: [] }],
      images: [
        { url: '/api/uploads/thumb.webp', role: 'THUMBNAIL', sortOrder: 0 },
        { url: '/api/uploads/gallery.webp', role: 'GALLERY', sortOrder: 1 },
      ],
    };

    const { response, body } = await requestJson(server, '/api/products', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer manager-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(201);
    expect(body).toEqual({
      message: 'Product created successfully',
      product: { id: 88, name: 'Media Product' },
    });
    expect(productService.createProduct).toHaveBeenCalledWith(payload);
  });

  it('allows management users to create products without an image field when no gallery image exists', async () => {
    verifyToken.mockReturnValue({ userId: 3, username: 'manager-one', roles: ['MANAGEMENT'] });
    productService.createProduct.mockResolvedValue({ id: 89, name: 'Thumbnail Only Product' });

    const payload = {
      name: 'Thumbnail Only Product',
      categoryId: 2,
      variants: [{ label: 'Default', basePrice: 12, stock: 0, stockEnabled: false, isDefault: true, active: true, pricingMode: 'UNIT', quantityOptions: [], priceBreaks: [] }],
      images: [{ url: '/api/uploads/thumb.webp', role: 'THUMBNAIL', sortOrder: 0 }],
    };

    const { response, body } = await requestJson(server, '/api/products', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer manager-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(201);
    expect(body).toEqual({
      message: 'Product created successfully',
      product: { id: 89, name: 'Thumbnail Only Product' },
    });
    expect(productService.createProduct).toHaveBeenCalledWith(payload);
  });

  it('requires management-or-admin access for ZIP import', async () => {
    verifyToken.mockReturnValue({ userId: 10, username: 'employee-one', roles: ['EMPLOYEE'] });

    const { response, body } = await requestJson(server, '/api/upload/import-zip', {
      method: 'POST',
      headers: { Authorization: 'Bearer employee-token' },
    });

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: 'Access denied. Insufficient permissions.',
      required: ['MANAGEMENT', 'ADMIN'],
      current: ['EMPLOYEE'],
    });
    expect(uploadController.importZip).not.toHaveBeenCalled();
  });

  it('imports images from a ZIP file and returns imported/skipped counts', async () => {
    verifyToken.mockReturnValue({ userId: 3, username: 'manager-one', roles: ['MANAGEMENT'] });

    const { response, body } = await requestJson(server, '/api/upload/import-zip', {
      method: 'POST',
      headers: { Authorization: 'Bearer manager-token' },
    });

    expect(response.status).toBe(200);
    expect(body).toEqual({ imported: 2, skipped: 1 });
    expect(uploadController.importZip).toHaveBeenCalled();
  });
});
