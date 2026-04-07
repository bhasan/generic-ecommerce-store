import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';

export interface LandingPageSettings {
  featuredProductIds: number[];
}

const DEFAULT_LANDING_PAGE_SETTINGS: LandingPageSettings = {
  featuredProductIds: [],
};

export class LandingPageSettingsService {
  async getLandingPageSettings(): Promise<LandingPageSettings> {
    const row = await prisma.uiSetting.findUnique({
      where: { key: 'landing_page_settings' },
    });

    if (!row) {
      return DEFAULT_LANDING_PAGE_SETTINGS;
    }

    return row.value as unknown as LandingPageSettings;
  }

  async updateLandingPageSettings(data: LandingPageSettings): Promise<LandingPageSettings> {
    this.validate(data);

    const row = await prisma.uiSetting.upsert({
      where: { key: 'landing_page_settings' },
      update: { value: data as object },
      create: { key: 'landing_page_settings', value: data as object },
    });

    return row.value as unknown as LandingPageSettings;
  }

  private validate(data: LandingPageSettings): void {
    if (!data || !Array.isArray(data.featuredProductIds)) {
      throw new AppError('Invalid landing page settings: featuredProductIds must be an array', 400);
    }
    if (data.featuredProductIds.length > 12) {
      throw new AppError('Invalid landing page settings: cannot select more than 12 featured products', 400);
    }
    if (!data.featuredProductIds.every(id => Number.isInteger(id) && id > 0)) {
      throw new AppError('Invalid landing page settings: featuredProductIds must be positive integers', 400);
    }
  }
}
