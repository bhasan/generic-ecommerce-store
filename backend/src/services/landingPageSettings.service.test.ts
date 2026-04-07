import { AppError } from '../middleware/error.middleware';

const prismaMock = vi.hoisted(() => ({
  uiSetting: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock('../config/database', () => ({
  default: prismaMock,
}));

describe('landing page settings service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty defaults when no persisted settings exist', async () => {
    prismaMock.uiSetting.findUnique.mockResolvedValue(null);
    const { LandingPageSettingsService } = await import('./landingPageSettings.service');

    const result = await new LandingPageSettingsService().getLandingPageSettings();

    expect(result).toEqual({ featuredProductIds: [] });
  });

  it('upserts with the correct key and returns the saved value', async () => {
    const settings = { featuredProductIds: [1, 2, 3] };
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

  it('rejects when featuredProductIds is not an array', async () => {
    const { LandingPageSettingsService } = await import('./landingPageSettings.service');

    await expect(
      new LandingPageSettingsService().updateLandingPageSettings({ featuredProductIds: 'not-an-array' } as any)
    ).rejects.toEqual(expect.any(AppError));
  });

  it('rejects when more than 12 product IDs are provided', async () => {
    const { LandingPageSettingsService } = await import('./landingPageSettings.service');

    await expect(
      new LandingPageSettingsService().updateLandingPageSettings({
        featuredProductIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
      })
    ).rejects.toEqual(expect.any(AppError));
  });

  it('rejects when IDs contain a non-positive integer', async () => {
    const { LandingPageSettingsService } = await import('./landingPageSettings.service');

    await expect(
      new LandingPageSettingsService().updateLandingPageSettings({ featuredProductIds: [1, -5, 3] })
    ).rejects.toEqual(expect.any(AppError));

    await expect(
      new LandingPageSettingsService().updateLandingPageSettings({ featuredProductIds: [1, 0, 3] })
    ).rejects.toEqual(expect.any(AppError));
  });

  it('accepts exactly 12 product IDs', async () => {
    const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const settings = { featuredProductIds: ids };
    prismaMock.uiSetting.upsert.mockResolvedValue({ value: settings });
    const { LandingPageSettingsService } = await import('./landingPageSettings.service');

    await expect(
      new LandingPageSettingsService().updateLandingPageSettings(settings)
    ).resolves.toEqual(settings);
  });
});
