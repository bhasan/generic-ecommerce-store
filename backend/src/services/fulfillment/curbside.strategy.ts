import { DeliveryMethodEnum } from '../../../generated/prisma';
import { AppError } from '../../middleware/error.middleware';
import { FulfillmentStrategy, FulfillmentContext, FulfillmentOrderFields } from './FulfillmentStrategy';

export class CurbsideFulfillmentStrategy implements FulfillmentStrategy {
  readonly method = DeliveryMethodEnum.CURBSIDE;

  async validate(ctx: FulfillmentContext): Promise<void> {
    if (!ctx.vehicleDescription?.trim()) {
      throw new AppError('Vehicle description is required for curbside orders', 400);
    }
  }

  async buildOrderFields(ctx: FulfillmentContext): Promise<FulfillmentOrderFields> {
    return {
      vehicleDescription: ctx.vehicleDescription!.trim(),
    };
  }

  async onCheckIn(_orderId: number, parkingSpot: string): Promise<FulfillmentOrderFields> {
    return { parkingSpot: parkingSpot.trim() };
  }
}
