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

vi.mock('sharp', () => ({ default: vi.fn() }));

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

  it('calls next with a 400 AppError when no file is attached', async () => {
    const { default: controller } = await import('./upload.controller');
    const next = makeNext();

    await controller.importZip(makeReq(), makeRes(), next);

    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 400 });
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

    expect(res.json).toHaveBeenCalledWith({ imported: 2, skipped: 0 });
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

    expect(res.json).toHaveBeenCalledWith({ imported: 1, skipped: 1 });
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

    expect(res.json).toHaveBeenCalledWith({ imported: 1, skipped: 0 });
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

    expect(res.json).toHaveBeenCalledWith({ imported: 1, skipped: 0 });
    expect(writeSpy).toHaveBeenCalledTimes(1);
  });

  it('returns imported=0 skipped=0 for an empty ZIP', async () => {
    openBuffer.mockResolvedValue({ files: [] });

    const { default: controller } = await import('./upload.controller');
    const res = makeRes();
    await controller.importZip(makeReq(Buffer.from('zip')), res, makeNext());

    expect(res.json).toHaveBeenCalledWith({ imported: 0, skipped: 0 });
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

    expect(res.json).toHaveBeenCalledWith({ imported: 0, skipped: 0 });
    expect(writeSpy).not.toHaveBeenCalled();
  });
});
