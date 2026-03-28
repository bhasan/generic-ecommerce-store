import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';

export interface OrderingConstraints {
  minimumDeliveryOrder: number;
  minimumDeliveryOrderEnabled: boolean;
}

const DEFAULT_ORDERING_CONSTRAINTS: OrderingConstraints = {
  minimumDeliveryOrder: 35,
  minimumDeliveryOrderEnabled: true,
};

export class OrderingConstraintsService {
  async getOrderingConstraints(): Promise<OrderingConstraints> {
    const row = await prisma.uiSetting.findUnique({
      where: { key: 'ordering_constraints' },
    });

    if (!row) {
      return DEFAULT_ORDERING_CONSTRAINTS;
    }

    return row.value as unknown as OrderingConstraints;
  }

  async updateOrderingConstraints(data: OrderingConstraints): Promise<OrderingConstraints> {
    this.validate(data);

    const row = await prisma.uiSetting.upsert({
      where: { key: 'ordering_constraints' },
      update: { value: data as object },
      create: { key: 'ordering_constraints', value: data as object },
    });

    return row.value as unknown as OrderingConstraints;
  }

  private validate(data: OrderingConstraints): void {
    if (!data || typeof data.minimumDeliveryOrder !== 'number') {
      throw new AppError('Invalid ordering constraints: minimumDeliveryOrder must be a number', 400);
    }
    if (data.minimumDeliveryOrder < 0) {
      throw new AppError('Invalid ordering constraints: minimumDeliveryOrder must be 0 or greater', 400);
    }
    if (typeof data.minimumDeliveryOrderEnabled !== 'boolean') {
      throw new AppError('Invalid ordering constraints: minimumDeliveryOrderEnabled must be a boolean', 400);
    }
  }
}
