/**
 * End-to-end round-trip test: Export Images ZIP → delete → Import Images ZIP.
 *
 * What is REAL (no mocks):
 *   - Express routing and middleware
 *   - productExport.service.ts (archiver, CSV building, file existence checks)
 *   - upload.controller.ts importZip (unzipper, fs.promises.writeFile)
 *   - Filesystem reads and writes against cwd()/uploads
 *
 * What is mocked:
 *   - Prisma (returns fixture products — no DB required)
 *   - JWT (every Bearer token resolves to a MANAGEMENT user)
 *   - Logger (suppress noise)
 *   - Sharp (imported by upload.controller but not used in the import path)
 */

import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import unzipper from 'unzipper';
import { errorHandler } from '../middleware/error.middleware';
import { setDefaultTenantId } from '../config/defaultTenant';

// ── Constants ────────────────────────────────────────────────────────────────

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

// Unique prefix so test files never collide with real uploads
const PREFIX = 'e2e-roundtrip-';
const FILE_A = `${PREFIX}alpha.webp`;
const FILE_B = `${PREFIX}beta.webp`;
const CONTENT_A = Buffer.from('fake-webp-alpha');
const CONTENT_B = Buffer.from('fake-webp-beta');

// ── Mocks ────────────────────────────────────────────────────────────────────

const verifyToken = vi.hoisted(() =>
  vi.fn(() => ({ userId: 1, username: 'manager', roles: ['MANAGEMENT'] }))
);
const extractTokenFromHeader = vi.hoisted(() =>
  vi.fn((header?: string) => (header?.startsWith('Bearer ') ? header.slice(7) : null))
);

const prismaMock = vi.hoisted(() => ({
  product: { findMany: vi.fn() },
  category: { findMany: vi.fn() },
}));

vi.mock('../utils/jwt.util', () => ({ verifyToken, extractTokenFromHeader }));
vi.mock('../config/database', () => ({ default: prismaMock, getTenantPrisma: () => prismaMock, getUnscopedPrisma: () => prismaMock }));
vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('sharp', () => ({ default: vi.fn() }));

// ── Server factory ────────────────────────────────────────────────────────────

const createServer = async () => {
  const { default: productRoutes } = await import('../routes/product.routes');
  const { default: uploadRoutes } = await import('../routes/upload.routes');

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.requestId = 'e2e'; next(); });
  app.use('/api/products', productRoutes);
  app.use('/api/upload', uploadRoutes);
  app.use(errorHandler);
  return app.listen(0);
};

const port = (server: ReturnType<typeof express.application.listen>) =>
  (server.address() as AddressInfo).port;

const closeServer = (server: ReturnType<typeof express.application.listen>) =>
  new Promise<void>((res, rej) => server.close((e) => (e ? rej(e) : res())));

// ── Helpers ───────────────────────────────────────────────────────────────────

const MGMT_HEADERS = { Authorization: 'Bearer manager-token' };

async function exportZip(baseUrl: string): Promise<Buffer> {
  const res = await fetch(`${baseUrl}/api/products/export-zip`, { headers: MGMT_HEADERS });
  expect(res.status).toBe(200);
  return Buffer.from(await res.arrayBuffer());
}

async function readZipEntries(zipBuf: Buffer): Promise<Map<string, Buffer>> {
  const dir = await unzipper.Open.buffer(zipBuf);
  const entries = new Map<string, Buffer>();
  for (const entry of dir.files) {
    if (entry.type === 'File') entries.set(entry.path, await entry.buffer());
  }
  return entries;
}

async function importZip(
  baseUrl: string,
  zipBuf: Buffer
): Promise<{ imported: number; skipped: number }> {
  const form = new FormData();
  form.append('file', new Blob([zipBuf], { type: 'application/zip' }), 'export.zip');
  const res = await fetch(`${baseUrl}/api/upload/import-zip`, {
    method: 'POST',
    headers: MGMT_HEADERS,
    body: form,
  });
  expect(res.status).toBe(200);
  const json = await res.json();
  return json.data ?? json;
}

// ── Fixture setup / teardown ──────────────────────────────────────────────────

beforeAll(async () => {
  await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.promises.writeFile(path.join(UPLOADS_DIR, FILE_A), CONTENT_A);
  await fs.promises.writeFile(path.join(UPLOADS_DIR, FILE_B), CONTENT_B);
});

