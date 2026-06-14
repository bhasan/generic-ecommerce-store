import { z } from 'zod';
import { SettingsStore } from './settingsStore';

const PromotionSchema = z.object({
  url: z.string().trim().min(1, 'Invalid landing page settings: each promotion must have a non-empty url'),
  description: z.string('Invalid landing page settings: each promotion description must be a string'),
});

const LandingPageSettingsSchema = z.object({
  featuredProductIds: z
    .array(
      z.number().int().positive('Invalid landing page settings: featuredProductIds must be positive integers'),
      { error: 'Invalid landing page settings: featuredProductIds must be an array' }
    )
    .max(12, 'Invalid landing page settings: cannot select more than 12 featured products'),
  promotions: z
    .array(PromotionSchema, { error: 'Invalid landing page settings: promotions must be an array' })
    .max(20, 'Invalid landing page settings: cannot have more than 20 promotion slides'),
});

export type LandingPageSettings = z.infer<typeof LandingPageSettingsSchema>;

const DEFAULT_LANDING_PAGE_SETTINGS: LandingPageSettings = {
  featuredProductIds: [],
  promotions: [],
};

const store = new SettingsStore<LandingPageSettings>({
  key: 'landing_page_settings',
  schema: LandingPageSettingsSchema,
  defaults: DEFAULT_LANDING_PAGE_SETTINGS,
});

export class LandingPageSettingsService {
  async getLandingPageSettings(): Promise<LandingPageSettings> {
    return store.read();
  }

  async updateLandingPageSettings(data: LandingPageSettings): Promise<LandingPageSettings> {
    return store.write(data);
  }
}
