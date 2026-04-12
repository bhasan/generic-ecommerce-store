import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const prismaMock = {
  productItem: { findMany: vi.fn() },
  category: { findMany: vi.fn() },
};

vi.mock('../config/database', () => ({ default: prismaMock }));

// Capture what archiver appended so tests can inspect CSV content
let appendedFiles: Array<{ content?: string; entry?: string }> = [];
let archiverPiped = false;
let archiverFinalized = false;

const archiveMock = {
  on: vi.fn(),
  pipe: vi.fn(() => { archiverPiped = true; }),
  append: vi.fn((content: string, opts: { name: string }) => {
    appendedFiles.push({ content, entry: opts.name });
  }),
  file: vi.fn((_filePath: string, opts: { name: string }) => {
    appendedFiles.push({ entry: opts.name });
  }),
  finalize: vi.fn(async () => { archiverFinalized = true; }),
};

vi.mock('archiver', () => ({
  default: vi.fn(() => archiveMock),
}));

// ─── Fake response ────────────────────────────────────────────────────────────

function makeFakeRes() {
  const headers: Record<string, string> = {};
  return {
    setHeader: vi.fn((key: string, val: string) => { headers[key] = val; }),
    destroy: vi.fn(),
    _headers: headers,
  };
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: 1, name: 'Drinks' },
  { id: 2, name: 'Snacks' },
];

const PRODUCTS = [
  {
    id: 10,
    name: 'Cola',
    categoryId: 1,
    price: 2.5,
    description: 'A drink',
    stock: 20,
    stockEnabled: true,
    thumbnail: '/api/uploads/exists.webp',
    image: null,
    images: [],
  },
  {
    id: 20,
    name: 'Chips',
    categoryId: 2,
    price: 1.99,
    description: null,
    stock: 5,
    stockEnabled: false,
    thumbnail: null,
    image: null,
    images: ['/api/uploads/missing.webp'],
  },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('streamProductsExportZip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appendedFiles = [];
    archiverPiped = false;
    archiverFinalized = false;
    prismaMock.productItem.findMany.mockResolvedValue(PRODUCTS);
    prismaMock.category.findMany.mockResolvedValue(CATEGORIES);
    // Resolve access for paths ending in 'exists.webp', reject everything else
    vi.spyOn(fs.promises, 'access').mockImplementation(async (filePath) => {
      if (String(filePath).endsWith('exists.webp')) return;
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
  });

  it('sets Content-Type and Content-Disposition headers', async () => {
    const { streamProductsExportZip } = await import('./productExport.service');
    const res = makeFakeRes();
    await streamProductsExportZip(res as any);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/zip');
    expect(res._headers['Content-Disposition']).toMatch(/^attachment; filename="products-export-.+\.zip"$/);
  });

  it('pipes the archive to the response and finalizes it', async () => {
    const { streamProductsExportZip } = await import('./productExport.service');
    await streamProductsExportZip(makeFakeRes() as any);

    expect(archiverPiped).toBe(true);
    expect(archiverFinalized).toBe(true);
  });

  it('appends products.csv as the first entry', async () => {
    const { streamProductsExportZip } = await import('./productExport.service');
    await streamProductsExportZip(makeFakeRes() as any);

    expect(appendedFiles[0].entry).toBe('products.csv');
  });

  it('CSV header contains all 10 expected columns', async () => {
    const { streamProductsExportZip } = await import('./productExport.service');
    await streamProductsExportZip(makeFakeRes() as any);

    const csv = appendedFiles[0].content!;
    const header = csv.split('\r\n')[0];
    expect(header).toBe('id,name,categoryName,price,description,stock,stockEnabled,thumbnail,image,images');
  });

  it('CSV data rows contain correct product values', async () => {
    const { streamProductsExportZip } = await import('./productExport.service');
    await streamProductsExportZip(makeFakeRes() as any);

    const csv = appendedFiles[0].content!;
    const lines = csv.split('\r\n').filter(Boolean);
    expect(lines[1]).toContain('Cola');
    expect(lines[1]).toContain('Drinks');
    expect(lines[1]).toContain('exists.webp');
    expect(lines[2]).toContain('Chips');
    expect(lines[2]).toContain('Snacks');
  });

  it('stores bare filenames in image columns (no /api/uploads/ prefix)', async () => {
    const { streamProductsExportZip } = await import('./productExport.service');
    await streamProductsExportZip(makeFakeRes() as any);

    const csv = appendedFiles[0].content!;
    expect(csv).not.toContain('/api/uploads/');
    expect(csv).toContain('exists.webp');
  });

  it('includes image file that exists on disk under images/ in the ZIP', async () => {
    const { streamProductsExportZip } = await import('./productExport.service');
    await streamProductsExportZip(makeFakeRes() as any);

    const imageEntries = appendedFiles.filter(f => f.entry !== 'products.csv');
    expect(imageEntries).toHaveLength(1);
    expect(imageEntries[0].entry).toBe('images/exists.webp');
  });

  it('skips image files that do not exist on disk', async () => {
    const { streamProductsExportZip } = await import('./productExport.service');
    await streamProductsExportZip(makeFakeRes() as any);

    const entries = appendedFiles.map(f => f.entry);
    expect(entries).not.toContain('images/missing.webp');
  });

  it('deduplicates images referenced by multiple products', async () => {
    prismaMock.productItem.findMany.mockResolvedValue([
      { ...PRODUCTS[0], images: ['/api/uploads/exists.webp'] },
      { ...PRODUCTS[1], thumbnail: '/api/uploads/exists.webp', images: [] },
    ]);
    const { streamProductsExportZip } = await import('./productExport.service');
    await streamProductsExportZip(makeFakeRes() as any);

    const imageEntries = appendedFiles.filter(f => f.entry === 'images/exists.webp');
    expect(imageEntries).toHaveLength(1);
  });

  it('produces a valid CSV with empty image fields for products with no images', async () => {
    prismaMock.productItem.findMany.mockResolvedValue([
      { id: 1, name: 'NoImg', categoryId: 1, price: 1, description: null,
        stock: 0, stockEnabled: false, thumbnail: null, image: null, images: [] },
    ]);
    const { streamProductsExportZip } = await import('./productExport.service');
    await streamProductsExportZip(makeFakeRes() as any);

    const csv = appendedFiles[0].content!;
    const dataRow = csv.split('\r\n')[1];
    // thumbnail, image, images columns should all be empty
    expect(dataRow).toMatch(/,,,$/);
  });

  it('correctly escapes commas and quotes in product names', async () => {
    prismaMock.productItem.findMany.mockResolvedValue([
      { id: 1, name: 'Say "Hello", World', categoryId: 1, price: 1, description: null,
        stock: 0, stockEnabled: false, thumbnail: null, image: null, images: [] },
    ]);
    const { streamProductsExportZip } = await import('./productExport.service');
    await streamProductsExportZip(makeFakeRes() as any);

    const csv = appendedFiles[0].content!;
    expect(csv).toContain('"Say ""Hello"", World"');
  });
});
