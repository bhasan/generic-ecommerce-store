import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const openBuffer = vi.fn();

vi.mock('unzipper', () => ({
  default: { Open: { buffer: openBuffer } },
}));

vi.mock('../utils/fileUtils', () => ({
  UPLOADS_DIR: '/fake/uploads',
}));

const sharpMock = vi.fn();
vi.mock('sharp', () => ({ default: sharpMock }));

const brandingServiceMock = {
  updateBranding: vi.fn(),
  getBranding: vi.fn(),
  generateCssBlock: vi.fn(),
  computeColorVariants: vi.fn(),
};
vi.mock('../services/branding.service', () => ({
  BrandingService: vi.fn(() => brandingServiceMock),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEntry(entryPath: string, type: 'File' | 'Directory', content = Buffer.from('data')) {
  return { path: entryPath, type, buffer: vi.fn().mockResolvedValue(content) };
}

function makeReq(buffer?: Buffer) {
  return { file: buffer ? { buffer } : undefined } as any;
}

function makeRes() {
  const res = { json: vi.fn() } as any;
  return res;
}

function makeNext() {
  return vi.fn();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('importZip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws a 400 AppError when no file is attached', async () => {
    const { default: controller } = await import('./upload.controller');

    await expect(controller.importZip(makeReq(), makeRes())).rejects.toMatchObject({ statusCode: 400 });
  });

  it('writes new files and returns the correct imported count', async () => {
    openBuffer.mockResolvedValue({
      files: [
        makeEntry('images/abc.webp', 'File', Buffer.from('img1')),
        makeEntry('images/def.webp', 'File', Buffer.from('img2')),
      ],
    });

    // Both files are new — access throws ENOENT for both
    vi.spyOn(fs.promises, 'access').mockRejectedValue(Object.assign(new Error(), { code: 'ENOENT' }));
    const writeSpy = vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined as any);

    const { default: controller } = await import('./upload.controller');
    const res = makeRes();
    await controller.importZip(makeReq(Buffer.from('zip')), res, makeNext());

    expect(res.json).toHaveBeenCalledWith({ success: true, data: { imported: 2, skipped: 0 } });
    expect(writeSpy).toHaveBeenCalledTimes(2);
  });

  it('skips files that already exist on disk', async () => {
    openBuffer.mockResolvedValue({
      files: [
        makeEntry('images/existing.webp', 'File'),
        makeEntry('images/new.webp', 'File', Buffer.from('newdata')),
      ],
    });

    vi.spyOn(fs.promises, 'access').mockImplementation(async (p) => {
      if (String(p).endsWith('existing.webp')) return; // exists
      throw Object.assign(new Error(), { code: 'ENOENT' }); // doesn't exist
    });
    const writeSpy = vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined as any);

    const { default: controller } = await import('./upload.controller');
    const res = makeRes();
    await controller.importZip(makeReq(Buffer.from('zip')), res, makeNext());

    expect(res.json).toHaveBeenCalledWith({ success: true, data: { imported: 1, skipped: 1 } });
    expect(writeSpy).toHaveBeenCalledTimes(1);
  });

  it('ignores ZIP entries outside the images/ folder', async () => {
    openBuffer.mockResolvedValue({
      files: [
        makeEntry('products.csv', 'File'),
        makeEntry('other/photo.webp', 'File'),
        makeEntry('images/valid.webp', 'File', Buffer.from('img')),
      ],
    });

    vi.spyOn(fs.promises, 'access').mockRejectedValue(Object.assign(new Error(), { code: 'ENOENT' }));
    const writeSpy = vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined as any);

    const { default: controller } = await import('./upload.controller');
    const res = makeRes();
    await controller.importZip(makeReq(Buffer.from('zip')), res, makeNext());

    expect(res.json).toHaveBeenCalledWith({ success: true, data: { imported: 1, skipped: 0 } });
    expect(writeSpy).toHaveBeenCalledTimes(1);
  });

  it('ignores directory entries inside images/', async () => {
    openBuffer.mockResolvedValue({
      files: [
        makeEntry('images/', 'Directory'),
        makeEntry('images/sub/', 'Directory'),
        makeEntry('images/real.webp', 'File', Buffer.from('img')),
      ],
    });

    vi.spyOn(fs.promises, 'access').mockRejectedValue(Object.assign(new Error(), { code: 'ENOENT' }));
    const writeSpy = vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined as any);

    const { default: controller } = await import('./upload.controller');
    const res = makeRes();
    await controller.importZip(makeReq(Buffer.from('zip')), res, makeNext());

    expect(res.json).toHaveBeenCalledWith({ success: true, data: { imported: 1, skipped: 0 } });
    expect(writeSpy).toHaveBeenCalledTimes(1);
  });

  it('returns imported=0 skipped=0 for an empty ZIP', async () => {
    openBuffer.mockResolvedValue({ files: [] });

    const { default: controller } = await import('./upload.controller');
    const res = makeRes();
    await controller.importZip(makeReq(Buffer.from('zip')), res, makeNext());

    expect(res.json).toHaveBeenCalledWith({ success: true, data: { imported: 0, skipped: 0 } });
  });

  it('skips entries whose path resolves to only the images/ prefix (empty filename)', async () => {
    openBuffer.mockResolvedValue({
      files: [
        makeEntry('images/', 'File'), // type File but empty filename after strip
      ],
    });

    vi.spyOn(fs.promises, 'access').mockRejectedValue(Object.assign(new Error(), { code: 'ENOENT' }));
    const writeSpy = vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined as any);

    const { default: controller } = await import('./upload.controller');
    const res = makeRes();
    await controller.importZip(makeReq(Buffer.from('zip')), res, makeNext());

    expect(res.json).toHaveBeenCalledWith({ success: true, data: { imported: 0, skipped: 0 } });
    expect(writeSpy).not.toHaveBeenCalled();
  });
});

