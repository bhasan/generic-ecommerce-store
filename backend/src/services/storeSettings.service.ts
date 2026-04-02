import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';

export interface StoreSettings {
  name: string;
  address: string;
  phoneNumber: string;
}

const DEFAULT_STORE_SETTINGS: StoreSettings = {
  name: 'Smoke Station',
  address: '9400 S Texas 6 Suite C, Houston, TX 77083',
  phoneNumber: '',
};

export class StoreSettingsService {
  async getStoreSettings(): Promise<StoreSettings> {
    const row = await prisma.uiSetting.findUnique({
      where: { key: 'store_settings' },
    });

    if (!row) {
      return DEFAULT_STORE_SETTINGS;
    }

    return row.value as unknown as StoreSettings;
  }

  async updateStoreSettings(data: StoreSettings): Promise<StoreSettings> {
    this.validate(data);

    const row = await prisma.uiSetting.upsert({
      where: { key: 'store_settings' },
      update: { value: data as object },
      create: { key: 'store_settings', value: data as object },
    });

    return row.value as unknown as StoreSettings;
  }

  private validate(data: StoreSettings): void {
    if (!data || typeof data.name !== 'string') {
      throw new AppError('Invalid store settings: name must be a string', 400);
    }
    if (typeof data.address !== 'string') {
      throw new AppError('Invalid store settings: address must be a string', 400);
    }
    if (typeof data.phoneNumber !== 'string') {
      throw new AppError('Invalid store settings: phoneNumber must be a string', 400);
    }
    if (data.name.length > 128) {
      throw new AppError('Invalid store settings: name must be 128 characters or fewer', 400);
    }
    if (data.address.length > 256) {
      throw new AppError('Invalid store settings: address must be 256 characters or fewer', 400);
    }
    if (data.phoneNumber.length > 32) {
      throw new AppError('Invalid store settings: phoneNumber must be 32 characters or fewer', 400);
    }
  }
}