afterAll(async () => {
  for (const file of [FILE_A, FILE_B]) {
    await fs.promises.unlink(path.join(UPLOADS_DIR, file)).catch(() => {});
  }
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('export / import round-trip', () => {
  let server: Awaited<ReturnType<typeof createServer>>;
  let baseUrl: string;
  let zipBuf: Buffer;

  beforeAll(async () => {
    setDefaultTenantId(1);
    // Two products — one with each test image as thumbnail
    prismaMock.product.findMany.mockResolvedValue([
      {
        id: 1, name: 'Alpha Product', slug: 'alpha-product', categoryId: 10, description: 'First product',
        images: [{ url: `/api/uploads/${FILE_A}`, role: 'THUMBNAIL', sortOrder: 0 }],
        variants: [{ basePrice: { toString: () => '9.99' }, stock: { toString: () => '5' }, stockEnabled: true, isDefault: true }],
      },
      {
        id: 2, name: 'Beta Product', slug: 'beta-product', categoryId: 10, description: null,
        images: [{ url: `/api/uploads/${FILE_B}`, role: 'THUMBNAIL', sortOrder: 0 }],
        variants: [{ basePrice: { toString: () => '14.99' }, stock: { toString: () => '0' }, stockEnabled: false, isDefault: true }],
      },
    ]);
    prismaMock.category.findMany.mockResolvedValue([
      { id: 10, name: 'Test Category' },
    ]);

    server = await createServer();
    baseUrl = `http://127.0.0.1:${port(server)}`;

    // Capture the ZIP once — shared across all tests in this suite
    zipBuf = await exportZip(baseUrl);
  });

  afterAll(() => closeServer(server));

  it('export ZIP contains products.csv and both image files', async () => {
    const entries = await readZipEntries(zipBuf);

    expect(entries.has('products.csv')).toBe(true);
    expect(entries.has(`images/${FILE_A}`)).toBe(true);
    expect(entries.has(`images/${FILE_B}`)).toBe(true);
  });

  it('image files in the ZIP match the original content exactly', async () => {
    const entries = await readZipEntries(zipBuf);

    expect(entries.get(`images/${FILE_A}`)).toEqual(CONTENT_A);
    expect(entries.get(`images/${FILE_B}`)).toEqual(CONTENT_B);
  });

  it('products.csv has the correct header', async () => {
    const entries = await readZipEntries(zipBuf);
    const csv = entries.get('products.csv')!.toString();
    const header = csv.split('\r\n')[0];

    expect(header).toBe(
      'id,name,slug,categoryName,price,description,stock,stockEnabled,thumbnail,images'
    );
  });

  it('products.csv rows contain bare filenames — no /api/uploads/ prefix', async () => {
    const entries = await readZipEntries(zipBuf);
    const csv = entries.get('products.csv')!.toString();

    expect(csv).not.toContain('/api/uploads/');
    expect(csv).toContain(FILE_A);
    expect(csv).toContain(FILE_B);
  });

  it('products.csv rows contain correct product data', async () => {
    const entries = await readZipEntries(zipBuf);
    const csv = entries.get('products.csv')!.toString();
    const lines = csv.split('\r\n').filter(Boolean);

    expect(lines[1]).toContain('Alpha Product');
    expect(lines[1]).toContain('Test Category');
    expect(lines[1]).toContain('9.99');
    expect(lines[2]).toContain('Beta Product');
    expect(lines[2]).toContain('14.99');
  });

  it('restores a deleted image and reports correct imported/skipped counts', async () => {
    // Delete one of the test images from disk
    await fs.promises.unlink(path.join(UPLOADS_DIR, FILE_A));

    const result = await importZip(baseUrl, zipBuf);

    expect(result).toEqual({ imported: 1, skipped: 1 });
  });

  it('restored image has the exact original file content', async () => {
    const restored = await fs.promises.readFile(path.join(UPLOADS_DIR, FILE_A));
    expect(restored).toEqual(CONTENT_A);
  });

  it('re-importing the same ZIP skips all files (idempotent)', async () => {
    // Both files exist now — full import was just run
    const result = await importZip(baseUrl, zipBuf);

    expect(result).toEqual({ imported: 0, skipped: 2 });
  });
});
