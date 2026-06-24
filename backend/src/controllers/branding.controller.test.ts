import { describe, it, expect, vi, beforeEach } from 'vitest';

const serviceMock = vi.hoisted(() => ({ generateCssBlock: vi.fn() }));
vi.mock('../services/branding.service', () => ({
  BrandingService: vi.fn(() => serviceMock),
}));

function mockRes() {
  const headers: Record<string, string> = {};
  return {
    headers,
    statusCode: 0,
    body: undefined as unknown,
    setHeader(k: string, v: string) { headers[k] = v; },
    status(c: number) { this.statusCode = c; return this; },
    send(b: unknown) { this.body = b; return this; },
    end() { return this; },
  };
}

describe('BrandingController.getCss', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets a public, revalidatable Cache-Control and an ETag (not no-store)', async () => {
    serviceMock.generateCssBlock.mockResolvedValue(':root{--c:#fff}');
    const { brandingController } = await import('./branding.controller');
    const res = mockRes();
    await brandingController.getCss({ headers: {} } as never, res as never);
    expect(res.headers['Cache-Control']).not.toContain('no-store');
    expect(res.headers['Cache-Control']).toMatch(/max-age=\d+/);
    expect(res.headers['ETag']).toBeTruthy();
    expect(res.statusCode).toBe(200);
  });

  it('returns 304 when If-None-Match matches the current ETag', async () => {
    serviceMock.generateCssBlock.mockResolvedValue(':root{--c:#fff}');
    const { brandingController } = await import('./branding.controller');
    const first = mockRes();
    await brandingController.getCss({ headers: {} } as never, first as never);
    const etag = first.headers['ETag'];
    const second = mockRes();
    await brandingController.getCss({ headers: { 'if-none-match': etag } } as never, second as never);
    expect(second.statusCode).toBe(304);
  });
});
