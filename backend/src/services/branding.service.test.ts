import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearSettingsCache } from './settingsStore';
const prismaMock = vi.hoisted(() => ({
  uiSetting: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock('../config/database', () => ({
  default: prismaMock,
}));

describe('branding service', () => {
  beforeEach(() => {
    clearSettingsCache();
    vi.clearAllMocks();
  });

  it('returns defaults when no persisted branding exists', async () => {
    prismaMock.uiSetting.findUnique.mockResolvedValue(null);
    const { BrandingService } = await import('./branding.service');

    const result = await new BrandingService().getBranding();

    expect(result.storeName).toBe('');
    expect(result.tagline).toBe('');
    expect(result.logoUrl).toBe('');
    expect(result.palette).toBe('purple-dark');
    expect(result.customColors).toBeNull();
  });

  it('upserts branding settings', async () => {
    const data = { storeName: 'Acme Shop', tagline: 'Best in town', logoUrl: '/api/uploads/logo.webp', heroImageUrl: '', faviconUrls: { '16': '', '32': '', '180': '' }, palette: 'blue-dark', customColors: null };
    prismaMock.uiSetting.upsert.mockResolvedValue({ value: data });
    const { BrandingService } = await import('./branding.service');

    const result = await new BrandingService().updateBranding(data);

    expect(prismaMock.uiSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'branding' },
      update: { value: expect.any(Object) },
      create: { key: 'branding', value: expect.any(Object) },
    });
    expect(result.storeName).toBe('Acme Shop');
  });

  it('computeColorVariants derives all tokens from a hex color', async () => {
    const { BrandingService } = await import('./branding.service');
    const svc = new BrandingService();
    const tokens = (svc as any).computeColorVariants('#7c3aed');

    expect(tokens.primary).toBe('#7c3aed');
    expect(typeof tokens.primaryDark).toBe('string');
    expect(typeof tokens.primaryLight).toBe('string');
    expect(typeof tokens.primaryRgb).toBe('string');
    // RGB string has no commas
    expect(tokens.primaryRgb).not.toContain(',');
  });

  it('generateCssBlock returns a :root block string', async () => {
    prismaMock.uiSetting.findUnique.mockResolvedValue({
      value: {
        storeName: '', tagline: '', logoUrl: '', heroImageUrl: '',
        faviconUrls: { '16': '', '32': '', '180': '' },
        palette: 'purple-dark',
        customColors: {
          primary: '#7c3aed', primaryDark: '#6b21a8', primaryLight: '#a855f7',
          primaryHover: '#9333ea', primaryActive: '#5b21b6', primaryRgb: '124 58 237',
          secondary: '#10b981', secondaryDark: '#059669', secondaryLight: '#34d399',
          secondaryHover: '#0ea572', secondaryActive: '#047857', secondaryRgb: '16 185 129',
        },
      },
    });
    const { BrandingService } = await import('./branding.service');
    const css = await new BrandingService().generateCssBlock();

    expect(css).toContain(':root {');
    expect(css).toContain('--color-primary:');
    expect(css).toContain('}');
  });

  it('generateCssBlock strips customColors values that are not valid hex or RGB tokens', async () => {
    prismaMock.uiSetting.findUnique.mockResolvedValue({
      value: {
        storeName: '', tagline: '', logoUrl: '', heroImageUrl: '',
        faviconUrls: { '16': '', '32': '', '180': '' },
        palette: 'custom',
        customColors: {
          primary: '#2563eb',
          primaryDark: 'red} body{display:none}/*',
          primaryLight: 'javascript:alert(1)',
          primaryRgb: '37 99 235',
          secondary: '#059669',
          secondaryRgb: '999 999 999',
        },
      },
    });
    const { BrandingService } = await import('./branding.service');
    const css = await new BrandingService().generateCssBlock();

    expect(css).toContain('--color-primary: #2563eb');
    expect(css).toContain('--color-primary-rgb: 37 99 235');
    expect(css).toContain('--color-secondary: #059669');
    // malformed hex and non-CSS values are dropped
    expect(css).not.toContain('display:none');
    expect(css).not.toContain('javascript:');
    expect(css).not.toContain('red}');
  });

  it('auto-computes color variants when primary hex is provided on update', async () => {
    const data = {
      storeName: '', tagline: '', logoUrl: '', heroImageUrl: '',
      faviconUrls: { '16': '', '32': '', '180': '' },
      palette: 'custom',
      customColors: { primary: '#2563eb', secondary: '#059669' } as any,
    };
    prismaMock.uiSetting.upsert.mockResolvedValue({ value: { ...data, customColors: { primary: '#2563eb', primaryDark: '#1d4ed8', primaryLight: '#3b82f6', primaryHover: '#3068e8', primaryActive: '#1a45c4', primaryRgb: '37 99 235', secondary: '#059669', secondaryDark: '#047857', secondaryLight: '#34d399', secondaryHover: '#0ea572', secondaryActive: '#03614a', secondaryRgb: '5 150 105' } } });
    const { BrandingService } = await import('./branding.service');

    const result = await new BrandingService().updateBranding(data);

    expect(result.customColors?.primaryDark).toBeTruthy();
  });
});