describe('uploadFavicon', () => {
  function makeSharpChain() {
    const chain: any = {};
    chain.resize = vi.fn().mockReturnValue(chain);
    chain.png = vi.fn().mockReturnValue(chain);
    chain.toFile = vi.fn().mockResolvedValue({});
    return chain;
  }

  function makeFileReq(filename = 'source.png') {
    return { file: { filename } } as any;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    sharpMock.mockImplementation(() => makeSharpChain());
    brandingServiceMock.updateBranding.mockResolvedValue({});
    vi.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined as any);
  });

  it('throws a 400 AppError when no file is attached', async () => {
    const { default: controller } = await import('./upload.controller');

    await expect(controller.uploadFavicon({ file: undefined } as any, makeRes())).rejects.toMatchObject({ statusCode: 400 });
  });

  it('generates 16, 32, and 180px PNG variants and returns their URLs', async () => {
    const { default: controller } = await import('./upload.controller');
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;

    await controller.uploadFavicon(makeFileReq(), res, makeNext());

    expect(res.status).toHaveBeenCalledWith(201);
    const { urls } = res.json.mock.calls[0][0].data;
    expect(Object.keys(urls).sort()).toEqual(['16', '180', '32']);
    expect(urls['16']).toContain('favicon-16.png');
    expect(urls['32']).toContain('favicon-32.png');
    expect(urls['180']).toContain('favicon-180.png');
  });

  it('appends a ?v= cache-busting timestamp to every favicon URL', async () => {
    const { default: controller } = await import('./upload.controller');
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;

    await controller.uploadFavicon(makeFileReq(), res, makeNext());

    const { urls } = res.json.mock.calls[0][0].data;
    for (const url of Object.values(urls) as string[]) {
      expect(url).toMatch(/\?v=\d+$/);
    }
  });

  it('calls BrandingService.updateBranding with the generated faviconUrls', async () => {
    const { default: controller } = await import('./upload.controller');
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;

    await controller.uploadFavicon(makeFileReq(), res, makeNext());

    expect(brandingServiceMock.updateBranding).toHaveBeenCalledOnce();
    const [arg] = brandingServiceMock.updateBranding.mock.calls[0];
    expect(arg).toHaveProperty('faviconUrls');
    expect(Object.keys(arg.faviconUrls).sort()).toEqual(['16', '180', '32']);
  });

  it('deletes the original uploaded file after processing', async () => {
    const unlinkSpy = vi.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined as any);
    const { default: controller } = await import('./upload.controller');
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;

    await controller.uploadFavicon(makeFileReq('upload-abc.png'), res, makeNext());

    expect(unlinkSpy).toHaveBeenCalledOnce();
    expect(String(unlinkSpy.mock.calls[0][0])).toContain('upload-abc.png');
  });
});
