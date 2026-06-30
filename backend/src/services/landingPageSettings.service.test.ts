import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppError } from '../middleware/error.middleware';
import { clearSettingsCache } from './settingsStore';

const prismaMock = vi.hoisted(() => ({
  uiSetting: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock('../config/database', () => ({
  default: prismaMock,
  getTenantPrisma: () => prismaMock,
  getUnscopedPrisma: () => prismaMock,
}));

describe('landing page settings service', () => {
  beforeEach(() => {
    clearSettingsCache();
    vi.clearAllMocks();
  });

  it('returns empty defaults when no persisted settings exist', async () => {
    prismaMock.uiSetting.findUnique.mockResolvedValue(null);
    const { LandingPageSettingsService } = await import('./landingPageSettings.service');

    const result = await new LandingPageSettingsService().getLandingPageSettings();

    expect(result).toEqual({ featuredProductIds: [], promotions: [] });
  });

  it('fills in missing promotions field for rows saved before the field was added', async () => {
    prismaMock.uiSetting.findUnique.mockResolvedValue({ value: { featuredProductIds: [1, 2] } });
    const { LandingPageSettingsService } = await import('./landingPageSettings.service');

    const result = await new LandingPageSettingsService().getLandingPageSettings();

    expect(result).toEqual({ featuredProductIds: [1, 2], promotions: [] });
  });

  it('upserts with the correct key and returns the saved value', async () => {
    const settings = { featuredProductIds: [1, 2, 3], promotions: [] };
    prismaMock.uiSetting.upsert.mockResolvedValue({ value: settings });
    const { LandingPageSettingsService } = await import('./landingPageSettings.service');

    const result = await new LandingPageSettingsService().updateLandingPageSettings(settings);

    expect(prismaMock.uiSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'landing_page_settings' },
      update: { value: settings },
      create: { key: 'landing_page_settings', value: settings },
    });
    expect(result).toEqual(settings);
  });

  it('accepts valid promotion slides', async () => {
    const settings = {
      featuredProductIds: [],
      promotions: [
        { url: '/api/uploads/banner.webp', description: 'Summer sale' },
        { url: '/api/uploads/promo2.webp', description: '' },
      ],
    };
    prismaMock.uiSetting.upsert.mockResolvedValue({ value: settings });
    const { LandingPageSettingsService } = await import('./landingPageSettings.service');

    await expect(
      new LandingPageSettingsService().updateLandingPageSettings(settings)
    ).resolves.toEqual(settings);
  });

  it('rejects when featuredProductIds is not an array', async () => {
    const { LandingPageSettingsService } = await import('./landingPageSettings.service');

    await expect(
      new LandingPageSettingsService().updateLandingPageSettings({ featuredProductIds: 'not-an-array', promotions: [] } as any)
    ).rejects.toEqual(expect.any(AppError));
  });

  it('rejects when more than 12 product IDs are provided', async () => {
    const { LandingPageSettingsService } = await import('./landingPageSettings.service');

    await expect(
      new LandingPageSettingsService().updateLandingPageSettings({
        featuredProductIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
        promotions: [],
      })
    ).rejects.toEqual(expect.any(AppError));
  });

  it('rejects when IDs contain a non-positive integer', async () => {
    const { LandingPageSettingsService } = await import('./landingPageSettings.service');

    await expect(
      new LandingPageSettingsService().updateLandingPageSettings({ featuredProductIds: [1, -5, 3], promotions: [] })
    ).rejects.toEqual(expect.any(AppError));

    await expect(
      new LandingPageSettingsService().updateLandingPageSettings({ featuredProductIds: [1, 0, 3], promotions: [] })
    ).rejects.toEqual(expect.any(AppError));
  });

  it('accepts exactly 12 product IDs', async () => {
    const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const settings = { featuredProductIds: ids, promotions: [] };
    prismaMock.uiSetting.upsert.mockResolvedValue({ value: settings });
    const { LandingPageSettingsService } = await import('./landingPageSettings.service');

    await expect(
      new LandingPageSettingsService().updateLandingPageSettings(settings)
    ).resolves.toEqual(settings);
  });

  it('rejects when promotions is not an array', async () => {
    const { LandingPageSettingsService } = await import('./landingPageSettings.service');

    await expect(
      new LandingPageSettingsService().updateLandingPageSettings({ featuredProductIds: [], promotions: 'bad' } as any)
    ).rejects.toEqual(expect.any(AppError));
  });

  it('rejects when more than 20 promotion slides are provided', async () => {
    const { LandingPageSettingsService } = await import('./landingPageSettings.service');

    await expect(
      new LandingPageSettingsService().updateLandingPageSettings({
        featuredProductIds: [],
        promotions: Array.from({ length: 21 }, (_, i) => ({ url: `/api/uploads/${i}.webp`, description: '' })),
      })
    ).rejects.toEqual(expect.any(AppError));
  });

  it('rejects a promotion slide with an empty url', async () => {
    const { LandingPageSettingsService } = await import('./landingPageSettings.service');

    await expect(
      new LandingPageSettingsService().updateLandingPageSettings({
        featuredProductIds: [],
        promotions: [{ url: '', description: 'Summer sale' }],
      })
    ).rejects.toEqual(expect.any(AppError));
  });

  it('rejects a promotion slide with a non-string description', async () => {
    const { LandingPageSettingsService } = await import('./landingPageSettings.service');

    await expect(
      new LandingPageSettingsService().updateLandingPageSettings({
        featuredProductIds: [],
        promotions: [{ url: '/api/uploads/promo.webp', description: 42 }] as any,
      })
    ).rejects.toEqual(expect.any(AppError));
  });
});
