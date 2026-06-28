import { describe, it, expect, vi } from 'vitest';
import { OrderCrudService } from './order.crud.service';

const prismaMock = vi.hoisted(() => ({
  order: {
    findMany: vi.fn(),
  },
}));

vi.mock('../config/database', () => ({
  default: prismaMock,
}));

describe('OrderCrudService', () => {
  it('fetches delivered orders and maps items correctly', async () => {
    const crudService = new OrderCrudService();
    prismaMock.order.findMany.mockResolvedValue([
      {
        id: 1,
        status: 'DELIVERED',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 1,
        items: [
          {
            id: 10,
            variantId: 3,
            productName: 'Product One',
            variantLabel: 'Default',
            quantity: 2,
            unitPrice: { toString: () => '10.00' },
            voided: false,
          },
        ],
      },
    ]);

    const result = await crudService.getDeliveredOrders();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
    expect(result[0].items[0].productName).toBe('Product One');
    expect(prismaMock.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'DELIVERED' },
      })
    );
  });
});
