import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppError } from '../middleware/error.middleware';

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

describe('ordering constraints service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns defaults when no persisted settings exist', async () => {
    prismaMock.uiSetting.findUnique.mockResolvedValue(null);
    const { OrderingConstraintsService } = await import('./orderingConstraints.service');

    const result = await new OrderingConstraintsService().getOrderingConstraints();

    expect(result).toEqual({
      minimumDeliveryOrder: 35,
      minimumDeliveryOrderEnabled: true,
      deliveryDisabled: false,
      deliveryDisabledMessage: '',
      deliveryRadiusMiles: 5,
      offlineZipFallbackEnabled: true,
      offlineDeliveryZipCodes: [],
    });
  });

  it('upserts validated ordering constraints and normalizes ZIP codes', async () => {
    const savedSettings = {
      minimumDeliveryOrder: 50,
      minimumDeliveryOrderEnabled: false,
      deliveryDisabled: false,
      deliveryDisabledMessage: '',
      deliveryRadiusMiles: 7.5,
      offlineZipFallbackEnabled: true,
      offlineDeliveryZipCodes: ['77082', '77083', '77498'],
    };
    prismaMock.uiSetting.upsert.mockResolvedValue({ value: savedSettings });
    const { OrderingConstraintsService } = await import('./orderingConstraints.service');

    const result = await new OrderingConstraintsService().updateOrderingConstraints({
      minimumDeliveryOrder: 50,
      minimumDeliveryOrderEnabled: false,
      deliveryDisabled: false,
      deliveryDisabledMessage: '',
      deliveryRadiusMiles: 7.5,
      offlineZipFallbackEnabled: true,
      offlineDeliveryZipCodes: ['77083', '77082', '77083-1234', '77498'],
    });

    expect(prismaMock.uiSetting.upsert).toHaveBeenCalledWith({
      where: { key: 'ordering_constraints' },
      update: { value: savedSettings },
      create: { key: 'ordering_constraints', value: savedSettings },
    });
    expect(result).toEqual(savedSettings);
  });

  it('rejects negative minimum delivery orders', async () => {
    const { OrderingConstraintsService } = await import('./orderingConstraints.service');

    await expect(new OrderingConstraintsService().updateOrderingConstraints({
      minimumDeliveryOrder: -1,
      minimumDeliveryOrderEnabled: true,
      deliveryDisabled: false,
      deliveryDisabledMessage: '',
      deliveryRadiusMiles: 5,
      offlineZipFallbackEnabled: false,
      offlineDeliveryZipCodes: [],
    })).rejects.toEqual(expect.any(AppError));
  });

  it('merges persisted legacy rows with new defaults', async () => {
    prismaMock.uiSetting.findUnique.mockResolvedValue({
      value: {
        minimumDeliveryOrder: 42,
        minimumDeliveryOrderEnabled: true,
      },
    });
    const { OrderingConstraintsService } = await import('./orderingConstraints.service');

    const result = await new OrderingConstraintsService().getOrderingConstraints();

    expect(result).toEqual({
      minimumDeliveryOrder: 42,
      minimumDeliveryOrderEnabled: true,
      deliveryDisabled: false,
      deliveryDisabledMessage: '',
      deliveryRadiusMiles: 5,
      offlineZipFallbackEnabled: true,
      offlineDeliveryZipCodes: [],
    });
  });
});
