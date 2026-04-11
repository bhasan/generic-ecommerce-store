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
    });
  });

  it('upserts validated ordering constraints', async () => {
    const savedSettings = {
      minimumDeliveryOrder: 50,
      minimumDeliveryOrderEnabled: false,
      deliveryDisabled: false,
      deliveryDisabledMessage: '',
    };
    prismaMock.uiSetting.upsert.mockResolvedValue({ value: savedSettings });
    const { OrderingConstraintsService } = await import('./orderingConstraints.service');

    const result = await new OrderingConstraintsService().updateOrderingConstraints(savedSettings);

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
    })).rejects.toEqual(expect.any(AppError));
  });
});
