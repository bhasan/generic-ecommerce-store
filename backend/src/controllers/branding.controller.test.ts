import { describe, it, expect, vi, beforeEach } from 'vitest';

const serviceMock = vi.hoisted(() => ({
  generateCssBlock: vi.fn(),
  getBranding: vi.fn(),
}));
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
    json(b: unknown) { this.body = b; return this; },
    end() { return this; },
  };
}

describe('BrandingController.getPublicBranding', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns ONLY the curated public fields and excludes private fields', async () => {
    // Full branding object with all fields — the public endpoint must strip private ones.
    serviceMock.getBranding.mockResolvedValue({
      storeName: 'Test Store',
      logoUrl: '/logo.webp',
      faviconUrls: { '16': '/f16.png', '32': '/f32.png', '180': '/f180.png' },
      palette: 'purple-dark',
      customColors: null,
      // Private fields that must NOT appear in the public response:
      tagline: 'Secret tagline',
      heroImageUrl: '/hero.webp',
    });

    const { brandingController } = await import('./branding.controller');
    const res = mockRes();
    await brandingController.getPublicBranding({} as never, res as never);

    expect(res.statusCode).toBe(200);
    const payload = (res.body as any).data;

    // Only these five fields should appear
    expect(payload).toHaveProperty('storeName', 'Test Store');
    expect(payload).toHaveProperty('logoUrl', '/logo.webp');
    expect(payload).toHaveProperty('faviconUrls');
    expect(payload).toHaveProperty('palette', 'purple-dark');
    expect(payload).toHaveProperty('customColors', null);

    // Private fields must be absent
    expect(payload).not.toHaveProperty('tagline');
    expect(payload).not.toHaveProperty('heroImageUrl');
  });
});

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
